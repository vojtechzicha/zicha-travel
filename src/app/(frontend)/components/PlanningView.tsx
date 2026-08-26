'use client'

// "Plánování" — the pre-chata phase view (docs/PRD-planovani.md, design
// canvas "Plánování chaty"). One white sheet: hero with the candidate
// months and the admin's intro, the date windows, the accommodation cards
// with per-date availability, and the vote. Anonymous visitors get the
// "Chci jet" call to action plus a hint that results come after voting;
// chata admins and viewers with a linked participant here see who joined
// and the tallies instead.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BarChart3,
  CalendarRange,
  CircleCheckBig,
  ExternalLink,
  Home,
  Users,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import type { AppLocale } from '@/i18n/config'
import type { Chata, Participant } from '@/payload-types'
import { anonymousViewer, type FinanceViewer } from '@/lib/financeAccess'
import { nightsLabel } from '@/lib/chataSelection'
import {
  accommodationAvailableFor,
  canSeePlanningResults,
  parsePlanningVoteIntent,
  planningMonthsLabel,
  tallyVotes,
  PLANNING_INTENT_PARAMS,
  type PlanningAccommodationOption,
  type PlanningPayload,
  type PlanningTallyRow,
  type PlanningVoteIntent,
} from '@/lib/planning'
import { track } from '@/lib/analytics'
import {
  AccentCard,
  HintCard,
  PersonChip,
  Sheet,
  SheetHeading,
  StatStrip,
  StatusBadge,
} from './SheetUi'
import { PlanningVoteFlow } from './PlanningVoteFlow'

interface PlanningViewProps {
  chata: Chata
  participants: Participant[]
  planning: PlanningPayload
  viewer?: FinanceViewer
  onDataChanged: () => Promise<void> | void
}

// The card image placeholders cycle through muted tones so cards without a
// photo still read apart from each other (design canvas)
const PLACEHOLDER_TONES = [
  'linear-gradient(135deg, #d6c7b2, #a89579)',
  'linear-gradient(135deg, #a9c0b4, #718c7d)',
  'linear-gradient(135deg, #c2b8d6, #8a7fa8)',
  'linear-gradient(135deg, #b8cdd6, #7c99a8)',
]

function optionNights(option: { dateFrom: string; dateTo: string }): number {
  return Math.round(
    (new Date(option.dateTo).getTime() - new Date(option.dateFrom).getTime()) / 86_400_000,
  )
}

