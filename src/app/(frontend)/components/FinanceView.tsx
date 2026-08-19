'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { ParticipantSelector } from './ParticipantSelector'
import { SelectedParticipantHeader } from './SelectedParticipantHeader'
import { ExpensesFeed } from './ExpensesFeed'
import { ExpenseComposer } from './ExpenseComposer'
import { PersonView } from './PersonView'
import { FinanceViewSkeleton } from './Skeleton'
import {
  ClaimBanner,
  ClaimDialog,
  ClaimResultModal,
  submitClaim,
  type ClaimSubmitOutcome,
} from './ClaimFlow'
import {
  anonymousViewer,
  selectableParticipants,
  type FinanceViewer,
  type LockedParticipant,
} from '@/lib/financeAccess'
import { ownJointAccounts } from '@/lib/expenseAuthoring'
import type { ViewerClaim } from '@/lib/claimRequests'
import { track } from '@/lib/analytics'
import type { Chata, Participant, Expense, Prepayment, JointAccount } from '@/payload-types'
import type { ChataStats } from '@/utils/calculateStats'

interface FinanceViewProps {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  prepayments: Prepayment[]
  jointAccounts?: JointAccount[]
  stats: ChataStats
  viewer?: FinanceViewer
  locked?: LockedParticipant[]
  /** participant ids with a pending claim request (docs/PRD-claim.md) */
  pendingClaims?: number[]
  /** the signed-in viewer's own claim requests in this chata */
  viewerClaims?: ViewerClaim[]
  urlParticipantId?: number | null
  onParticipantChange?: (participantId: number | null) => void
  /** opens the all-participants overview (?view=finance-overview) */
  onOpenOverview?: () => void
  /** silent data reload after authoring an expense (create/edit/delete) */
  onDataChanged?: () => Promise<void> | void
}

// localStorage key prefix for selected participant
const STORAGE_KEY_PREFIX = 'chata-selected-participant-'

