/**
 * Build a Google Calendar "template" URL. Opened in the browser it shows
 * Google's normal *create event* screen, pre-filled — the user saves it into
 * their existing (primary) calendar with one click. Unlike importing an .ics
 * file, this never spins up a separate calendar.
 *
 * Times are wall-clock local; we pin `ctz=Europe/Prague` so the event lands at
 * the right moment regardless of the viewer's Google account timezone.
 */

export interface GcalEvent {
  title: string
  /** Departure day as ISO `YYYY-MM-DD`. */
  date: string
  /** Local start `HH:MM`. */
  start: string
  /** Local end `HH:MM`. If earlier than `start`, it is treated as next day. */
  end: string
  details?: string
  location?: string
}

const TZ = 'Europe/Prague'

function hhmmToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** ISO date + a day offset → `YYYYMMDD`, computed in UTC to dodge DST math. */
function isoPlusDaysCompact(iso: string, addDays: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + addDays))
  const yyyy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

/** `HH:MM` → `HHMMSS`. */
function hhmmToCompact(t: string): string {
  const [h, m] = t.split(':')
  return `${h.padStart(2, '0')}${m.padStart(2, '0')}00`
}

export interface GcalAllDayEvent {
  title: string
  /** First day as ISO `YYYY-MM-DD`. */
  dateFrom: string
  /** Last day (inclusive) as ISO `YYYY-MM-DD`. */
  dateTo: string
  details?: string
  location?: string
}

/** All-day (multi-day) variant — used for the trip itself. */
export function googleCalendarAllDayUrl(e: GcalAllDayEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    // All-day ranges use date-only values; the end date is EXCLUSIVE.
    dates: `${isoPlusDaysCompact(e.dateFrom, 0)}/${isoPlusDaysCompact(e.dateTo, 1)}`,
  })
  if (e.details) params.set('details', e.details)
  if (e.location) params.set('location', e.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function googleCalendarEventUrl(e: GcalEvent): string {
  // End before start ⇒ the journey crosses midnight; roll the end onto day +1.
  const endDayOffset = hhmmToMin(e.end) < hhmmToMin(e.start) ? 1 : 0
  const start = `${isoPlusDaysCompact(e.date, 0)}T${hhmmToCompact(e.start)}`
  const end = `${isoPlusDaysCompact(e.date, endDayOffset)}T${hhmmToCompact(e.end)}`

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${start}/${end}`,
    ctz: TZ,
  })
  if (e.details) params.set('details', e.details)
  if (e.location) params.set('location', e.location)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
