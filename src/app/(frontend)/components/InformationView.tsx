'use client'

// "Informace" — the trip document (design: Detail chaty — finál). One white
// sheet with serif section headings; the trip PHASE only changes the badge
// and the section order (before / during / after), the personal module shows
// only to signed-in linked participants, and every module is optional — no
// data, no render. Light + dark via the scoped `dark` variant.

import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Bus,
  Calendar,
  CalendarPlus,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Image as ImageIcon,
  Info,
  MapPin,
  Mountain,
  Navigation,
  Phone,
  Sun,
  Train,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import type { AppLocale } from '@/i18n/config'
import type { Chata, Media, Participant } from '@/payload-types'
import type { ChataStats } from '@/utils/calculateStats'
import { anonymousViewer, type FinanceViewer } from '@/lib/financeAccess'
import { googleCalendarEventUrl, googleCalendarAllDayUrl } from '@/lib/gcal'
import { formatCurrency } from '@/lib/formatCurrency'
import {
  countdownLabel,
  formatDateRangeLong,
  settlementFromBalance,
  untilLabel,
  viewerCost,
} from '@/lib/chataSelection'
import { getTripNights } from '../utils/participantHelpers'
import {
  arrivalsOnNight,
  dayOnly,
  daysUntilTrip,
  getArrivalGroups,
  getBedAssignments,
  getCarAssignments,
  getTripPhase,
  navigateUrl,
  nightLabel,
  nightlyCounts,
  personNights,
  presentOnNight,
  sleepingCapacity,
  tonightNumber,
  tripDayIndex,
  tripTotalDays,
  type TripPhase,
} from '../utils/tripData'
import {
  AccentCard,
  HintCard,
  InfoRow,
  PersonChip,
  PrimaryAction,
  SecondaryAction,
  Sheet,
  SheetHeading,
  StatStrip,
  StatusBadge,
} from './SheetUi'
import { TripWeather, weatherRange } from './TripWeather'

interface InformationViewProps {
  chata: Chata
  participants: Participant[]
  stats: ChataStats
  viewer?: FinanceViewer
  /** switches the tab to Finance (personal card / settlement links) */
  onOpenFinance?: () => void
}

type Translator = ReturnType<typeof useTranslations>
type TransportOption = NonNullable<Chata['publicTransportOptions']>[number]
type TransportConnection = NonNullable<TransportOption['connections']>[number]

function intlTag(locale: AppLocale): string {
  return locale === 'cs' ? 'cs-CZ' : 'en-GB'
}

/** "středa 5. 8." / "Wednesday 5/8" — the hero date boxes. */
function weekdayShortDate(dateString: string, locale: AppLocale): string {
  const d = dayOnly(dateString)
  const weekday = new Intl.DateTimeFormat(intlTag(locale), { weekday: 'long' }).format(d)
  return locale === 'cs'
    ? `${weekday} ${d.getDate()}. ${d.getMonth() + 1}.`
    : `${weekday} ${d.getDate()}/${d.getMonth() + 1}`
}

