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
      live.push(chata)
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

/** "Za 43 dní" — Czech plural forms; "Dnes"/"Zítra" for the closest ones. */
export function countdownLabel(days: number): string {
  if (days <= 0) return 'Dnes'
  if (days === 1) return 'Zítra'
  if (days <= 4) return `Za ${days} dny`
  return `Za ${days} dní`
}

// "do <weekday>" needs the genitive: "do čtvrtka", not "do čtvrtek"
const WEEKDAY_UNTIL = ['neděle', 'pondělí', 'úterý', 'středy', 'čtvrtka', 'pátku', 'soboty']

/** "do neděle" — for the live badge "Právě probíhá • do neděle". */
export function untilLabel(to: string | Date): string {
  const d = typeof to === 'string' ? new Date(to) : to
  return `do ${WEEKDAY_UNTIL[d.getUTCDay()]}`
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

/** "5.–9. srpna 2026", "18. září – 20. října 2026", cross-year with both years. */
export function formatDateRangeLong(from: string | Date, to?: string | Date | null): string {
  const f = parts(from)
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

/** "18.–20. 9." / cross-month "30. 12. – 2. 1." — compact picker rows. */
export function formatDateRangeShort(from: string | Date, to?: string | Date | null): string {
  const f = parts(from)
  if (!to) return `${f.day}. ${f.month + 1}.`
  const t = parts(to)
  if (f.year === t.year && f.month === t.month) {
    if (f.day === t.day) return `${f.day}. ${f.month + 1}.`
    return `${f.day}.–${t.day}. ${f.month + 1}.`
  }
  return `${f.day}. ${f.month + 1}. – ${t.day}. ${t.month + 1}.`
}

/** "srpen 2026" — archive cards. */
export function formatMonthYear(date: string | Date): string {
  const p = parts(date)
  return `${MONTHS_NOMINATIVE[p.month]} ${p.year}`
}

/** Year used for grouping in the "all chatas" picker. */
export function chataYear(chata: DatedChata): number | null {
  const date = chata.tripDateFrom ?? chata.tripDateTo
  return date ? parts(date).year : null
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
  participants: Record<string, { balance: number; cost?: number }>
}

/**
 * The viewer's combined balance in one chata: sum of their own linked
 * participants' balances (a user may own several — parent + children).
 * Returns null when none of the names appear in the stats.
 */
export function viewerBalance(stats: StatsLike | undefined, ownNames: string[]): number | null {
  if (!stats || ownNames.length === 0) return null
  let sum = 0
  let found = false
  for (const name of ownNames) {
    const p = stats.participants[name]
    if (p) {
      sum += p.balance
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
 * Null = no usable name (fall back to a generic greeting).
 */
export function greetingName(source: GreetingSource): string | null {
  const trimmed = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
  const fromUserVokativ = trimmed(source.userVokativ)
  if (fromUserVokativ) return fromUserVokativ
  for (const v of source.participantVokativs ?? []) {
    const value = trimmed(v)
    if (value) return value
  }
  const firstName = trimmed(source.userName)?.split(/\s+/)[0]
  if (firstName) return firstName
  for (const name of source.participantNames ?? []) {
    const value = trimmed(name)
    if (value) return value
  }
  return null
}
