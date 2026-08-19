'use client'

// "Kdo přijede kdy" — the arrival-groups night timeline, shared by two tabs
// (compliance blocker 3, decisions 7 and 12 in docs/legal/compliance-gaps.md):
// - Informace renders it for SIGNED-IN viewers only; the anonymous Informace
//   render is indexable and must carry no participant names.
// - Účastníci renders it for ALL viewers — that tab is noindexed and shows
//   names to anonymous visitors by design, so the section stays reachable
//   without sign-in.
// The JSX is the section formerly inlined in InformationView, unchanged.

import { Users } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import type { AppLocale } from '@/i18n/config'
import type { Chata, Participant } from '@/payload-types'
import { anonymousViewer, type FinanceViewer } from '@/lib/financeAccess'
import { getTripNights } from '../utils/participantHelpers'
import {
  getArrivalGroups,
  getTripPhase,
  nightLabel,
  nightlyCounts,
  sleepingCapacity,
} from '../utils/tripData'
import { SheetHeading } from './SheetUi'

interface ArrivalTimelineProps {
  chata: Chata
  participants: Participant[]
  viewer?: FinanceViewer
}

function petSuffix(participant: Participant): string {
  return participant.hasPet ? ' 🐕' : ''
}

/** Renders null when there is nothing to show (no rozpis, no nights, after the trip). */
export function ArrivalTimeline({
  chata,
  participants,
  viewer = anonymousViewer,
}: ArrivalTimelineProps) {
  const t = useTranslations('trip')
  const locale = useLocale() as AppLocale

  const phase = getTripPhase(chata)
  const nights = getTripNights(chata)
  const arrivalGroups = getArrivalGroups(chata, participants)
  const counts = nightlyCounts(chata, participants)
  const capacity = sleepingCapacity(chata)

  if (phase === 'after' || arrivalGroups.length === 0 || nights === 0) return null

  return (
    <div>
      <SheetHeading icon={Users} title={t('information.arrivalsTitle')} />
      <div className="flex gap-1.5 items-center mb-2.5" aria-hidden="true">
        <div className="flex-1" />
        {Array.from({ length: nights }, (_, i) => (
          <span
            key={i}
            className="w-6 text-center text-[11px] font-bold text-gray-400 dark:text-slate-500"
          >
            {nightLabel(chata, i + 1, locale)}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {arrivalGroups.map((group, idx) => {
          const isMine = group.participants.some((p) =>
            viewer.linkedParticipantIds.includes(p.id),
          )
          return (
            <div key={idx} className="flex gap-1.5 items-center">
              <div
                className={`flex-1 text-sm min-w-0 ${
                  isMine
                    ? 'font-semibold text-gray-900 dark:text-gray-100'
                    : 'text-gray-700 dark:text-slate-300'
                }`}
              >
                {group.participants
                  .map(
                    (p) =>
                      p.name +
                      petSuffix(p) +
                      (viewer.linkedParticipantIds.includes(p.id)
                        ? ` ${t('information.youSuffix')}`
                        : ''),
                  )
                  .join(', ')}
              </div>
              {group.presence.map((present, nightIdx) => (
                <span
                  key={nightIdx}
                  className={`w-6 h-[15px] rounded ${
                    present
                      ? isMine
                        ? 'bg-primary'
                        : 'bg-primary-light/75'
                      : 'bg-gray-100 border border-gray-200 dark:bg-white/[0.06] dark:border-white/10'
                  }`}
                />
              ))}
            </div>
          )
        })}
      </div>
      {counts.length > 0 && (
        <div className="flex gap-1.5 items-center mt-3 pt-2.5 border-t border-gray-100 dark:border-white/[0.07]">
          <div className="flex-1 text-[13px] text-gray-500 dark:text-slate-400">
            {t('information.sleepsTotal')}{' '}
            {capacity > 0 && (
              <span className="text-gray-400 dark:text-slate-500">
                {t('information.capacityNote', { count: capacity })}
              </span>
            )}
          </div>
          {counts.map((count, idx) => (
            <span
              key={idx}
              className="w-6 text-center text-xs font-bold text-gray-500 dark:text-slate-400"
            >
              {count}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
