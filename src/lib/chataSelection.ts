/**
 * Pure logic for the homepage ("Výběr chaty") redesign: time-based
 * bucketing of chatas (probíhá / plánujeme / proběhlo), Czech countdown and
 * date-range labels, and the viewer's per-chata settlement status.
 *
 * Everything takes `today` explicitly so it stays unit-testable.
 */

/** Minimal shape needed for bucketing — Chata docs satisfy it. */
export interface DatedChata {
  tripDateFrom?: string | null
  tripDateTo?: string | null
  /** true = the dates only bound a window, the exact dates aren't set yet */
  tripDatesTentative?: boolean | null
}

/** Day-granular number (UTC date part). Trip dates are stored at 12:00Z, so
 * the UTC date component matches the Czech calendar date. */
function dayNumber(value: string | Date): number {
  const d = typeof value === 'string' ? new Date(value) : value
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000)
}

/** Day number of the CURRENT moment in the Czech calendar. Between Czech
 * midnight and UTC midnight the UTC date is still "yesterday", which would
 * keep a trip starting today under "upcoming" — all labels here follow the
 * Czech calendar, so `today` must too. */
function czechDayNumber(value: Date): number {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
  const [year, month, day] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

export interface ChataBuckets<T> {
  /** tripDateFrom <= today <= tripDateTo */
  live: T[]
  /** starts after today, soonest first */
  upcoming: T[]
  /** already over (or undated), most recent first, undated last */
  past: T[]
}

export function bucketChatas<T extends DatedChata>(chatas: T[], today: Date): ChataBuckets<T> {
  const todayDay = czechDayNumber(today)
  const live: T[] = []
  const upcoming: T[] = []
  const pastDated: T[] = []
  const undated: T[] = []

  // Either date may be missing independently — a one-sided record uses the
  // known date as both start and end (a from-only or to-only "one-day" trip)
  const startOf = (c: T) => dayNumber((c.tripDateFrom ?? c.tripDateTo)!)
  const endOf = (c: T) => dayNumber((c.tripDateTo ?? c.tripDateFrom)!)

  for (const chata of chatas) {
    if (!chata.tripDateFrom && !chata.tripDateTo) {
      undated.push(chata)
    } else if (startOf(chata) <= todayDay && endOf(chata) >= todayDay) {
      // A tentative trip is never "live": today being inside the window does
      // not mean the trip is happening. It stays upcoming until the window ends.
      if (chata.tripDatesTentative === true) upcoming.push(chata)
      else live.push(chata)
    } else if (startOf(chata) > todayDay) {
      upcoming.push(chata)
    } else {
      pastDated.push(chata)
    }
  }

  upcoming.sort((a, b) => startOf(a) - startOf(b))
  pastDated.sort((a, b) => endOf(b) - endOf(a))
  return { live, upcoming, past: [...pastDated, ...undated] }
}

/** Whole days from today (Czech calendar) until the given date
 * (0 = today, negative = past). */
export function daysUntil(date: string | Date, today: Date): number {
  return dayNumber(date) - czechDayNumber(today)
}

// Date-grammar labels live here, not in the message catalogs: Czech needs
// genitive month/weekday forms that Intl cannot produce ("5. srpna", "do
// čtvrtka"), so the Czech path keeps its hand-built tables while English
// goes through Intl. Every label function takes the app locale, defaulting
// to Czech so existing call sites and tests read unchanged.
import type { AppLocale } from '@/i18n/config'

/** "Za 43 dní" / "In 43 days" — with "Dnes"/"Zítra" ("Today"/"Tomorrow"). */
export function countdownLabel(days: number, locale: AppLocale = 'cs'): string {
  if (locale === 'en') {
    if (days <= 0) return 'Today'
    if (days === 1) return 'Tomorrow'
    return `In ${days} days`
  }
  if (days <= 0) return 'Dnes'
  if (days === 1) return 'Zítra'
  if (days <= 4) return `Za ${days} dny`
  return `Za ${days} dní`
}

// "do <weekday>" needs the genitive: "do čtvrtka", not "do čtvrtek"
const WEEKDAY_UNTIL = ['neděle', 'pondělí', 'úterý', 'středy', 'čtvrtka', 'pátku', 'soboty']

/** "do neděle" / "until Sunday" — for the live badge. */
export function untilLabel(to: string | Date, locale: AppLocale = 'cs'): string {
  const d = typeof to === 'string' ? new Date(to) : to
  if (locale === 'en') {
    const weekday = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(d)
    return `until ${weekday}`
  }
  return `do ${WEEKDAY_UNTIL[d.getUTCDay()]}`
}

/** "od čtvrtka" / "from Thursday" — partial-stay labels (same genitive). */
export function sinceLabel(from: string | Date, locale: AppLocale = 'cs'): string {
  const d = typeof from === 'string' ? new Date(from) : from
  if (locale === 'en') {
    const weekday = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(d)
    return `from ${weekday}`
  }
  return `od ${WEEKDAY_UNTIL[d.getUTCDay()]}`
}

// Genitive month names ("5. srpna"), and nominative for "srpen 2026"
const MONTHS_GENITIVE = [
  'ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince',
]
const MONTHS_NOMINATIVE = [
  'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec',
]

interface DateParts {
  day: number
  month: number
  year: number
}

function parts(value: string | Date): DateParts {
  const d = typeof value === 'string' ? new Date(value) : value
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() }
}