export function PlanningView({
  chata,
  participants,
  planning,
  viewer = anonymousViewer,
  onDataChanged,
}: PlanningViewProps) {
  const t = useTranslations('planning')
  const locale = useLocale() as AppLocale
  const [dialogOpen, setDialogOpen] = useState(false)
  // A vote intent that failed to auto-submit (below) prefills the dialog
  const [fallbackIntent, setFallbackIntent] = useState<PlanningVoteIntent | null>(null)
  const autoSubmitted = useRef(false)
  // The vote must stay one tap away at every scroll position: while the
  // inline CTA card is out of the viewport, a floating "Chci jet" button
  // takes over (same FAB pattern as Finance's "Přidat výdaj")
  const ctaRef = useRef<HTMLDivElement | null>(null)
  const [ctaInView, setCtaInView] = useState(true)

  // Deferred anonymous vote: the magic-link click lands here with the
  // selection in pv_* params (docs/PRD-planovani.md) — now that the viewer
  // is verified and signed in, record it through the authenticated path.
  // On failure (name taken meanwhile, options changed) the dialog opens
  // prefilled so the voter can finish by hand.
  useEffect(() => {
    if (autoSubmitted.current || !viewer.authenticated) return
    const url = new URL(window.location.href)
    const intent = parsePlanningVoteIntent(url.searchParams)
    if (!intent) return
    autoSubmitted.current = true
    for (const param of PLANNING_INTENT_PARAMS) url.searchParams.delete(param)
    window.history.replaceState({}, '', url)
    const submitIntent = async () => {
      try {
        const res = await fetch('/api/trip-votes/submit', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chataId: chata.id,
            dateOptionIds: intent.dateOptionIds,
            accommodationOptionIds: intent.accommodationOptionIds,
            ...(intent.name ? { name: intent.name } : {}),
          }),
        })
        if (res.ok) {
          track('planning_vote_submitted', {
            signed_in: true,
            dates: intent.dateOptionIds.length,
            places: intent.accommodationOptionIds.length,
          })
          await onDataChanged()
          return
        }
        const data = await res.json().catch(() => null)
        track('save_failed', {
          operation: 'planning_vote_intent',
          status: res.status,
          code: data?.error,
        })
      } catch {
        // fall through to the manual dialog
      }
      setFallbackIntent(intent)
      setDialogOpen(true)
    }
    void submitIntent()
  }, [viewer.authenticated, chata.id, onDataChanged])

  const canSeeResults = canSeePlanningResults(viewer)
  const votes = useMemo(() => planning.votes ?? [], [planning.votes])
  const tally = useMemo(
    () => tallyVotes(votes, planning.dateOptions, planning.accommodations),
    [votes, planning.dateOptions, planning.accommodations],
  )

  const participantById = useMemo(
    () => new Map(participants.map((p) => [p.id, p])),
    [participants],
  )
  const ownIds = new Set(viewer.linkedParticipantIds)
  const viewerVote = votes.find((vote) => ownIds.has(vote.participantId)) ?? null
  const myParticipant =
    participants.find((p) => viewer.linkedParticipantIds.includes(p.id)) ?? null

  const monthsLabel = planningMonthsLabel(planning.dateOptions, locale)
  const nightsPerOption = planning.dateOptions.map(optionNights)
  const uniformNights =
    nightsPerOption.length > 0 && nightsPerOption.every((n) => n === nightsPerOption[0] && n > 0)
      ? nightsPerOption[0]
      : null

  const dateById = useMemo(
    () => new Map(planning.dateOptions.map((option) => [option.id, option])),
    [planning.dateOptions],
  )
  const availableCountFor = (dateId: number) =>
    planning.accommodations.filter((place) => accommodationAvailableFor(place, [dateId])).length

  const voterNames = votes
    .map((vote) => participantById.get(vote.participantId))
    .filter((p): p is Participant => p != null)

  const loginHref =
    typeof window !== 'undefined'
      ? `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
      : '/login'

  const tallyRows = (
    rows: PlanningTallyRow[],
    labelOf: (id: number) => string,
  ): React.ReactNode => (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-3.5">
          <span className="w-[130px] sm:w-[160px] shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {labelOf(row.id)}
          </span>
          <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-white/[0.08] overflow-hidden">
            <div
              className={`h-full rounded-full ${row.leading ? 'bg-primary' : 'bg-gray-200 dark:bg-white/[0.18]'}`}
              style={{ width: `${Math.round(row.share * 100)}%` }}
            />
          </div>
          <span className="w-[84px] shrink-0 text-[13px] text-gray-500 dark:text-slate-400 text-right whitespace-nowrap">
            {t('results.fraction', { count: row.count, total: tally.total })}{' '}
            {row.leading && <StatusBadge tone="green">{t('results.leading')}</StatusBadge>}
          </span>
        </div>
      ))}
    </div>
  )

  const showCta = !viewerVote

  useEffect(() => {
    if (!showCta) return
    const el = ctaRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setCtaInView(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [showCta])

  const ctaCard = (
    <div
      ref={ctaRef}
      className="rounded-2xl border border-primary/30 bg-primary/[0.06] dark:border-primary/40 dark:bg-primary/10 px-5 py-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mt-7"
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary-dark dark:text-primary-light">
          {t('cta.label')}
        </div>
        <div className="font-serif text-xl font-black text-gray-900 dark:text-gray-100">
          {t('cta.title')}
        </div>
        <div className="text-[13.5px] leading-relaxed text-gray-700 dark:text-slate-300">
          {t('cta.body')}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-primary hover:bg-primary-dark
                   text-white text-sm font-bold px-6 py-3.5 shadow-lg shadow-primary/35 transition-colors
                   whitespace-nowrap self-stretch sm:self-center"
      >
        <CircleCheckBig size={16} aria-hidden="true" />
        {t('cta.button')}
      </button>
    </div>
  )

  return (
    <>
      <Sheet>
        {/* ── hero ── */}
        <div className="flex flex-col items-center gap-3.5 text-center pt-2 pb-6">
          <div
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] sm:text-xs
                       font-bold uppercase tracking-[0.06em] border-primary/25 bg-primary/10
                       text-primary-dark dark:border-primary/40 dark:bg-primary/15 dark:text-primary-light"
          >
            {t('hero.badge')}
          </div>
          {monthsLabel && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-gray-400 dark:text-slate-500">
                {t('hero.whenTitle')}
              </div>
              <div className="font-serif text-xl sm:text-[26px] font-black text-gray-900 dark:text-gray-100">
                {monthsLabel}
              </div>
              <div className="text-[13px] text-gray-500 dark:text-slate-400">
                {uniformNights
                  ? t('hero.nightsNote', { nights: nightsLabel(uniformNights, locale) })
                  : t('hero.note')}
              </div>
            </div>
          )}
          {/* Admin-entered texts are Czech in both UI locales; lang="cs" keeps
              the hyphenation Czech, which the justified block depends on */}
          {planning.intro && (
            <p
              lang="cs"
              className="max-w-[620px] m-0 text-[14.5px] leading-relaxed text-gray-700 dark:text-slate-300 sm:text-justify hyphens-auto"
            >
              {planning.intro}
            </p>
          )}
        </div>

        <StatStrip
          items={[
            {
              value: planning.dateOptions.length,
              label: t('stats.dates', { count: planning.dateOptions.length }),
            },
            {
              value: planning.accommodations.length,
              label: t('stats.places', { count: planning.accommodations.length }),
            },
            ...(planning.voteCount > 0
              ? [
                  {
                    value: planning.voteCount,
                    label: t('stats.votes', { count: planning.voteCount }),
                  },
                ]
              : []),
          ]}
        />

        {/* ── viewer's own vote ── */}
        {canSeeResults && viewerVote && (
          <AccentCard
            label={t('results.yourVote')}
            className="mt-6"
            action={
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="text-[13px] font-semibold text-primary-dark dark:text-primary-light hover:underline underline-offset-2"
              >
                {t('results.edit')}
              </button>
            }
          >
            <div className="flex flex-col gap-1.5 text-sm text-gray-700 dark:text-slate-200">
              <div className="flex gap-3">
                <span className="w-24 shrink-0 text-gray-400 dark:text-slate-500">
                  {t('results.datesLabel')}
                </span>
                <span>
                  {viewerVote.dateOptionIds
                    .map((id) => dateById.get(id)?.label)
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <div className="flex gap-3">
                <span className="w-24 shrink-0 text-gray-400 dark:text-slate-500">
                  {t('results.placesLabel')}
                </span>
                <span>
                  {viewerVote.accommodationOptionIds.length > 0
                    ? viewerVote.accommodationOptionIds
                        .map(
                          (id) =>
                            planning.accommodations.find((place) => place.id === id)?.name,
                        )
                        .filter(Boolean)
                        .join(', ')
                    : t('results.noPlaces')}
                </span>
              </div>
            </div>
          </AccentCard>
        )}

        {/* ── date options ── */}
        {planning.dateOptions.length > 0 && (
          <>
            <SheetHeading icon={CalendarRange} title={t('dates.title')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {planning.dateOptions.map((option) => {
                const available = availableCountFor(option.id)
                const allAvailable = available === planning.accommodations.length
                return (
                  <div
                    key={option.id}
                    className="rounded-2xl border border-gray-200 dark:border-white/[0.12] px-5 py-4 flex flex-col gap-1.5"
                  >
                    <div className="font-serif text-lg sm:text-xl font-black text-gray-900 dark:text-gray-100">
                      {option.label}
                    </div>
                    {option.note && (
                      <div className="text-[13px] text-gray-500 dark:text-slate-400">
                        {option.note}
                      </div>
                    )}
                    {planning.accommodations.length > 0 && (
                      <div className="mt-1">
                        <StatusBadge tone={allAvailable ? 'green' : 'gray'}>
                          {t('dates.availablePlaces', { count: available })}
                        </StatusBadge>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── accommodation options ── */}
        {planning.accommodations.length > 0 && (
          <>
            <SheetHeading
              icon={Home}
              title={t('places.title')}
              aside={t('places.count', { count: planning.accommodations.length })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {planning.accommodations.map((place: PlanningAccommodationOption, idx) => {
                const windowIds =
                  place.dateOptionIds.length > 0
                    ? place.dateOptionIds
                    : planning.dateOptions.map((option) => option.id)
                const limited =
                  place.dateOptionIds.length > 0 &&
                  place.dateOptionIds.length < planning.dateOptions.length
                return (
                  <div
                    key={place.id}
                    className="rounded-2xl border border-gray-200 dark:border-white/[0.12] overflow-hidden flex flex-col"
                  >
                    {place.imageUrl ? (
                      <img
                        src={place.imageUrl}
                        alt={place.name}
                        loading="lazy"
                        className="h-[130px] w-full object-cover"
                      />
                    ) : (
                      <div
                        className="h-[130px] flex items-center justify-center text-white/80"
                        style={{ background: PLACEHOLDER_TONES[idx % PLACEHOLDER_TONES.length] }}
                      >
                        <Home size={28} aria-hidden="true" />
                      </div>
                    )}
                    <div className="p-4 sm:px-5 flex flex-col gap-2 flex-1">
                      <div>
                        <div className="font-serif text-[17px] font-bold text-gray-900 dark:text-gray-100">
                          {place.name}
                        </div>
                        {place.locationNote && (
                          <div className="text-[13px] text-gray-500 dark:text-slate-400">
                            {place.locationNote}
                          </div>
                        )}
                      </div>
                      {place.description && (
                        <p
                          lang="cs"
                          className="m-0 text-[13.5px] leading-relaxed text-gray-700 dark:text-slate-300 sm:text-justify hyphens-auto"
                        >
                          {place.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                        {windowIds.map((id) => {
                          const option = dateById.get(id)
                          if (!option) return null
                          return (
                            <span
                              key={id}
                              className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300 text-xs font-semibold px-2.5 py-1"
                            >
                              {option.label}
                            </span>
                          )
                        })}
                        {limited && (
                          <span className="text-xs text-gray-400 dark:text-slate-500">
                            {t('places.limitedNote')}
                          </span>
                        )}
                      </div>
                      {place.url && (
                        <a
                          href={place.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-dark dark:text-primary-light hover:underline underline-offset-2"
                        >
                          {t('places.viewListing')}
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── vote / results ── */}
        {canSeeResults ? (
          <>
            {!viewerVote && ctaCard}
            <SheetHeading
              icon={Users}
              title={t('results.votersTitle')}
              aside={
                voterNames.length > 0
                  ? t('results.votersCount', { count: voterNames.length })
                  : undefined
              }
            />
            {voterNames.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {voterNames.map((p) => (
                  <PersonChip key={p.id} highlight={ownIds.has(p.id)}>
                    {p.name}
                  </PersonChip>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm text-gray-500 dark:text-slate-400">
                {t('results.noVotes')}
              </p>
            )}

            {tally.total > 0 && (
              <>
                <SheetHeading icon={BarChart3} title={t('results.title')} />
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-2.5">
                    <div className="text-xs font-bold uppercase tracking-[0.06em] text-gray-400 dark:text-slate-500">
                      {t('results.datesSection')}
                    </div>
                    {tallyRows(tally.dates, (id) => dateById.get(id)?.label ?? '')}
                  </div>
                  {planning.accommodations.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <div className="text-xs font-bold uppercase tracking-[0.06em] text-gray-400 dark:text-slate-500">
                        {t('results.placesSection')}
                      </div>
                      {tallyRows(
                        tally.accommodations,
                        (id) =>
                          planning.accommodations.find((place) => place.id === id)?.name ?? '',
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="mt-7">
              <HintCard>{t('results.note')}</HintCard>
            </div>
          </>
        ) : (
          <>
            {ctaCard}
            <div className="mt-3">
              <HintCard>
                <span>{t('cta.anonHint')}</span>
                <a
                  href={loginHref}
                  className="font-semibold text-gray-600 dark:text-slate-300 whitespace-nowrap"
                >
                  {t('cta.signIn')}
                </a>
              </HintCard>
            </div>
          </>
        )}
      </Sheet>

      {/* Floating vote button while the inline CTA is scrolled away.
          Portaled to <body>: the view lives in a `relative z-10` container
          and the site footer would otherwise paint over the fixed button. */}
      {showCta &&
        !ctaInView &&
        !dialogOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            aria-label={t('cta.button')}
            className="fixed z-40 bottom-6 right-5 lg:bottom-8 lg:right-8 flex items-center
                       justify-center gap-2.5 rounded-full bg-primary hover:bg-primary-dark
                       text-white font-bold text-[15px] px-6 py-3.5 shadow-xl shadow-primary/50
                       transition-colors motion-safe:animate-slideUp"
          >
            <CircleCheckBig size={18} strokeWidth={2.5} aria-hidden="true" />
            {t('cta.button')}
          </button>,
          document.body,
        )}

      {dialogOpen && (
        <PlanningVoteFlow
          chata={chata}
          planning={planning}
          viewerName={myParticipant?.name ?? null}
          authenticated={viewer.authenticated}
          initialName={fallbackIntent?.name ?? null}
          initialDateIds={viewerVote?.dateOptionIds ?? fallbackIntent?.dateOptionIds ?? []}
          initialAccommodationIds={
            viewerVote?.accommodationOptionIds ?? fallbackIntent?.accommodationOptionIds ?? []
          }
          onClose={() => setDialogOpen(false)}
          onVoted={onDataChanged}
        />
      )}
    </>
  )
}
