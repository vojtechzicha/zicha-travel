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
  KeyRound,
  Lock,
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
import { calendarDetails, joinParts } from '@/lib/tripCalendar'
import { formatCurrency } from '@/lib/formatCurrency'
import {
  countdownLabel,
  formatDateRangeLong,
  nightsLabel,
  settlementFromBalance,
  tentativeWindowLabel,
  untilLabel,
  viewerCost,
} from '@/lib/chataSelection'
import { getTripNights, isTentativeTrip } from '../utils/participantHelpers'
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
  personNights,
  presentOnNight,
  sleepingCapacity,
  tonightNumber,
  transportRiders,
  tripDayIndex,
  tripTotalDays,
  type TripPhase,
} from '../utils/tripData'
import { AlbumMoments } from './AlbumMoments'
import { ArrivalTimeline } from './ArrivalTimeline'
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
import { PhotoLightbox } from './PhotoLightbox'

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
  // index into `photos` — click-to-enlarge for the gallery + destination photo
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const phase: TripPhase | null = getTripPhase(chata)
  const nights = getTripNights(chata)
  // Tentative dates: tripDateFrom/To only bound a window, nights come from
  // tripPlannedNights. No countdown, no calendar event, no weather.
  const tentative = isTentativeTrip(chata)
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
  const hasPublicTransport = (chata.publicTransportOptions || []).length > 0
  const arrivalGroups = getArrivalGroups(chata, participants)
  const navUrl = navigateUrl(chata)
  // Link back to this page from the calendar event. ChataView fetches its data
  // in an effect, so this only ever runs in the browser; guarded regardless.
  const pageUrl =
    typeof window === 'undefined' ? null : `${window.location.origin}${window.location.pathname}`
  const today = dayOnly(new Date())
  const tonight = tonightNumber(chata)

  const hasWeather =
    !tentative &&
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

  // Chronological regardless of the order rows were added in the admin
  const programItems = [...(chata.program || [])].sort(
    (a, b) => dayOnly(a.date).getTime() - dayOnly(b.date).getTime(),
  )
  const programToday = programItems.filter(
    (item) => dayOnly(item.date).getTime() === today.getTime(),
  )
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const programTomorrow = programItems.filter(
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

  // An all-day event carries only a title and a date range, so everything that
  // makes it useful later (times, program, packing list, contacts, the link
  // back here) goes into the description. Never privateInfo — the event lands
  // on Google's servers and gets forwarded around.
  const calendarDescription = calendarDetails([
    {
      lines: [
        joinParts([
          chata.destinationName || chata.name,
          chata.destinationLocation || chata.location,
        ]),
        joinParts([
          nights > 0 ? nightsLabel(nights, locale) : null,
          chata.checkInTime ? `${t('information.checkInPrefix')} ${chata.checkInTime}` : null,
          chata.checkOutTime ? `${t('information.checkOutPrefix')} ${chata.checkOutTime}` : null,
        ]),
        participants.length > 0
          ? `${participants.length} ${t('information.peopleUnit', { count: participants.length })}` +
            (petsCount > 0 ? ` + ${t('information.petsUnit', { count: petsCount })}` : '')
          : null,
      ],
    },
    {
      title: t('information.importantInfoTitle'),
      lines: (chata.basicInfo || []).map((row) => row.info),
    },
    {
      title: t('information.programTitle'),
      lines: programItems.map(
        (item) => `${programDayLabel(item.date, locale)} · ${item.description}`,
      ),
    },
    {
      title: t('information.packingTitle'),
      lines: [joinParts((chata.packingItems || []).map((row) => row.item))],
    },
    {
      title: t('information.contactTitle'),
      lines: (chata.contactRules || []).map((row) => `${row.label}: ${row.value}`),
    },
    {
      title: t('information.calendar.who'),
      // The name list lands in the calendar link's URL, which is part of the
      // indexable anonymous render — signed-in viewers only (blocker 3);
      // the headcount above stays for everyone.
      lines: viewer.authenticated
        ? [participants.map((p) => `${p.name}${petSuffix(p)}`).join(', ')]
        : [],
    },
    {
      lines: [
        pageUrl ? `${t('information.calendar.tripPage')}: ${pageUrl}` : null,
        chata.sharedAlbumUrl ? `${t('information.sharedAlbum')}: ${chata.sharedAlbumUrl}` : null,
      ],
    },
  ])

  const calendarUrl =
    chata.tripDateFrom && chata.tripDateTo && !tentative
      ? googleCalendarAllDayUrl({
          // The trip event lands among other people's calendar entries — the
          // full name carries there, the short one wouldn't.
          title: chata.name,
          dateFrom: new Date(chata.tripDateFrom).toLocaleDateString('en-CA'),
          dateTo: new Date(chata.tripDateTo).toLocaleDateString('en-CA'),
          details: calendarDescription || undefined,
          // Comma-joined: this one is an address, not a display line.
          location:
            [chata.destinationName, chata.destinationLocation || chata.location]
              .filter(Boolean)
              .join(', ') || undefined,
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
        (hasPublicTransport ? ` ${t('information.orPublicTransport')}` : ''),
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
      {tentative
        ? t('information.badgeTentative')
        : t('information.badgeBefore', {
            countdown: countdownLabel(daysUntilTrip(chata), locale),
          })}
    </div>
  )
  // Tentative hero: one window box instead of arrival -> departure
  const windowBox = (
    <div className="text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-gray-400 dark:text-slate-500">
        {t('information.whenTitle')}
      </div>
      <div className="font-serif text-xl sm:text-[26px] font-black text-gray-900 dark:text-gray-100">
        {chata.tripDateFrom && chata.tripDateTo
          ? tentativeWindowLabel(chata.tripDateFrom, chata.tripDateTo, locale)
          : ''}
      </div>
      <div className="text-[13px] text-gray-500 dark:text-slate-400">
        {nights > 0
          ? t('information.tentativeNightsNote', { nights: nightsLabel(nights, locale) })
          : t('information.tentativeNote')}
      </div>
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
  // The album link shows in every phase — people should add photos as the
  // trip happens, not find the album for the first time in the recap.
  const albumAction = chata.sharedAlbumUrl ? (
    <SecondaryAction href={chata.sharedAlbumUrl}>
      <ImageIcon size={14} aria-hidden="true" />{' '}
      {phase === 'during' ? t('information.sharedAlbumDuring') : t('information.sharedAlbum')}
    </SecondaryAction>
  ) : null

  const heroActions = (calendar: boolean) => (
    <>
      {calendar && calendarUrl && (
        <SecondaryAction href={calendarUrl}>
          <CalendarPlus size={14} aria-hidden="true" /> {t('information.tripToCalendar')}
        </SecondaryAction>
      )}
      {albumAction}
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
          {tentative ? windowBox : dateBoxes}
          {heroStats.length > 0 && <StatStrip items={heroStats} bordered={false} />}
          <div className="flex flex-wrap justify-center gap-2">{heroActions(true)}</div>
        </div>
        {/* desktop: dates · badge · stacked actions, stats strip below */}
        <div className="hidden sm:flex items-center justify-between gap-6">
          {tentative ? windowBox : dateBoxes}
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
        {(navUrl || albumAction) && (
          <div className="flex flex-wrap justify-center gap-2 mt-3 sm:mt-0 sm:shrink-0">
            {heroActions(false)}
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
                  ? tentative
                    ? tentativeWindowLabel(chata.tripDateFrom, chata.tripDateTo, locale)
                    : formatDateRangeLong(chata.tripDateFrom, chata.tripDateTo, locale)
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
          // tentative: night N has no weekday yet, so drop the "st až ne" range
          (tentative
            ? ''
            : ' · ' +
              t('information.nightsRange', {
                from: nightLabel(chata, 1, locale),
                to: nightLabel(chata, nights + 1, locale),
              }))
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
            {viewer.authenticated
              ? t('information.todayArrives', {
                  names: arrivalsToday.map((p) => p.name + petSuffix(p)).join(', '),
                })
              : t('information.todayArrivesCount', { count: arrivalsToday.length })}
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
                {tentative
                  ? tentativeWindowLabel(chata.tripDateFrom, chata.tripDateTo, locale)
                  : formatDateRangeLong(chata.tripDateFrom, chata.tripDateTo, locale)}
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
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.07] relative group">
              <button
                type="button"
                onClick={() => setLightboxIdx(0)}
                className="block w-full cursor-zoom-in"
                aria-label={t('information.photoOpen')}
              >
                <img
                  src={photos[0].url as string}
                  alt={photos[0].alt || chata.destinationName || chataName}
                  loading="lazy"
                  className="w-full h-44 object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
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

  // Signed-in viewers only: the anonymous Informace render is indexable and
  // must carry no participant names (blocker 3, decision 7). The section
  // stays reachable without sign-in on the noindexed Účastníci tab
  // (decision 12), which renders the same ArrivalTimeline for everyone.
  const arrivalsSection =
    viewer.authenticated && phase !== 'after' && arrivalGroups.length > 0 && nights > 0 ? (
      <ArrivalTimeline chata={chata} participants={participants} viewer={viewer} />
    ) : null

  const whoIsHereSection =
    phase === 'during' && tonight > 0 ? (
      (() => {
        const present = presentOnNight(chata, participants, tonight)
        if (present.length === 0) return null
        return (
          <div>
            <SheetHeading icon={Users} title={t('information.whoIsHereTitle')} />
            {viewer.authenticated ? (
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
                    {arrivalsToday.map((p) => p.name + petSuffix(p)).join(', ')} ·{' '}
                    {t('information.arrivingToday')}
                  </PersonChip>
                )}
              </div>
            ) : (
              // Anonymous (indexable) render: counts, no names — the names
              // stay one click away on the noindexed Účastníci tab
              <div className="text-sm text-gray-700 dark:text-slate-300">
                {t('information.whoIsHereCount', { count: present.length })}
                {arrivalsToday.length > 0 &&
                  ` ${t('information.todayArrivesCount', { count: arrivalsToday.length })}.`}
              </div>
            )}
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
    phase !== 'after' && programItems.length > 0 ? (
      <div>
        <SheetHeading icon={Calendar} title={t('information.programTitle')} />
        <div className="flex flex-col gap-3">
          {programItems.map((item, idx) => {
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

  // Name keeps its intrinsic width (no min-w-0 — a squeezed flex item would
  // overflow and paint over the note); the note wraps in the remaining space
  // or drops to its own right-aligned line when the row gets tight.
  const surroundingsRows = (items: typeof placeItems) => (
    <div className="flex flex-col gap-2.5 text-sm">
      {items.map((item, idx) => (
        <div
          key={item.id || idx}
          className="flex flex-wrap items-baseline justify-between gap-x-2.5"
        >
          <span className="text-gray-900 dark:text-gray-100 font-semibold">{item.name}</span>
          {item.note && (
            <span className="min-w-0 flex-1 text-gray-500 dark:text-slate-400 text-right">
              {item.note}
            </span>
          )}
        </div>
      ))}
    </div>
  )

  const surroundingsSection =
    phase !== 'after' && (placeItems.length > 0 || tripItems.length > 0) ? (
      <div>
        <SheetHeading icon={Mountain} title={t('information.surroundingsTitle')} />
        {placeItems.length > 0 && surroundingsRows(placeItems)}
        {tripItems.length > 0 && (
          <>
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-slate-400 mt-4 mb-2.5">
              {t('information.tripsLabel')}
            </div>
            {surroundingsRows(tripItems)}
          </>
        )}
      </div>
    ) : null

  // ─── "Klíče a Wi-Fi" — the locked-in details ─────────────────────────────
  // Signed-in viewers get the values; anonymous visitors get the same rows
  // with masked values (the slug API never sent them) and a sign-in nudge.
  // Gone after the trip — a stale Wi-Fi password helps nobody.

  const privateRows = chata.privateInfo || []
  const privateSection =
    phase !== 'after' && privateRows.length > 0 ? (
      <div>
        <SheetHeading
          icon={KeyRound}
          title={t('information.privateTitle')}
          aside={
            <span className="inline-flex items-center gap-1.5">
              <Lock size={12} aria-hidden="true" />
              {t('information.privateAside')}
            </span>
          }
        />
        <div className="flex flex-col gap-2.5">
          {privateRows.map((row, idx) => (
            <InfoRow key={row.id || idx} label={row.label}>
              {viewer.authenticated ? (
                <span className="select-all font-medium">{row.value}</span>
              ) : (
                <span
                  className="tracking-widest text-gray-300 dark:text-slate-600 select-none"
                  aria-label={t('information.privateMasked')}
                >
                  ••••••••
                </span>
              )}
            </InfoRow>
          ))}
        </div>
        {viewer.authenticated ? (
          <div className="mt-3.5 rounded-xl bg-gray-50 border border-gray-100 dark:bg-white/[0.04] dark:border-white/[0.06] px-3.5 py-3 text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
            {t('information.privateVisibleNote')}
          </div>
        ) : (
          <div className="mt-3.5">
            <HintCard>
              <span>{t('information.privateTeaser')}</span>
              <a
                href="/login"
                className="rounded-lg border border-primary text-primary-dark dark:text-primary-light text-xs font-bold px-3.5 py-2 whitespace-nowrap hover:bg-primary/10 transition-colors"
              >
                {t('information.signIn')}
              </a>
            </HintCard>
          </div>
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
          {privateRows.length > 0
            ? t('information.publicPageNoteLocked')
            : t('information.publicPageNote')}
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
            chata.sharedAlbumUrl ? (
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
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {(phase === 'after' ? photos : photos.slice(1)).map((photo, idx) => {
            const photoIdx = phase === 'after' ? idx : idx + 1
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setLightboxIdx(photoIdx)}
                className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.07] group cursor-zoom-in hover:shadow-lg dark:hover:border-white/[0.15] transition-shadow"
                aria-label={t('information.photoOpen')}
              >
                <img
                  src={photo.url as string}
                  alt={photo.alt || t('information.photoAlt', { name: chataName, number: idx + 1 })}
                  loading="lazy"
                  className="w-full h-32 object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
            )
          })}
        </div>
      </div>
    ) : null

  // "Momentky z alba" — hotlinked photos from the shared Google Photos
  // album, signed-in viewers only (the anonymous, indexable render stays
  // photo-free). Not before the trip: whatever sits in the album then is
  // noise (test shots, leftovers), and the hero already promotes the album
  // link. During it's the live feed, after it's the memory reel and leads
  // the page. The component hides itself while loading and whenever the
  // album gives it nothing.
  const albumMomentsSection =
    phase !== 'before' && viewer.authenticated && chata.sharedAlbumUrl ? (
      <AlbumMoments chataId={chata.id} albumUrl={chata.sharedAlbumUrl} />
    ) : null

  const whoWasSection =
    phase === 'after' && participants.length > 0 ? (
      <div>
        <SheetHeading icon={Users} title={t('information.whoWasTitle')} />
        {viewer.authenticated ? (
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
        ) : (
          // Anonymous (indexable) render: a count instead of the name chips
          <p className="text-sm text-gray-700 dark:text-slate-300 m-0">
            {t('information.whoWasCount', { count: participants.length })}
          </p>
        )}
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
              // no calendar link while the dates are tentative — the window
              // bounds are not travel days
              const eventDate = tentative
                ? null
                : option.direction === 'zpet'
                  ? chata.tripDateTo
                  : chata.tripDateFrom
              const riders = transportRiders(option, participants)

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
                  {/* who takes this connection — a quiet nudge, the full
                      rundown lives in Organizace; only when expanded */}
                  {isExpanded && riders.length > 0 && (
                    <div className="text-[13px] text-gray-500 dark:text-slate-400 mt-1.5">
                      {viewer.authenticated ? (
                        <>
                          {t('information.ridersLabel')}{' '}
                          {riders.map((p, i) => {
                            const isMine = viewer.linkedParticipantIds.includes(p.id)
                            return (
                              <span key={p.id}>
                                {i > 0 && ', '}
                                <span
                                  className={
                                    isMine
                                      ? 'font-semibold text-primary-dark dark:text-primary-light'
                                      : undefined
                                  }
                                >
                                  {p.name}
                                  {petSuffix(p)}
                                  {isMine && ` ${t('information.youSuffix')}`}
                                </span>
                              </span>
                            )
                          })}
                        </>
                      ) : (
                        // Anonymous render stays name-free; the full rider
                        // rundown lives on the noindexed Organizace tab
                        t('information.ridersCount', { count: riders.length })
                      )}
                    </div>
                  )}
                  {isExpanded && (
                    <div className="flex flex-col gap-2 pt-3 mt-3 border-t border-gray-100 dark:border-white/[0.07] animate-slideDown">
                      {connections.map((conn, connIdx) => (
                        <div
                          key={conn.id || connIdx}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]"
                        >
                          {/* vehicle chip sizes to its content — real train names
                              ("Ex2 (EC 122 „Valašský expres“)") overflow a fixed column */}
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 text-gray-500 dark:bg-white/[0.07] dark:text-slate-400 font-mono text-xs px-2 py-1 shrink-0 whitespace-nowrap">
                            {conn.type === 'autobus' ? (
                              <Bus size={12} aria-hidden="true" />
                            ) : (
                              <Train size={12} aria-hidden="true" />
                            )}
                            {conn.number}
                          </span>
                          <span className="text-gray-700 dark:text-slate-300">
                            <strong className="text-gray-900 dark:text-gray-100">
                              {conn.from}
                            </strong>{' '}
                            <span className="tabular-nums">{conn.departure}</span>{' '}
                            <span className="text-primary dark:text-primary-light">→</span>{' '}
                            <strong className="text-gray-900 dark:text-gray-100">{conn.to}</strong>{' '}
                            <span className="tabular-nums">{conn.arrival}</span>
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

  // CSS multicol balances column heights natively, so a short section stacks
  // under another instead of leaving a hole next to a tall neighbour. A lone
  // surviving section renders full width — no ghost column.
  //
  // Inside the columns the heading's own top margin is swapped for padding on
  // the wrapper: a margin at the top of a column fragment gets truncated, so
  // the section opening the second column sat 36px higher than the first one.
  // Padding survives the break, and stacked sections keep the same gap.
  const flowColumns = (sections: Array<React.ReactNode | null>, key: string) => {
    const present = sections.filter(Boolean)
    if (present.length === 0) return null
    if (present.length === 1) return <div key={key}>{present[0]}</div>
    return (
      <div key={key} className="md:columns-2 md:gap-x-11">
        {present.map((section, idx) => (
          <div
            key={idx}
            className="md:break-inside-avoid md:pt-9 md:[&_.sheet-heading]:mt-0"
          >
            {section}
          </div>
        ))}
      </div>
    )
  }

  const body =
    phase === 'after'
      ? [
          // memories first: real photos from the trip beat the pre-loaded
          // gallery once the trip is over, so the gallery moves to the end
          albumMomentsSection,
          flowColumns([destinationSection, whoWasSection], 'after-flow'),
          gallerySection,
        ]
      : phase === 'during'
        ? [
            // during the trip the key codes and Wi-Fi come first — that's
            // what you look up while standing at the door
            privateSection,
            weatherSection,
            flowColumns(
              [surroundingsSection, contactSection, whoIsHereSection, programSection],
              'during-flow',
            ),
            albumMomentsSection,
            transportSection,
            destinationSection,
            basicInfoSection,
            // the promo gallery stays reachable mid-trip, but everything
            // you actually need while there outranks it
            gallerySection,
          ]
        : [
            weatherSection,
            destinationSection,
            flowColumns(
              [packingSection, arrivalsSection, programSection, surroundingsSection],
              'before-flow',
            ),
            basicInfoSection,
            privateSection,
            transportSection,
            contactSection,
            gallerySection,
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
      {lightboxIdx !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
        />
      )}
    </Sheet>
  )
}