// English month names for range building — Intl can't format a RANGE with
// our shared-year/month elision rules, so English mirrors the Czech
// assembly with its own month tables.
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_EN_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** "5.–9. srpna 2026" / "5–9 August 2026", cross-year with both years. */
export function formatDateRangeLong(
  from: string | Date,
  to?: string | Date | null,
  locale: AppLocale = 'cs',
): string {
  const f = parts(from)
  if (locale === 'en') {
    const single = (p: DateParts) => `${p.day} ${MONTHS_EN[p.month]} ${p.year}`
    if (!to) return single(f)
    const t = parts(to)
    if (f.year === t.year && f.month === t.month) {
      if (f.day === t.day) return single(f)
      return `${f.day}–${t.day} ${MONTHS_EN[f.month]} ${f.year}`
    }
    if (f.year === t.year) {
      return `${f.day} ${MONTHS_EN[f.month]} – ${t.day} ${MONTHS_EN[t.month]} ${f.year}`
    }
    return `${single(f)} – ${single(t)}`
  }
  if (!to) return `${f.day}. ${MONTHS_GENITIVE[f.month]} ${f.year}`
  const t = parts(to)
  if (f.year === t.year && f.month === t.month) {
    if (f.day === t.day) return `${f.day}. ${MONTHS_GENITIVE[f.month]} ${f.year}`
    return `${f.day}.–${t.day}. ${MONTHS_GENITIVE[f.month]} ${f.year}`
  }
  if (f.year === t.year) {
    return `${f.day}. ${MONTHS_GENITIVE[f.month]} – ${t.day}. ${MONTHS_GENITIVE[t.month]} ${f.year}`
  }
  return `${f.day}. ${MONTHS_GENITIVE[f.month]} ${f.year} – ${t.day}. ${MONTHS_GENITIVE[t.month]} ${t.year}`
}

/** "18.–20. 9." / "18–20 Sep"; cross-month "30. 12. – 2. 1." / "30 Dec – 2 Jan". */
export function formatDateRangeShort(
  from: string | Date,
  to?: string | Date | null,
  locale: AppLocale = 'cs',
): string {
  const f = parts(from)
  if (locale === 'en') {
    if (!to) return `${f.day} ${MONTHS_EN_SHORT[f.month]}`
    const t = parts(to)
    if (f.year === t.year && f.month === t.month) {
      if (f.day === t.day) return `${f.day} ${MONTHS_EN_SHORT[f.month]}`
      return `${f.day}–${t.day} ${MONTHS_EN_SHORT[f.month]}`
    }
    return `${f.day} ${MONTHS_EN_SHORT[f.month]} – ${t.day} ${MONTHS_EN_SHORT[t.month]}`
  }
  if (!to) return `${f.day}. ${f.month + 1}.`
  const t = parts(to)
  if (f.year === t.year && f.month === t.month) {
    if (f.day === t.day) return `${f.day}. ${f.month + 1}.`
    return `${f.day}.–${t.day}. ${f.month + 1}.`
  }
  return `${f.day}. ${f.month + 1}. – ${t.day}. ${t.month + 1}.`
}

/** "srpen 2026" / "August 2026" — archive cards. */
export function formatMonthYear(date: string | Date, locale: AppLocale = 'cs'): string {
  const p = parts(date)
  return `${locale === 'en' ? MONTHS_EN[p.month] : MONTHS_NOMINATIVE[p.month]} ${p.year}`
}

/** Year used for grouping in the "all chatas" picker. */
export function chataYear(chata: DatedChata): number | null {
  const date = chata.tripDateFrom ?? chata.tripDateTo
  return date ? parts(date).year : null
}

// ─── tentative dates ("orientační termín") ────────────────────────────────
// The trip dates only bound a window; the stay length is a separate night
// count. Labels live here with the other date grammar, not in the catalogs.

/** "10 nocí" / "10 nights" with the Czech 1 / 2–4 / 5+ forms. */
export function nightsLabel(count: number, locale: AppLocale = 'cs'): string {
  if (locale === 'en') return count === 1 ? '1 night' : `${count} nights`
  if (count === 1) return '1 noc'
  if (count >= 2 && count <= 4) return `${count} noci`
  return `${count} nocí`
}

/** "červenec 2027" when the window is a whole calendar month, otherwise the
 * long range ("1.–20. července 2027"). */
export function tentativeWindowLabel(
  from: string | Date,
  to: string | Date,
  locale: AppLocale = 'cs',
): string {
  const f = parts(from)
  const t = parts(to)
  const lastDayOfMonth = new Date(Date.UTC(t.year, t.month + 1, 0)).getUTCDate()
  if (f.year === t.year && f.month === t.month && f.day === 1 && t.day === lastDayOfMonth) {
    return formatMonthYear(from, locale)
  }
  return formatDateRangeLong(from, to, locale)
}

