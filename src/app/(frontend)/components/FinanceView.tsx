'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { ParticipantSelector } from './ParticipantSelector'
import { SelectedParticipantHeader } from './SelectedParticipantHeader'
import { ExpensesFeed } from './ExpensesFeed'
import { ExpenseComposer } from './ExpenseComposer'
import { PersonView } from './PersonView'
import { FinanceViewSkeleton } from './Skeleton'
import {
  anonymousViewer,
  selectableParticipants,
  type FinanceViewer,
  type LockedParticipant,
} from '@/lib/financeAccess'
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
  urlParticipantId,
  onParticipantChange,
  onOpenOverview,
  onDataChanged,
}: FinanceViewProps) {
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  // Frontend expense authoring: null = closed, { expense: null } = new,
  // { expense } = edit. Only for signed-in accounts with a participant here.
  const [composer, setComposer] = useState<{ expense: Expense | null } | null>(null)
  const canAuthor = viewer.authenticated && viewer.linkedParticipantIds.length > 0

  const handleDeleteExpense = async (expense: Expense) => {
    const res = await fetch(`/api/expenses/${expense.id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    })
    if (!res.ok) throw new Error('Delete failed')
    await onDataChanged?.()
  }

  // Handle banker ID
  const bankerId =
    typeof chata.banker === 'object' && chata.banker !== null
      ? chata.banker.id
      : chata.banker

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

  // Subtle escape hatch: the all-participants overview for checking numbers
  const overviewLink = onOpenOverview ? (
    <p className="text-center text-sm text-white/60">
      Nesedí vám čísla, nebo chcete vidět všechno najednou?{' '}
      <button
        onClick={onOpenOverview}
        className="text-white/90 font-semibold underline underline-offset-2 hover:text-white transition-colors"
      >
        Podrobný přehled všech účastníků →
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
          aria-label="Přidat výdaj"
          className="expense-fab fixed z-40 bottom-6 right-5 lg:bottom-8 lg:right-8 flex items-center
                     justify-center gap-2 rounded-full bg-primary hover:bg-primary-dark
                     text-white font-semibold text-[15px] w-14 h-14 lg:w-auto lg:h-auto
                     lg:px-6 lg:py-3.5 shadow-xl shadow-primary/50 transition-colors"
        >
          <Plus size={22} strokeWidth={2.5} />
          <span className="hidden lg:inline">Přidat výdaj</span>
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
        />
        {overviewLink}
        {authoringUi}
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

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Compact participant header - full width */}
      <SelectedParticipantHeader
        selectedParticipant={selectedParticipant}
        participants={allowedParticipants}
        onChangeParticipant={handleSelectParticipant}
        bankerId={bankerId}
        canChange={allowedParticipants.length > 1}
      />

      {/* Main content area */}
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 flex flex-col gap-8">
        {/* Sidebar - now only expenses */}
        <aside className="order-2 lg:order-1">
          <ExpensesFeed
            expenses={expenses}
            selectedParticipantId={selectedParticipantId}
            viewerUserId={canAuthor ? viewer.userId : null}
            onEditExpense={(expense) => setComposer({ expense })}
            onDeleteExpense={handleDeleteExpense}
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
          />
        </section>
      </div>

      {overviewLink}
      {authoringUi}
    </div>
  )
}
