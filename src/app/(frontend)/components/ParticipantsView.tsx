'use client'

// "Účastníci" — participant cards with the account-link status, redesigned
// per "Organizace a účastníci — finál" (1d/1e). For anonymous visitors this
// tab is the main entry into the claim flow: unlinked names offer
// "To jsem já", linked ones are locked. The viewer's own card is
// highlighted in the chata theme color.

import { useMemo, useState } from 'react'
import { Check, Lock } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import type { AppLocale } from '@/i18n/config'
import type { Chata, Participant } from '@/payload-types'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import { sinceLabel } from '@/lib/chataSelection'
import { anonymousViewer, type FinanceViewer, type LockedParticipant } from '@/lib/financeAccess'
import type { ViewerClaim } from '@/lib/claimRequests'
import { getTripNights, isTentativeTrip } from '../utils/participantHelpers'
import { getBedAssignments } from '../utils/tripData'
import { ArrivalTimeline } from './ArrivalTimeline'
import { Sheet, StatStrip, StatusBadge } from './SheetUi'
import {
  ClaimDialog,
  ClaimResultModal,
  submitClaim,
  type ClaimSubmitOutcome,
} from './ClaimFlow'

interface ParticipantsViewProps {
  chata: Chata
  participants: Participant[]
  viewer?: FinanceViewer
  locked?: LockedParticipant[]
  pendingClaims?: number[]
  viewerClaims?: ViewerClaim[]
  onDataChanged?: () => Promise<void> | void
}