/** Card meta line: "červenec 2027 · 10 nocí · termín upřesníme". Cards that
 * carry a separate "Termín upřesníme" badge pass includeNote: false so the
 * note isn't said twice. */
export function tentativeDateLabel(
  from: string | Date,
  to: string | Date,
  plannedNights: number | null | undefined,
  locale: AppLocale = 'cs',
  includeNote: boolean = true,
): string {
  const window = tentativeWindowLabel(from, to, locale)
  const nights = plannedNights && plannedNights > 0 ? nightsLabel(plannedNights, locale) : null
  const note = includeNote ? (locale === 'en' ? 'dates to be confirmed' : 'termín upřesníme') : null
  return [window, nights, note].filter(Boolean).join(' · ')
}

// ─── viewer settlement ────────────────────────────────────────────────────

export type SettlementStatus = 'settled' | 'debtor' | 'creditor'

export interface ViewerSettlement {
  status: SettlementStatus
  /** absolute amount in Kč (rounded) */
  amount: number
}

/**
 * Settlement status for a balance, using the project-wide 1 Kč threshold
 * (see CLAUDE.md — do NOT tighten to 0.01).
 */
export function settlementFromBalance(balance: number): ViewerSettlement {
  if (balance < -1) return { status: 'debtor', amount: Math.round(Math.abs(balance)) }
  if (balance > 1) return { status: 'creditor', amount: Math.round(balance) }
  return { status: 'settled', amount: 0 }
}

interface StatsLike {
  participants: Record<
    string,
    { balance: number; cost?: number; plannedPaidExternal?: number }
  >
}

/**
 * The viewer's remaining CASH FLOW in one chata — how much more money will
 * leave (negative) or come back to (positive) their own pocket.
 *
 * This is deliberately NOT the finance view's `balance`. That balance is a
 * projection of the settled end state: it already credits the payer of a
 * PLANNED expense with money they have not spent yet. For someone who fronts
 * the accommodation, that turns a 17 132 Kč bill still ahead of them into a
 * cheerful "you'll receive 2 964 Kč" — true only after they pay the 17 132.
 *
 * Subtracting what they have merely promised to pay leaves the flow:
 *
 *   balance − plannedPaidExternal
 *     = (paidExternal + prepaidInternal) − (cost + plannedCost)
 *     = what they have already put in − their total share
 *
 * so the number answers "what do I still have to put in overall", netting the
 * planned expenses they will front against the settlement coming back to them.
 * With no planned expenses left the subtrahend is zero and this IS the
 * balance — archived trips read exactly as before.
 *
 * Summed over the viewer's own participants (a user may own several — parent
 * + children). Returns null when none of the names appear in the stats.
 */
export function viewerFlow(stats: StatsLike | undefined, ownNames: string[]): number | null {
  if (!stats || ownNames.length === 0) return null
  let sum = 0
  let found = false
  for (const name of ownNames) {
    const p = stats.participants[name]
    if (p) {
      sum += p.balance - (p.plannedPaidExternal ?? 0)
      found = true
    }
  }
  return found ? sum : null
}

/** The viewer's cost so far in one chata (live-chata "útrata" chip). */
export function viewerCost(stats: StatsLike | undefined, ownNames: string[]): number | null {
  if (!stats || ownNames.length === 0) return null
  let sum = 0
  let found = false
  for (const name of ownNames) {
    const p = stats.participants[name]
    if (p && typeof p.cost === 'number') {
      sum += p.cost
      found = true
    }
  }
  return found ? sum : null
}

// ─── greeting ─────────────────────────────────────────────────────────────

interface GreetingSource {
  /** Users.vokativ — canonical, wins when set */
  userVokativ?: string | null
  /** Users.name ("Kateřina Rechová") */
  userName?: string | null
  /** vokativ forms of the user's linked participants (any chata) */
  participantVokativs?: Array<string | null | undefined>
  /** names of the user's linked participants */
  participantNames?: string[]
}

/**
 * Name for the personal greeting ("Ahoj, Katko."): account vokativ →
 * any linked participant's vokativ → account first name → participant name.
 * English skips the vocative forms — "Hi, Katko" would be wrong — and goes
 * straight to the plain first name. Null = no usable name (fall back to a
 * generic greeting).
 */
export function greetingName(source: GreetingSource, locale: AppLocale = 'cs'): string | null {
  const trimmed = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
  if (locale === 'cs') {
    const fromUserVokativ = trimmed(source.userVokativ)
    if (fromUserVokativ) return fromUserVokativ
    for (const v of source.participantVokativs ?? []) {
      const value = trimmed(v)
      if (value) return value
    }
  }
  const firstName = trimmed(source.userName)?.split(/\s+/)[0]
  if (firstName) return firstName
  for (const name of source.participantNames ?? []) {
    const value = trimmed(name)
    if (value) return value
  }
  return null
}