export function FinanceView({
  chata,
  participants,
  expenses,
  prepayments,
  jointAccounts = [],
  stats,
  viewer = anonymousViewer,
  locked = [],
  pendingClaims = [],
  viewerClaims = [],
  urlParticipantId,
  onParticipantChange,
  onOpenOverview,
  onDataChanged,
}: FinanceViewProps) {
  const t = useTranslations('finance')
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  // Frontend expense authoring: null = closed, { expense: null } = new,
  // { expense } = edit, markPaid = confirming a planned expense was paid.
  // Only for signed-in accounts with a participant here.
  const [composer, setComposer] = useState<{
    expense: Expense | null
    markPaid?: boolean
  } | null>(null)
  const canAuthor = viewer.authenticated && viewer.linkedParticipantIds.length > 0

  // Deep link from the homepage hero ("Přidat výdaj" on the live chata):
  // ?addExpense=1 opens the composer once, then drops the param
  useEffect(() => {
    if (!canAuthor) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('addExpense')) {
      url.searchParams.delete('addExpense')
      window.history.replaceState({}, '', url)
      setComposer({ expense: null })
    }
  }, [canAuthor])

  // ─── Participant claiming ("Jsi to ty?" — docs/PRD-claim.md) ─────────────
  const [claimDialogFor, setClaimDialogFor] = useState<Participant | null>(null)
  const [claimResult, setClaimResult] = useState<{
    outcome: ClaimSubmitOutcome
    participant: Participant | null
  } | null>(null)
  const [claimBusyId, setClaimBusyId] = useState<number | null>(null)

  const lockedIds = useMemo(() => new Set(locked.map((l) => l.id)), [locked])
  // Claimable = visible to anonymous visitors (not locked behind an active
  // account) and not already the viewer's own
  const isClaimable = (p: Participant) =>
    !lockedIds.has(p.id) && !viewer.linkedParticipantIds.includes(p.id)

  const doSubmitClaim = async (participant: Participant) => {
    setClaimBusyId(participant.id)
    try {
      const outcome = await submitClaim(participant.id)
      if (outcome.kind === 'approved' || outcome.kind === 'pending') {
        await onDataChanged?.()
      }
      setClaimResult({ outcome, participant })
    } finally {
      setClaimBusyId(null)
    }
  }

  const withdrawClaim = async (claimId: number) => {
    setClaimBusyId(claimId)
    try {
      const res = await fetch(`/api/claim-requests/${claimId}/cancel`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (res.ok) await onDataChanged?.()
    } finally {
      setClaimBusyId(null)
    }
  }

  // Claim continuation: ?claim=<participantId> arrives back from a login
  // flow (the intent rode in returnTo). Signed in → submit right away;
  // still anonymous (e.g. a shared link) → open the claim dialog instead.
  useEffect(() => {
    const url = new URL(window.location.href)
    const claimParam = url.searchParams.get('claim')
    if (!claimParam) return
    url.searchParams.delete('claim')
    window.history.replaceState({}, '', url)
    const participant = participants.find((p) => p.id === parseInt(claimParam, 10))
    if (!participant || lockedIds.has(participant.id)) return
    if (viewer.authenticated) {
      if (!viewer.linkedParticipantIds.includes(participant.id)) {
        void doSubmitClaim(participant)
      }
    } else {
      setClaimDialogFor(participant)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Výdaj za jiného plátce": the payer, the banker and the chata's admins
  // can settle a pending expense straight from its card. The endpoint
  // re-checks all of that server-side (Expenses /decide).
  const handleDecideApproval = async (
    expense: Expense,
    action: 'approve' | 'reject',
    reason: string,
  ) => {
    const res = await fetch('/api/expenses/decide', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenseId: expense.id, action, reason }),
    })
    if (!res.ok) {
      track('save_failed', { operation: 'expense_decide', status: res.status })
      throw new Error('Decide failed')
    }
    await onDataChanged?.()
  }

  const handleDeleteExpense = async (expense: Expense) => {
    const res = await fetch(`/api/expenses/${expense.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    })
    if (!res.ok) {
      track('save_failed', { operation: 'expense_delete', status: res.status })
      throw new Error('Delete failed')
    }
    await onDataChanged?.()
  }

  // Handle banker ID
  const bankerId =
    typeof chata.banker === 'object' && chata.banker !== null
      ? chata.banker.id
      : chata.banker

  // Who confirms an expense recorded for somebody else, whoever the payer
  // is: the chata's admins and the banker ("pokladník"). Being the payer
  // yourself, or a member of the joint account named as payer, is decided
  // per card in the feed.
  const canApproveAll =
    viewer.canViewAll ||
    (bankerId != null && viewer.linkedParticipantIds.includes(bankerId as number))

  // Creditor bank fields ship only to chata admins and the banker's account
  // (compliance blocker 1) — the same circle that may approve everything.
  // When the viewer is neither, the banker card explains that signing in is
  // what reveals the accounts (decision 13).
  const creditorAccountsHidden = !canApproveAll
  const ownJointAccountIds = ownJointAccounts(
    viewer.linkedParticipantIds.map(String),
    jointAccounts,
  ).map((ja) => ja.id)

  // Which participants this viewer may open: admins of the chata see all,
  // a linked user only their own, anonymous everyone except locked
  // participants — active accounts (see lib/financeAccess)
  const allowedParticipants = useMemo(
    () => selectableParticipants(viewer, participants, locked),
    [viewer, participants, locked]
  )

  // Locked participants shown greyed-out at the bottom of the selector —
  // only relevant for the anonymous-style selector (admins see everyone;
  // linked users never reach the selector)
  const lockedForSelector = useMemo(() => {
    if (viewer.canViewAll || viewer.linkedParticipantIds.length > 0) return []
    return locked.flatMap((l) => {
      const participant = participants.find((p) => p.id === l.id)
      return participant ? [{ participant, maskedEmail: l.maskedEmail }] : []
    })
  }, [viewer, participants, locked])

  // Load from URL param (priority), localStorage, or the viewer's own
  // linked participant on mount — always restricted to the allowed set
  useEffect(() => {
    const storageKey = `${STORAGE_KEY_PREFIX}${chata.id}`
    const isAllowed = (id: number) => allowedParticipants.some((p) => p.id === id)

    // URL param takes priority over localStorage
    if (urlParticipantId != null && isAllowed(urlParticipantId)) {
      setSelectedParticipantId(urlParticipantId)
      // Also save to localStorage so it persists
      localStorage.setItem(storageKey, String(urlParticipantId))
      setIsHydrated(true)
      return
    }

    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const storedId = parseInt(stored, 10)
      if (isAllowed(storedId)) {
        setSelectedParticipantId(storedId)
        // Sync URL with localStorage selection
        onParticipantChange?.(storedId)
        setIsHydrated(true)
        return
      }
    }

    // Signed-in with linked participant(s): preselect the first own one
    // (plain users can then switch only among their own; admins among all)
    const ownDefault = viewer.linkedParticipantIds.find((id) => isAllowed(id))
    if (ownDefault != null) {
      setSelectedParticipantId(ownDefault)
      localStorage.setItem(storageKey, String(ownDefault))
      onParticipantChange?.(ownDefault)
    }

    setIsHydrated(true)
  }, [chata.id, allowedParticipants, urlParticipantId, onParticipantChange, viewer.linkedParticipantIds])

  // Save to localStorage and notify parent when selection changes
  const handleSelectParticipant = (participantId: number) => {
    if (!allowedParticipants.some((p) => p.id === participantId)) return
    setSelectedParticipantId(participantId)
    const storageKey = `${STORAGE_KEY_PREFIX}${chata.id}`
    localStorage.setItem(storageKey, String(participantId))
    onParticipantChange?.(participantId)
  }

  // Show skeleton during hydration (very brief, usually unnoticeable)
  if (!isHydrated) {
    return <FinanceViewSkeleton />
  }

  // Claim dialogs/modals — portaled, shared by both view states. A user
  // who already owns a participant in this chata gets no claim UI: one
  // participant per account and chata is the supported self-service path
  // (admins link children/partners in the panel).
  const claimUi = (
    <>
      {claimDialogFor && (
        <ClaimDialog
          participant={claimDialogFor}
          chataName={chata.name}
          onClose={() => setClaimDialogFor(null)}
        />
      )}
      {claimResult && (
        <ClaimResultModal
          outcome={claimResult.outcome}
          participant={claimResult.participant}
          onClose={() => setClaimResult(null)}
        />
      )}
    </>
  )

  // Subtle escape hatch: the all-participants overview for checking numbers
  const overviewLink = onOpenOverview ? (
    <p className="text-center text-sm text-white/60">
      {t('financeView.overviewQuestion')}{' '}
      <button
        onClick={onOpenOverview}
        className="text-white/90 font-semibold underline underline-offset-2 hover:text-white transition-colors"
      >
        {t('financeView.overviewLink')}
      </button>
    </p>
  ) : null

  // Authoring: FAB (desktop pill with label, mobile round above the thumb)
  // + the composer modal/wizard. Signed-in accounts with a participant only.
  // Portaled to <body>: the view lives in a `relative z-10` container and the
  // site footer (also z-10, later in the DOM) would otherwise paint its glass
  // OVER the fixed button — the portal escapes that stacking context so the
  // FAB stays on top and clickable everywhere.
  const authoringUi = canAuthor ? (
    <>
      {createPortal(
        <button
          type="button"
          onClick={() => setComposer({ expense: null })}
          aria-label={t('financeView.addExpense')}
          className="expense-fab fixed z-40 bottom-6 right-5 lg:bottom-8 lg:right-8 flex items-center
                     justify-center gap-2 rounded-full bg-primary hover:bg-primary-dark
                     text-white font-semibold text-[15px] w-14 h-14 lg:w-auto lg:h-auto
                     lg:px-6 lg:py-3.5 shadow-xl shadow-primary/50 transition-colors"
        >
          <Plus size={22} strokeWidth={2.5} />
          <span className="hidden lg:inline">{t('financeView.addExpense')}</span>
        </button>,
        document.body
      )}
      {composer && (
        <ExpenseComposer
          chata={chata}
          participants={participants}
          jointAccounts={jointAccounts}
          viewer={viewer}
          expense={composer.expense}
          markPaid={composer.markPaid}
          onClose={() => setComposer(null)}
          onSaved={async () => {
            await onDataChanged?.()
            setComposer(null)
          }}
        />
      )}
    </>
  ) : null

  // State 1: No participant selected - show full-width selector
  if (!selectedParticipantId) {
    return (
      <div className="w-full flex flex-col gap-6">
        <ParticipantSelector
          participants={allowedParticipants}
          onSelectParticipant={handleSelectParticipant}
          bankerId={bankerId}
          lockedParticipants={lockedForSelector}
          showClaimHints={!viewer.canViewAll && viewer.linkedParticipantIds.length === 0}
          pendingClaimIds={pendingClaims}
        />
        {overviewLink}
        {authoringUi}
        {claimUi}
      </div>
    )
  }

  // State 2: Participant selected - show compact header + content
  const selectedParticipant = allowedParticipants.find((p) => p.id === selectedParticipantId)
  const selectedStats = selectedParticipant
    ? stats.participants[selectedParticipant.name]
    : null

  if (!selectedParticipant || !selectedStats) {
    // Selected participant no longer exists, reset selection
    setSelectedParticipantId(null)
    return null
  }

  const isBanker = selectedParticipant.id === bankerId

  // "Jsi to ty?" banner under the header: offer the claim to anonymous
  // visitors and signed-in users without this participant; flip to the
  // waiting state while their own request is pending. Admins never see it.
  const ownPendingClaim = viewerClaims.find(
    (c) => c.participantId === selectedParticipant.id && c.status === 'pending'
  )
  const claimBanner = viewer.canViewAll ? null : ownPendingClaim ? (
    <ClaimBanner
      participant={selectedParticipant}
      ownPendingCreatedAt={ownPendingClaim.createdAt}
      busy={claimBusyId !== null}
      onWithdraw={() => void withdrawClaim(ownPendingClaim.id)}
    />
  ) : isClaimable(selectedParticipant) ? (
    <ClaimBanner
      participant={selectedParticipant}
      pendingByOther={pendingClaims.includes(selectedParticipant.id)}
      busy={claimBusyId !== null}
      onClaim={() =>
        viewer.authenticated
          ? void doSubmitClaim(selectedParticipant)
          : setClaimDialogFor(selectedParticipant)
      }
    />
  ) : null

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Compact participant header + the "Jsi to ty?" banner. On wide
          screens the two share one row, split on the same [320px_1fr] grid
          as the content below so they line up with the expenses sidebar and
          the finance panel; stacked full width otherwise.
          "Změnit" also shows when only LOCKED participants remain — it then
          falls back to clearing the selection so the visitor can reach the
          selector with the greyed-out locked tiles (login + claim hints) */}
      <div
        className={
          claimBanner ? 'flex flex-col gap-6 lg:grid lg:grid-cols-[320px_1fr] lg:gap-8' : undefined
        }
      >
        <SelectedParticipantHeader
          selectedParticipant={selectedParticipant}
          participants={allowedParticipants}
          onChangeParticipant={handleSelectParticipant}
          bankerId={bankerId}
          canChange={allowedParticipants.length > 1 || lockedForSelector.length > 0}
          onClearSelection={() => {
            setSelectedParticipantId(null)
            localStorage.removeItem(`${STORAGE_KEY_PREFIX}${chata.id}`)
            onParticipantChange?.(null)
          }}
        />

        {claimBanner}
      </div>

      {/* Main content area */}
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 flex flex-col gap-8">
        {/* Sidebar - now only expenses */}
        <aside className="order-2 lg:order-1">
          <ExpensesFeed
            expenses={expenses}
            selectedParticipantId={selectedParticipantId}
            viewerUserId={canAuthor ? viewer.userId : null}
            onEditExpense={(expense) => setComposer({ expense })}
            onMarkExpensePaid={(expense) => setComposer({ expense, markPaid: true })}
            onDeleteExpense={handleDeleteExpense}
            canApproveAll={canApproveAll}
            ownJointAccountIds={ownJointAccountIds}
            onDecideApproval={handleDecideApproval}
            showLoginHint={!viewer.authenticated}
          />
        </aside>

        {/* Main content */}
        <section className="flex-1 order-1 lg:order-2 min-w-0">
          <PersonView
            participant={selectedParticipant}
            stats={selectedStats}
            isBanker={isBanker}
            chata={chata}
            allParticipants={participants}
            creditors={stats.creditors}
            debtors={stats.debtors}
            prepayments={prepayments}
            expenses={expenses}
            showHeader={false}
            creditorAccountsHidden={creditorAccountsHidden}
          />
        </section>
      </div>

      {overviewLink}
      {authoringUi}
      {claimUi}
    </div>
  )
}