/** "pátek 7. srpna" — hero heading during the trip. */
function longDayLabel(date: Date, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

/** "st 5." — program day column. */
function programDayLabel(dateString: string, locale: AppLocale): string {
  const d = dayOnly(dateString)
  const weekday = new Intl.DateTimeFormat(intlTag(locale), { weekday: 'short' })
    .format(d)
    .replace('.', '')
  return locale === 'cs' ? `${weekday} ${d.getDate()}.` : `${weekday} ${d.getDate()}`
}

function petSuffix(participant: Participant): string {
  return participant.hasPet ? ' 🐕' : ''
}

// ─── public transport (kept from the previous view, restyled) ─────────────

function connectionLine(conn: TransportConnection, t: Translator): string {
  const vehicle =
    conn.type === 'autobus' ? t('information.calendar.bus') : t('information.calendar.train')
  return `<b>${vehicle} ${conn.number}</b>: ${conn.from} (${conn.departure}) -> ${conn.to} (${conn.arrival})`
}

function transportEventUrl(
  option: TransportOption,
  chataName: string,
  tripDate: string,
  t: Translator,
): string {
  const connections = option.connections || []
  const legs = connections.map((conn) => connectionLine(conn, t)).join('<br><br>')
  const total = option.totalDuration
    ? `<br><br><b>${t('information.calendar.total', { duration: option.totalDuration })}</b>`
    : ''
  const notes = option.notes ? `<br><br>${option.notes}` : ''
  const journey =
    option.direction === 'zpet'
      ? t('information.calendar.journeyBack')
      : t('information.calendar.journeyThere')
  return googleCalendarEventUrl({
    title: `${journey} – ${option.title} (${chataName})`,
    date: new Date(tripDate).toLocaleDateString('en-CA'),
    start: connections[0].departure,
    end: connections[connections.length - 1].arrival,
    details: legs + total + notes,
    location: connections[0].from,
  })
}

export function InformationView({
  chata,
  participants,
  stats,
  viewer = anonymousViewer,
  onOpenFinance,
}: InformationViewProps) {
  const t = useTranslations('trip')
  const locale = useLocale() as AppLocale
  const [expandedTransport, setExpandedTransport] = useState<number[]>([])

  const phase: TripPhase | null = getTripPhase(chata)
  const nights = getTripNights(chata)
  const chataName = chata.shortName || chata.name

  // ── viewer's own data (personal card) ──
  const myParticipants = useMemo(
    () => participants.filter((p) => viewer.linkedParticipantIds.includes(p.id)),
    [participants, viewer.linkedParticipantIds],
  )
  const bedAssignments = useMemo(
    () => getBedAssignments(chata, participants),
    [chata, participants],
  )
  const carAssignments = useMemo(() => getCarAssignments(chata), [chata])
  const me = myParticipants[0] ?? null
  const myBed = me ? bedAssignments.get(me.id) : undefined
  const myCar = me ? carAssignments.get(me.id) : undefined
  const myNames = myParticipants.map((p) => p.name)
  const myAdvance = myNames.reduce(
    (sum, name) => sum + (stats.participants[name]?.prepaidAdvance ?? 0),
    0,
  )
  const mySpent = viewerCost(stats, myNames)
  const myBalance = myNames.reduce(
    (sum, name) => sum + (stats.participants[name]?.balance ?? 0),
    0,
  )

  if (!chata.informationEnabled) {
    return (
      <Sheet>
        <div className="text-center py-8">
          <Info className="mx-auto text-gray-300 dark:text-slate-600 mb-4" size={48} />
          <p className="text-gray-600 dark:text-slate-300 text-lg">
            {t('information.notAvailable')}
          </p>
        </div>
      </Sheet>
    )
  }

  const toggleTransport = (idx: number) => {
    setExpandedTransport((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    )
  }

  // ── derived bits shared by several modules ──
  const petsCount = participants.filter((p) => p.hasPet).length
  const capacity = sleepingCapacity(chata)
  const occupied = getBedAssignments(chata, participants).size
  const carsCount = (chata.sharedCars || []).length
  const hasTrainOptions = (chata.publicTransportOptions || []).length > 0
  const arrivalGroups = getArrivalGroups(chata, participants)
  const counts = nightlyCounts(chata, participants)
  const navUrl = navigateUrl(chata)
  const today = dayOnly(new Date())
  const tonight = tonightNumber(chata)

  const hasWeather =
    chata.destinationLat != null &&
    chata.destinationLng != null &&
    chata.tripDateFrom != null &&
    chata.tripDateTo != null &&
    phase !== 'after' &&
    weatherRange(chata.tripDateFrom, chata.tripDateTo) !== null

  const photos = (chata.photos || [])
    .map((item) => item.photo as Media)
    .filter((photo): photo is Media => Boolean(photo?.url))

  const placeItems = (chata.surroundings || []).filter((s) => s.category !== 'trip')
  const tripItems = (chata.surroundings || []).filter((s) => s.category === 'trip')

  const programToday = (chata.program || []).filter(
    (item) => dayOnly(item.date).getTime() === today.getTime(),
  )
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const programTomorrow = (chata.program || []).filter(
    (item) => dayOnly(item.date).getTime() === tomorrow.getTime(),
  )
  const arrivalsToday = tonight > 0 ? arrivalsOnNight(chata, participants, tonight) : []
  const isLastDayTomorrow =
    chata.tripDateTo != null && dayOnly(chata.tripDateTo).getTime() === tomorrow.getTime()

  // ── after-trip recap numbers ──
  const totalPersonNights = personNights(chata, participants)
  const perPersonNight =
    totalPersonNights > 0 ? Math.round(stats.totalExpenses / totalPersonNights) : null
  const expenseEntries = Object.values(stats.participants).flatMap((p) => p.costBreakdown)
  const largestByExpense = new Map<string | number, { title: string; sum: number }>()
  for (const entry of expenseEntries) {
    if (entry.expenseId == null) continue
    const existing = largestByExpense.get(entry.expenseId)
    if (existing) existing.sum += entry.cost
    else largestByExpense.set(entry.expenseId, { title: entry.title, sum: entry.cost })
  }
  const largestExpense = [...largestByExpense.values()].sort((a, b) => b.sum - a.sum)[0] ?? null
  const expensesCount = largestByExpense.size

  // ─── hero ────────────────────────────────────────────────────────────────

  const calendarUrl =
    chata.tripDateFrom && chata.tripDateTo
      ? googleCalendarAllDayUrl({
          title: chataName,
          dateFrom: new Date(chata.tripDateFrom).toLocaleDateString('en-CA'),
          dateTo: new Date(chata.tripDateTo).toLocaleDateString('en-CA'),
          location: chata.destinationLocation || undefined,
        })
      : null

  const heroStats: Array<{ value: React.ReactNode; label: string }> = []
  if (phase !== null && nights > 0) {
    heroStats.push({ value: nights, label: t('information.nightsUnit', { count: nights }) })
  }
  if (participants.length > 0) {
    heroStats.push({
      value: participants.length,
      label:
        t('information.peopleUnit', { count: participants.length }) +
        (petsCount > 0 ? ` + ${t('information.petsUnit', { count: petsCount })}` : ''),
    })
  }
  if (capacity > 0 && occupied > 0) {
    heroStats.push({
      value: `${occupied}/${capacity}`,
      label: t('information.placesTaken'),
    })
  }
  if (carsCount > 0) {
    heroStats.push({
      value: carsCount,
      label:
        t('information.carsUnit', { count: carsCount }) +
        (hasTrainOptions ? ` + ${t('information.trainUnit')}` : ''),
    })
  }

  const badgeBase =
    'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-[0.06em]'

  // Design desktop hero (1a): dates left · countdown badge center · actions
  // stacked right, with the stats strip framed by rules below. On mobile the
  // badge tops a centered stack, exactly like the phone mock.
  const beforeBadge = (
    <div
      className={`${badgeBase} bg-sky-600/10 border-sky-600/25 text-sky-700 dark:bg-sky-400/15 dark:border-sky-400/30 dark:text-sky-300`}
    >
      {t('information.badgeBefore', {
        countdown: countdownLabel(daysUntilTrip(chata), locale),
      })}
    </div>
  )
  const dateBoxes = (
    <div className="flex items-center justify-center gap-4 sm:gap-5">
      <div className="text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-gray-400 dark:text-slate-500">
          {t('information.arrival')}
        </div>
        <div className="font-serif text-xl sm:text-[26px] font-black text-gray-900 dark:text-gray-100">
          {chata.tripDateFrom ? weekdayShortDate(chata.tripDateFrom, locale) : ''}
        </div>
        {chata.checkInTime && (
          <div className="text-[13px] text-gray-500 dark:text-slate-400">
            {t('information.checkInPrefix')} {chata.checkInTime}
          </div>
        )}
      </div>
      <ArrowRight
        size={26}
        className="text-primary dark:text-primary-light shrink-0"
        aria-hidden="true"
      />
      <div className="text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-gray-400 dark:text-slate-500">
          {t('information.departure')}
        </div>
        <div className="font-serif text-xl sm:text-[26px] font-black text-gray-900 dark:text-gray-100">
          {chata.tripDateTo ? weekdayShortDate(chata.tripDateTo, locale) : ''}
        </div>
        {chata.checkOutTime && (
          <div className="text-[13px] text-gray-500 dark:text-slate-400">
            {t('information.checkOutPrefix')} {chata.checkOutTime}
          </div>
        )}
      </div>
    </div>
  )
  const heroActions = (calendar: boolean) => (
    <>
      {calendar && calendarUrl && (
        <SecondaryAction href={calendarUrl}>
          <CalendarPlus size={14} aria-hidden="true" /> {t('information.tripToCalendar')}
        </SecondaryAction>
      )}
      {navUrl && (
        <PrimaryAction href={navUrl}>
          <Navigation size={14} aria-hidden="true" /> {t('information.navigate')}
        </PrimaryAction>
      )}
    </>
  )

  const hero =
    phase === null ? null : phase === 'before' ? (
      <div>
        {/* mobile: centered stack */}
        <div className="sm:hidden text-center">
          <div className="mb-4">{beforeBadge}</div>
          {dateBoxes}
          {heroStats.length > 0 && <StatStrip items={heroStats} bordered={false} />}
          <div className="flex flex-wrap justify-center gap-2">{heroActions(true)}</div>
        </div>
        {/* desktop: dates · badge · stacked actions, stats strip below */}
        <div className="hidden sm:flex items-center justify-between gap-6">
          {dateBoxes}
          <div className="flex-1 flex justify-center">{beforeBadge}</div>
          <div className="flex flex-col items-stretch gap-2">{heroActions(true)}</div>
        </div>
        {heroStats.length > 0 && (
          <div className="hidden sm:block mt-4">
            <StatStrip items={heroStats} />
          </div>
        )}
      </div>
    ) : phase === 'during' ? (
      <div className="text-center sm:text-left sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <div
            className={`${badgeBase} bg-emerald-600/10 border-emerald-600/25 text-emerald-700 dark:bg-emerald-400/15 dark:border-emerald-400/30 dark:text-emerald-300 mb-3`}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-300"
              aria-hidden="true"
            />
            {t('information.badgeDuring', {
              until: chata.tripDateTo ? untilLabel(chata.tripDateTo, locale) : '',
            })}
          </div>
          <div className="font-serif text-[21px] sm:text-[27px] font-black text-gray-900 dark:text-gray-100">
            {longDayLabel(new Date(), locale)}{' '}
            <span className="text-gray-400 dark:text-slate-500 font-normal text-[15px] sm:text-[19px]">
              · {t('information.dayOfTrip', { day: tripDayIndex(chata), total: tripTotalDays(chata) })}
            </span>
          </div>
        </div>
        {navUrl && (
          <div className="flex flex-wrap justify-center gap-2 mt-3 sm:mt-0 sm:shrink-0">
            <PrimaryAction href={navUrl}>
              <Navigation size={14} aria-hidden="true" /> {t('information.navigate')}
            </PrimaryAction>
          </div>
        )}
      </div>
    ) : (
      <div className="text-center sm:text-left sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <div
            className={`${badgeBase} bg-gray-100 border-gray-200 text-gray-500 dark:bg-white/[0.06] dark:border-white/[0.12] dark:text-slate-400 mb-3`}
          >
            {t('information.badgeAfter', {
              range:
                chata.tripDateFrom && chata.tripDateTo
                  ? formatDateRangeLong(chata.tripDateFrom, chata.tripDateTo, locale)
                  : '',
            })}
          </div>
          <div className="font-serif text-[21px] sm:text-[27px] font-black text-gray-900 dark:text-gray-100">
            {t('information.thanksTitle')}{' '}
            {(nights > 0 || participants.length > 0) && (
              <span className="block sm:inline text-[13px] sm:text-[19px] font-normal text-gray-500 dark:text-slate-400 sm:text-gray-400 mt-1 sm:mt-0">
                {[
                  nights > 0 ? `${nights} ${t('information.nightsUnit', { count: nights })}` : null,
                  participants.length > 0
                    ? `${participants.length} ${t('information.peopleUnit', { count: participants.length })}` +
                      (petsCount > 0 ? ` + ${t('information.petsUnit', { count: petsCount })}` : '')
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-3 sm:mt-0 sm:shrink-0">
          {chata.sharedAlbumUrl && (
            <SecondaryAction href={chata.sharedAlbumUrl}>
              <ImageIcon size={14} aria-hidden="true" /> {t('information.sharedAlbum')}
            </SecondaryAction>
          )}
          {onOpenFinance && (
            <PrimaryAction onClick={onOpenFinance}>
              <Wallet size={14} aria-hidden="true" /> {t('information.settlementInFinance')}
            </PrimaryAction>
          )}
        </div>
      </div>
    )

  const recapItems: Array<{ value: React.ReactNode; label: string }> = []
  if (phase === 'after' && stats.totalExpenses > 0) {
    recapItems.push({
      value: formatCurrency(stats.totalExpenses, locale),
      label: t('information.recapTotal'),
    })
    if (perPersonNight != null) {
      recapItems.push({
        value: formatCurrency(perPersonNight, locale),
        label: t('information.recapPerPersonNight'),
      })
    }
    if (expensesCount > 0) {
      recapItems.push({
        value: expensesCount,
        label: t('information.recapExpenses', { count: expensesCount }),
      })
    }
    if (largestExpense) {
      recapItems.push({
        value: formatCurrency(Math.round(largestExpense.sum), locale),
        label: t('information.recapLargest', { title: largestExpense.title }),
      })
    }
  }

  // ─── personal module ─────────────────────────────────────────────────────

  const myBedLine = myBed ? (
    <>
      <strong className="font-semibold">{myBed.roomName}</strong>
      {', '}
      {myBed.bedName}
      {myBed.roommates.length > 0 && (
        <span className="text-gray-500 dark:text-slate-400">
          {' '}
          · {t('information.yourCardWith')}{' '}
          {myBed.roommates.map((p) => p.name + petSuffix(p)).join(', ')}
        </span>
      )}
    </>
  ) : null

  const myCarLine = myCar ? (
    <>
      <strong className="font-semibold">{myCar.carName}</strong>
      <span className="text-gray-500 dark:text-slate-400">
        {' '}
        ·{' '}
        {myCar.role === 'driver'
          ? t('information.roleDriver')
          : myCar.role === 'front'
            ? t('information.roleFront')
            : t('information.roleBack')}
      </span>
    </>
  ) : null

  const myNightsLine =
    myBed && nights > 0
      ? myBed.nights === null
        ? t('information.wholeStayNights', { count: nights }) +
          ' — ' +
          t('information.nightsRange', {
            from: nightLabel(chata, 1, locale),
            to: nightLabel(chata, nights + 1, locale),
          })
        : t('information.partialStayNights', { nights: myBed.nights.length, total: nights })
      : null

  // Design card cell: tiny label above the value (4 columns on desktop),
  // label-left rows on mobile like the phone mock
  const cardCell = (label: string, content: React.ReactNode, key: string) => (
    <div key={key} className="flex gap-3 sm:block">
      <div className="w-14 shrink-0 sm:w-auto text-[13px] sm:text-xs text-primary-dark/85 dark:text-primary-light/85 sm:mb-0.5">
        {label}
      </div>
      <div className="text-sm text-gray-900 dark:text-gray-100 min-w-0">{content}</div>
    </div>
  )

  const settlement = settlementFromBalance(myBalance)

  const personalCard =
    phase === 'after'
      ? me && (
          <AccentCard
            label={t('information.yourSettlement')}
            action={
              settlement.status === 'debtor' && onOpenFinance ? (
                <button
                  type="button"
                  onClick={onOpenFinance}
                  className="rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-semibold px-3.5 py-2 transition-colors whitespace-nowrap"
                >
                  {t('information.payAction')}
                </button>
              ) : undefined
            }
          >
            <div className="text-sm text-gray-800 dark:text-slate-200">
              {settlement.status === 'debtor'
                ? t('information.youOwe', { amount: formatCurrency(settlement.amount, locale) })
                : settlement.status === 'creditor'
                  ? t('information.youReceive', {
                      amount: formatCurrency(settlement.amount, locale),
                    })
                  : t('information.youAreSettled')}
            </div>
          </AccentCard>
        )
      : me && (myBedLine || myCarLine || myNightsLine || myAdvance > 0 || (phase === 'during' && mySpent != null)) ? (
          <AccentCard
            label={t('information.yourCard')}
            action={
              onOpenFinance ? (
                <button
                  type="button"
                  onClick={onOpenFinance}
                  className="text-[13px] font-semibold text-primary-dark dark:text-primary-light hover:underline whitespace-nowrap"
                >
                  {t('information.financeDetail')}
                </button>
              ) : undefined
            }
          >
            <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {myBedLine && cardCell(t('information.yourCardSleep'), myBedLine, 'bed')}
              {myCarLine && cardCell(t('information.yourCardRide'), myCarLine, 'car')}
              {phase !== 'during' &&
                myNightsLine &&
                cardCell(t('information.yourCardNights'), myNightsLine, 'nights')}
              {phase === 'during' && mySpent != null
                ? cardCell(
                    t('information.yourCardSpent'),
                    formatCurrency(Math.round(mySpent), locale),
                    'spent',
                  )
                : myAdvance > 0
                  ? cardCell(
                      t('information.yourCardDeposit'),
                      <span className="inline-flex items-center gap-2">
                        {formatCurrency(myAdvance, locale)}
                        <StatusBadge tone="green">{t('information.paidBadge')}</StatusBadge>
                      </span>,
                      'deposit',
                    )
                  : null}
            </div>
          </AccentCard>
        ) : null

  const anonymousHint =
    !viewer.authenticated && phase !== 'after' ? (
      <HintCard>
        <span>
          {t.rich('information.anonHint', {
            strong: (chunks) => (
              <strong className="text-gray-700 dark:text-slate-200">{chunks}</strong>
            ),
          })}
        </span>
        <a
          href="/login"
          className="rounded-lg border border-primary text-primary-dark dark:text-primary-light text-xs font-bold px-3.5 py-2 whitespace-nowrap hover:bg-primary/10 transition-colors"
        >
          {t('information.signIn')}
        </a>
      </HintCard>
    ) : null

  // ─── "Dnes" module (during) ──────────────────────────────────────────────

  const todayRows: React.ReactNode[] = []
  if (phase === 'during') {
    if (arrivalsToday.length > 0) {
      todayRows.push(
        <span key="arrivals">
          <strong className="font-semibold text-gray-900 dark:text-gray-100">
            {t('information.todayArrives', {
              names: arrivalsToday.map((p) => p.name + petSuffix(p)).join(', '),
            })}
          </strong>
        </span>,
      )
    }
    for (const item of programToday) {
      todayRows.push(
        <span key={`prog-${item.id}`} className="text-gray-700 dark:text-slate-300">
          {item.description}
        </span>,
      )
    }
  }
  const tomorrowLine =
    phase === 'during'
      ? [
          ...programTomorrow.map((p) => p.description),
          ...(isLastDayTomorrow && chata.checkOutTime
            ? [t('information.checkOutReminder', { time: chata.checkOutTime })]
            : []),
        ].join(' · ')
      : ''

  const todayBox =
    phase === 'during' && (todayRows.length > 0 || tomorrowLine) ? (
      <div className="rounded-2xl border border-emerald-600/25 bg-emerald-600/[0.05] dark:border-emerald-400/25 dark:bg-emerald-400/[0.06] px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 mb-2">
          {t('information.todayTitle')}
        </div>
        <div className="flex flex-col divide-y divide-emerald-600/10 dark:divide-white/[0.06]">
          {todayRows.map((row, idx) => (
            <div key={idx} className="py-1.5 text-sm">
              {row}
            </div>
          ))}
          {tomorrowLine && (
            <div className="py-1.5 text-[13px] text-gray-500 dark:text-slate-400">
              <span className="text-gray-400 dark:text-slate-500 mr-2">
                {t('information.tomorrowLabel')}
              </span>
              {tomorrowLine}
            </div>
          )}
        </div>
      </div>
    ) : null

  // ─── sections ────────────────────────────────────────────────────────────

  const weatherSection = hasWeather ? (
    <div>
      <SheetHeading
        icon={Sun}
        title={t('information.weatherTitle')}
        aside={
          <span className="font-mono">
            Open-Meteo{chata.destinationLocation ? ` · ${chata.destinationLocation}` : ''}
          </span>
        }
      />
      <TripWeather
        lat={chata.destinationLat as number}
        lng={chata.destinationLng as number}
        from={chata.tripDateFrom as string}
        to={chata.tripDateTo as string}
        locale={locale}
      />
    </div>
  ) : null

  const hasDestination = Boolean(
    chata.destinationName || chata.destinationLocation || chata.destinationDescription,
  )
  const destinationSection = hasDestination ? (
    <div>
      <SheetHeading
        icon={MapPin}
        title={phase === 'after' ? t('information.whereWereTitle') : t('information.whereTitle')}
      />
      <div className={photos.length > 0 && phase !== 'after' ? 'grid gap-5 md:grid-cols-[1.15fr_1fr]' : ''}>
        <div className="rounded-2xl border-l-[5px] border-primary bg-white shadow-[0_6px_20px_rgba(0,0,0,0.07)] dark:bg-white/[0.03] dark:shadow-none dark:border-l-primary px-5 py-5 sm:px-6">
          {chata.destinationName && (
            <h4 className="font-serif text-lg sm:text-[21px] font-bold text-gray-900 dark:text-gray-100 m-0 mb-2.5">
              {chata.destinationName}
            </h4>
          )}
          {chata.destinationDescription && (
            <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed whitespace-pre-line m-0 mb-3.5">
              {chata.destinationDescription}
            </p>
          )}
          <div className="flex flex-col gap-2 mb-3.5">
            {chata.destinationLocation && (
              <InfoRow label={t('information.addressLabel')}>{chata.destinationLocation}</InfoRow>
            )}
            {(chata.checkInTime || chata.checkOutTime) && phase !== 'after' && (
              <InfoRow label={t('information.checkInLabel')}>
                {[
                  chata.checkInTime ? `${t('information.checkInPrefix')} ${chata.checkInTime}` : null,
                  chata.checkOutTime
                    ? `${t('information.checkOutPrefix')} ${chata.checkOutTime}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </InfoRow>
            )}
            {chata.parking && phase !== 'after' && (
              <InfoRow label={t('information.parking')}>{chata.parking}</InfoRow>
            )}
            {phase === 'after' && chata.tripDateFrom && chata.tripDateTo && (
              <InfoRow label={t('information.termLabel')}>
                {formatDateRangeLong(chata.tripDateFrom, chata.tripDateTo, locale)}
              </InfoRow>
            )}
          </div>
          {(chata.destinationLinks || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(chata.destinationLinks || []).map((link, idx) => (
                <PrimaryAction key={idx} href={link.url}>
                  <ExternalLink size={13} aria-hidden="true" /> {link.title}
                </PrimaryAction>
              ))}
            </div>
          )}
        </div>
        {photos.length > 0 && phase !== 'after' && (
          <div className="flex flex-col gap-3 mt-4 md:mt-0">
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.07] relative">
              <img
                src={photos[0].url as string}
                alt={photos[0].alt || chata.destinationName || chataName}
                loading="lazy"
                className="w-full h-44 object-cover"
              />
              {navUrl && (
                <a
                  href={navUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2.5 bottom-2.5 rounded-lg bg-gray-900/90 text-white text-xs font-semibold px-3 py-1.5 hover:bg-gray-900"
                >
                  {t('information.navigate')} →
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null

  const packingSection =
    (chata.packingItems || []).length > 0 || (chata.amenities || []).length > 0 ? (
      <div>
        <SheetHeading icon={Check} title={t('information.packingTitle')} />
        {(chata.packingItems || []).length > 0 && (
          <div className="flex flex-col gap-2.5 text-sm text-gray-700 dark:text-slate-300">
            {(chata.packingItems || []).map((entry, idx) => (
              <div key={entry.id || idx} className="flex gap-2.5">
                <span className="text-primary dark:text-primary-light" aria-hidden="true">
                  ·
                </span>
                <span>{entry.item}</span>
              </div>
            ))}
          </div>
        )}
        {(chata.amenities || []).length > 0 && (
          <>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400 mt-4 mb-2.5">
              {t('information.amenitiesTitle')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(chata.amenities || []).map((amenity, idx) =>
                amenity.available !== false ? (
                  <span
                    key={amenity.id || idx}
                    className="rounded-full bg-gray-100 text-gray-700 dark:bg-white/[0.07] dark:text-slate-300 text-[13px] font-medium px-3 py-1.5"
                  >
                    ✓ {amenity.name}
                  </span>
                ) : (
                  <span
                    key={amenity.id || idx}
                    className="rounded-full bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 text-[13px] font-medium px-3 py-1.5"
                  >
                    ✗ {amenity.name}
                  </span>
                ),
              )}
            </div>
          </>
        )}
      </div>
    ) : null

  const basicInfoSection =
    (chata.basicInfo || []).length > 0 ? (
      <div>
        <SheetHeading icon={Info} title={t('information.importantInfoTitle')} />
        <div className="flex flex-col gap-2.5 text-sm text-gray-700 dark:text-slate-300">
          {(chata.basicInfo || []).map((item, idx) => (
            <div key={item.id || idx} className="flex gap-2.5">
              <span className="text-primary dark:text-primary-light" aria-hidden="true">
                ·
              </span>
              <span>{item.info}</span>
            </div>
          ))}
        </div>
      </div>
    ) : null

  const arrivalsSection =
    phase !== 'after' && arrivalGroups.length > 0 && nights > 0 ? (
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
    ) : null

  const whoIsHereSection =
    phase === 'during' && tonight > 0 ? (
      (() => {
        const present = presentOnNight(chata, participants, tonight)
        if (present.length === 0) return null
        return (
          <div>
            <SheetHeading icon={Users} title={t('information.whoIsHereTitle')} />
            <div className="flex flex-wrap gap-1.5">
              {present.map((p) => (
                <PersonChip
                  key={p.id}
                  highlight={viewer.linkedParticipantIds.includes(p.id)}
                >
                  {p.name +
                    petSuffix(p) +
                    (viewer.linkedParticipantIds.includes(p.id)
                      ? ` ${t('information.youSuffix')}`
                      : '')}
                </PersonChip>
              ))}
              {arrivalsToday.length > 0 && (
                <PersonChip dashed>
                  {arrivalsToday.map((p) => p.name + petSuffix(p)).join(', ')} —{' '}
                  {t('information.arrivingToday')}
                </PersonChip>
              )}
            </div>
            {capacity > 0 && (
              <div className="text-[13px] text-gray-500 dark:text-slate-400 mt-3">
                {t('information.sleepsTonight', { count: present.length, capacity })}
              </div>
            )}
          </div>
        )
      })()
    ) : null

  const programSection =
    phase !== 'after' && (chata.program || []).length > 0 ? (
      <div>
        <SheetHeading icon={Calendar} title={t('information.programTitle')} />
        <div className="flex flex-col gap-3">
          {(chata.program || []).map((item, idx) => {
            const isToday = phase === 'during' && dayOnly(item.date).getTime() === today.getTime()
            return (
              <div key={item.id || idx} className="flex gap-3.5 text-sm">
                <span
                  className={`w-12 shrink-0 font-bold ${
                    isToday
                      ? 'text-primary-dark dark:text-primary-light'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {programDayLabel(item.date, locale)}
                </span>
                <span className="text-gray-700 dark:text-slate-300 leading-normal">
                  {item.description}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    ) : null

  const surroundingsSection =
    phase !== 'after' && (placeItems.length > 0 || tripItems.length > 0) ? (
      <div>
        <SheetHeading icon={Mountain} title={t('information.surroundingsTitle')} />
        {placeItems.length > 0 && (
          <div className="flex flex-col gap-2.5 text-sm">
            {placeItems.map((item, idx) => (
              <div key={item.id || idx} className="flex justify-between gap-2.5">
                <span className="text-gray-900 dark:text-gray-100 font-semibold min-w-0">
                  {item.name}
                </span>
                {item.note && (
                  <span className="text-gray-500 dark:text-slate-400 text-right shrink-0">
                    {item.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {tripItems.length > 0 && (
          <>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400 mt-4 mb-2.5">
              {t('information.tripsLabel')}
            </div>
            <div className="flex flex-col gap-2.5 text-sm">
              {tripItems.map((item, idx) => (
                <div key={item.id || idx} className="flex justify-between gap-2.5">
                  <span className="text-gray-900 dark:text-gray-100 font-semibold min-w-0">
                    {item.name}
                  </span>
                  {item.note && (
                    <span className="text-gray-500 dark:text-slate-400 text-right shrink-0">
                      {item.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    ) : null

  const contactSection =
    (chata.contactRules || []).length > 0 ? (
      <div>
        <SheetHeading icon={Phone} title={t('information.contactTitle')} />
        <div className="flex flex-col gap-2.5">
          {(chata.contactRules || []).map((row, idx) => (
            <InfoRow key={row.id || idx} label={row.label}>
              {row.value}
            </InfoRow>
          ))}
        </div>
        <div className="mt-3.5 rounded-xl bg-gray-50 border border-gray-100 dark:bg-white/[0.04] dark:border-white/[0.06] px-3.5 py-3 text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
          {t('information.publicPageNote')}
        </div>
      </div>
    ) : null

  const gallerySection =
    photos.length > (phase === 'after' ? 0 : 1) ? (
      <div>
        <SheetHeading
          icon={ImageIcon}
          title={t('information.galleryTitle')}
          aside={
            phase === 'after' && chata.sharedAlbumUrl ? (
              <a
                href={chata.sharedAlbumUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-dark dark:text-primary-light font-semibold hover:underline"
              >
                {t('information.sharedAlbumLink')} →
              </a>
            ) : undefined
          }
        />
        <div
          className={`grid gap-3 grid-cols-2 ${phase === 'after' ? 'md:grid-cols-4' : ''}`}
        >
          {(phase === 'after' ? photos : photos.slice(1)).map((photo, idx) => (
            <div
              key={idx}
              className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.07]"
            >
              <img
                src={photo.url as string}
                alt={photo.alt || t('information.photoAlt', { name: chataName, number: idx + 1 })}
                loading="lazy"
                className="w-full h-32 object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    ) : null

  const whoWasSection =
    phase === 'after' && participants.length > 0 ? (
      <div>
        <SheetHeading icon={Users} title={t('information.whoWasTitle')} />
        <div className="flex flex-wrap gap-1.5">
          {[...participants]
            .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
            .map((p) => (
              <PersonChip key={p.id} highlight={viewer.linkedParticipantIds.includes(p.id)}>
                {p.name +
                  petSuffix(p) +
                  (viewer.linkedParticipantIds.includes(p.id)
                    ? ` ${t('information.youSuffix')}`
                    : '')}
              </PersonChip>
            ))}
        </div>
      </div>
    ) : null

  // ─── transport section (restyled, phase-filtered) ────────────────────────

  const transportOptions = (chata.publicTransportOptions || []).filter(
    (option) => phase !== 'during' || option.direction === 'zpet',
  )
  const carRoutes = phase === 'during' ? [] : chata.carRoutes || []

  const transportSection =
    carRoutes.length > 0 || transportOptions.length > 0 ? (
      <div>
        <SheetHeading
          icon={Car}
          title={
            phase === 'during' ? t('information.wayBackTitle') : t('information.transportTitle')
          }
        />
        {carRoutes.length > 0 && (
          <div className="grid gap-3.5 md:grid-cols-2 mb-4">
            {carRoutes.map((route, idx) => (
              <div
                key={route.id || idx}
                className={`rounded-xl bg-white shadow-[0_4px_14px_rgba(0,0,0,0.06)] dark:bg-white/[0.03] dark:shadow-none px-4 py-3.5 border-l-4 ${
                  idx === 0
                    ? 'border-primary'
                    : 'border-gray-200 dark:border-white/[0.12]'
                }`}
              >
                <div className="flex justify-between items-baseline gap-3 mb-1">
                  <strong className="text-[15px] text-gray-900 dark:text-gray-100">
                    {t('information.fromPrefix', { from: route.from })}
                  </strong>
                  <span className="text-[13px] text-gray-500 dark:text-slate-400 shrink-0">
                    {[route.duration, route.distance].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
                  {route.route}
                </div>
              </div>
            ))}
          </div>
        )}
        {chata.parking && carRoutes.length > 0 && (
          <div className="text-[13px] text-gray-500 dark:text-slate-400 mb-4">
            <strong className="text-gray-700 dark:text-slate-300">
              {t('information.parking')}
            </strong>{' '}
            {chata.parking}
          </div>
        )}
        {transportOptions.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {transportOptions.map((option, idx) => {
              const isExpanded = expandedTransport.includes(idx)
              const connections = option.connections || []
              const firstDeparture = connections[0]?.departure
              const lastArrival = connections[connections.length - 1]?.arrival
              const eventDate =
                option.direction === 'zpet' ? chata.tripDateTo : chata.tripDateFrom

              return (
                <div
                  key={option.id || idx}
                  className="rounded-2xl border border-gray-200 dark:border-white/[0.08] px-4 py-3.5 sm:px-5"
                >
                  <div
                    className="flex items-center justify-between gap-3 cursor-pointer"
                    onClick={() => toggleTransport(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleTransport(idx)
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 flex-wrap min-w-0">
                      <strong className="text-[15px] text-gray-900 dark:text-gray-100">
                        {option.title}
                      </strong>
                      {firstDeparture && lastArrival && (
                        <span className="text-[13px] text-gray-500 dark:text-slate-400 tabular-nums">
                          {firstDeparture} → {lastArrival}
                        </span>
                      )}
                      {option.totalDuration && (
                        <span className="rounded-md bg-gray-100 text-gray-500 dark:bg-white/[0.07] dark:text-slate-400 text-xs font-semibold px-2 py-0.5">
                          {option.totalDuration}
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
                    )}
                  </div>
                  {isExpanded && (
                    <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-gray-100 dark:border-white/[0.07] animate-slideDown">
                      {connections.map((conn, connIdx) => (
                        <div
                          key={conn.id || connIdx}
                          className="flex gap-3 text-[13px] items-baseline"
                        >
                          <span className="font-mono text-gray-400 dark:text-slate-500 w-24 shrink-0 inline-flex items-center gap-1.5">
                            {conn.type === 'autobus' ? (
                              <Bus size={12} aria-hidden="true" />
                            ) : (
                              <Train size={12} aria-hidden="true" />
                            )}
                            {conn.number}
                          </span>
                          <span className="text-gray-700 dark:text-slate-300">
                            <strong>{conn.from}</strong> {conn.departure} →{' '}
                            <strong>{conn.to}</strong> {conn.arrival}
                          </span>
                        </div>
                      ))}
                      {option.notes && (
                        <div className="text-[13px] text-gray-500 dark:text-slate-400">
                          {option.notes}
                        </div>
                      )}
                      {firstDeparture && lastArrival && eventDate && (
                        <div className="mt-1">
                          <PrimaryAction
                            href={transportEventUrl(option, chataName, eventDate, t)}
                          >
                            <CalendarPlus size={13} aria-hidden="true" />{' '}
                            {t('information.addToCalendar')}
                          </PrimaryAction>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    ) : null

  // ─── assembly (phase drives the order) ───────────────────────────────────

  const pairGrid = (sections: Array<React.ReactNode | null>, key: string) => {
    const present = sections.filter(Boolean)
    if (present.length === 0) return null
    return (
      <div key={key} className="md:grid md:grid-cols-2 md:gap-x-11 md:items-start">
        {present.map((section, idx) => (
          <div key={idx}>{section}</div>
        ))}
      </div>
    )
  }

  const body =
    phase === 'after'
      ? [
          gallerySection,
          pairGrid([destinationSection, whoWasSection], 'after-pair'),
        ]
      : phase === 'during'
        ? [
            weatherSection,
            pairGrid([surroundingsSection, contactSection], 'during-pair-1'),
            pairGrid([whoIsHereSection, programSection], 'during-pair-2'),
            transportSection,
            destinationSection,
            basicInfoSection,
          ]
        : [
            weatherSection,
            destinationSection,
            pairGrid([packingSection, arrivalsSection], 'before-pair-1'),
            pairGrid([programSection, surroundingsSection], 'before-pair-2'),
            basicInfoSection,
            transportSection,
            pairGrid([contactSection, gallerySection], 'before-pair-3'),
          ]

  return (
    <Sheet>
      <div className="flex flex-col gap-4">
        {hero}
        {recapItems.length > 0 && <StatStrip items={recapItems} />}
        {todayBox}
        {personalCard}
        {anonymousHint}
      </div>
      {body.map((section, idx) => (
        <div key={idx}>{section}</div>
      ))}
    </Sheet>
  )
}