export function ParticipantsView({
  chata,
  participants,
  viewer = anonymousViewer,
  locked = [],
  pendingClaims = [],
  viewerClaims = [],
  onDataChanged,
}: ParticipantsViewProps) {
  const t = useTranslations('trip')
  const locale = useLocale() as AppLocale

  const [claimDialogFor, setClaimDialogFor] = useState<Participant | null>(null)
  const [claimResult, setClaimResult] = useState<{
    outcome: ClaimSubmitOutcome
    participant: Participant | null
  } | null>(null)
  const [claimBusyId, setClaimBusyId] = useState<number | null>(null)

  const totalNights = getTripNights(chata)
  const bedAssignments = useMemo(
    () => getBedAssignments(chata, participants),
    [chata, participants],
  )
  const lockedIds = useMemo(() => new Set(locked.map((l) => l.id)), [locked])

  const bankerId =
    typeof chata.banker === 'object' && chata.banker !== null ? chata.banker.id : chata.banker

  const sorted = useMemo(() => {
    const mine = (p: Participant) => (viewer.linkedParticipantIds.includes(p.id) ? 0 : 1)
    return [...participants].sort(
      (a, b) => mine(a) - mine(b) || a.name.localeCompare(b.name, 'cs'),
    )
  }, [participants, viewer.linkedParticipantIds])

  const petsCount = participants.filter((p) => p.hasPet).length
  const linkedCount = participants.filter((p) => p.account != null).length

  // Claim UI only for viewers without their own participant here (the same
  // rule as the Finance banner — admins and already-linked users never see it)
  const showClaimUi = !viewer.canViewAll && viewer.linkedParticipantIds.length === 0
  const isClaimable = (p: Participant) =>
    !lockedIds.has(p.id) && !viewer.linkedParticipantIds.includes(p.id) && p.account == null

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

  const statItems: Array<{ value: React.ReactNode; label: string }> = [
    {
      value: participants.length,
      label: t('participants.participantsCountLabel', { count: participants.length }),
    },
  ]
  if (petsCount > 0) {
    statItems.push({ value: petsCount, label: t('participants.petsCountLabel', { count: petsCount }) })
  }
  if (totalNights > 0) {
    statItems.push({
      value: totalNights,
      label: t('participants.nightsCountLabel', { count: totalNights }),
    })
  }
  if (linkedCount > 0) {
    statItems.push({
      value: linkedCount,
      label: t('participants.linkedCountLabel', { count: linkedCount }),
    })
  }

  /** "3 ze 4 nocí · od čtvrtka" — needs the rozpis; plain name without it. */
  const nightsInfo = (p: Participant): string | null => {
    if (totalNights === 0) return null
    const assignment = bedAssignments.get(p.id)
    if (!assignment) return null
    if (assignment.nights === null || assignment.nights.length >= totalNights) {
      return t('participants.wholeStay')
    }
    const first = Math.min(...assignment.nights)
    let suffix = ''
    // tentative dates: night N has no calendar day yet, so no "od čtvrtka"
    if (chata.tripDateFrom && first > 1 && !isTentativeTrip(chata)) {
      const d = new Date(chata.tripDateFrom)
      d.setDate(d.getDate() + first - 1)
      suffix = ` · ${sinceLabel(d, locale)}`
    }
    return (
      t('participants.partialStay', { nights: assignment.nights.length, total: totalNights }) +
      suffix
    )
  }

  return (
    <Sheet>
      {statItems.length > 0 && <StatStrip items={statItems} />}

      {showClaimUi && !viewer.authenticated && (
        <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 dark:border-white/20 dark:bg-white/[0.03] px-4 py-3.5 text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
          {t.rich('participants.claimIntro', {
            strong: (chunks) => (
              <strong className="text-gray-700 dark:text-slate-200">{chunks}</strong>
            ),
          })}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-5">
        {sorted.map((participant) => {
          const isMine = viewer.linkedParticipantIds.includes(participant.id)
          const isBanker = bankerId != null && participant.id === bankerId
          const hasAccount = participant.account != null
          const ownPending = viewerClaims.some(
            (c) => c.participantId === participant.id && c.status === 'pending',
          )
          const pendingByAnyone = pendingClaims.includes(participant.id)
          const claimable = showClaimUi && isClaimable(participant) && !ownPending
          const stayInfo = nightsInfo(participant)

          return (
            <div
              key={participant.id}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 border ${
                isMine
                  ? 'border-2 border-primary/40 bg-primary/[0.06] dark:bg-primary/10'
                  : 'border-gray-100 bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.03]'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0 ${getAvatarColor(participant.name)}`}
              >
                {getInitials(participant.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                  {participant.name}
                  {participant.hasPet && ' 🐕'}
                  {isMine && (
                    <span className="text-primary-dark dark:text-primary-light font-semibold">
                      {' '}
                      {t('participants.thatIsYou')}
                    </span>
                  )}
                  {isBanker && (
                    <span className="ml-1.5 align-[1px] rounded-[5px] bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300 text-[10px] font-bold px-1.5 py-0.5">
                      {t('participants.bankerBadge')}
                    </span>
                  )}
                </div>
                <div
                  className={`text-xs mt-0.5 flex items-center gap-1.5 flex-wrap ${
                    stayInfo && stayInfo !== t('participants.wholeStay')
                      ? 'text-primary-dark dark:text-primary-light'
                      : 'text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {stayInfo && <span>{stayInfo}</span>}
                  {hasAccount ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                      {showClaimUi && !viewer.authenticated ? (
                        <Lock size={10} aria-hidden="true" />
                      ) : (
                        <Check size={10} strokeWidth={3} aria-hidden="true" />
                      )}
                      {t('participants.linked')}
                    </span>
                  ) : ownPending ? (
                    <span className="text-primary-dark dark:text-primary-light">
                      {t('participants.claimPendingOwn')}
                    </span>
                  ) : showClaimUi && pendingByAnyone ? (
                    <span className="text-gray-400 dark:text-slate-500">
                      {t('participants.claimPending')}
                    </span>
                  ) : showClaimUi ? (
                    <span className="text-gray-400 dark:text-slate-500">
                      {t('participants.notLinked')}
                    </span>
                  ) : null}
                </div>
              </div>
              {ownPending ? (
                <StatusBadge tone="amber">{t('participants.waitingBadge')}</StatusBadge>
              ) : claimable ? (
                <button
                  type="button"
                  disabled={claimBusyId !== null}
                  onClick={() =>
                    viewer.authenticated
                      ? void doSubmitClaim(participant)
                      : setClaimDialogFor(participant)
                  }
                  className="rounded-[10px] border border-primary text-primary-dark dark:text-primary-light text-xs font-bold px-3 py-1.5 whitespace-nowrap hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {t('participants.thatIsMe')}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* "Kdo přijede kdy" for EVERY viewer: this tab is noindexed and shows
          names to anonymous visitors by design, so the arrival groups stay
          reachable without sign-in after leaving the anonymous Informace
          render (compliance blocker 3, decision 12). */}
      <ArrivalTimeline chata={chata} participants={participants} viewer={viewer} />

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
    </Sheet>
  )
}
