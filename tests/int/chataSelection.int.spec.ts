import { describe, expect, it } from 'vitest'
import {
  bucketChatas,
  chataYear,
  countdownLabel,
  daysUntil,
  formatDateRangeLong,
  formatDateRangeShort,
  formatMonthYear,
  greetingName,
  settlementFromBalance,
  untilLabel,
  viewerBalance,
  viewerCost,
} from '@/lib/chataSelection'

// Trip dates are stored at 12:00Z (see production data)
const d = (iso: string) => `${iso}T12:00:00.000Z`
const TODAY = new Date('2026-08-06T09:30:00.000Z')

describe('bucketChatas', () => {
  const live = { name: 'live', tripDateFrom: d('2026-08-05'), tripDateTo: d('2026-08-09') }
  const endsToday = { name: 'endsToday', tripDateFrom: d('2026-08-01'), tripDateTo: d('2026-08-06') }
  const startsToday = { name: 'startsToday', tripDateFrom: d('2026-08-06'), tripDateTo: d('2026-08-08') }
  const soon = { name: 'soon', tripDateFrom: d('2026-09-10'), tripDateTo: d('2026-09-14') }
  const later = { name: 'later', tripDateFrom: d('2026-12-30'), tripDateTo: d('2027-01-02') }
  const past1 = { name: 'past1', tripDateFrom: d('2026-03-27'), tripDateTo: d('2026-03-29') }
  const past2 = { name: 'past2', tripDateFrom: d('2025-12-13'), tripDateTo: d('2025-12-16') }
  const undated = { name: 'undated', tripDateFrom: null, tripDateTo: null }

  it('splits live / upcoming / past with inclusive boundaries', () => {
    const buckets = bucketChatas([past2, later, live, undated, soon, past1, endsToday, startsToday], TODAY)
    expect(buckets.live.map((c) => c.name)).toEqual(
      expect.arrayContaining(['live', 'endsToday', 'startsToday'])
    )
    expect(buckets.upcoming.map((c) => c.name)).toEqual(['soon', 'later'])
    expect(buckets.past.map((c) => c.name)).toEqual(['past1', 'past2', 'undated'])
  })

  it('treats a from-only date as a one-day trip', () => {
    const oneDay = { tripDateFrom: d('2026-08-06'), tripDateTo: null }
    expect(bucketChatas([oneDay], TODAY).live).toHaveLength(1)
  })

  it('classifies to-only trips by their end date, not as past', () => {
    const endsToday = { name: 'endsToday', tripDateFrom: null, tripDateTo: d('2026-08-06') }
    const endsLater = { name: 'endsLater', tripDateFrom: null, tripDateTo: d('2026-09-01') }
    const endedEarlier = { name: 'endedEarlier', tripDateFrom: null, tripDateTo: d('2026-08-01') }
    const buckets = bucketChatas([endsToday, endsLater, endedEarlier], TODAY)
    expect(buckets.live.map((c) => c.name)).toEqual(['endsToday'])
    expect(buckets.upcoming.map((c) => c.name)).toEqual(['endsLater'])
    expect(buckets.past.map((c) => c.name)).toEqual(['endedEarlier'])
  })

  it('uses the Czech calendar date for "today", not UTC', () => {
    // 23:30 UTC on Aug 5 = 01:30 on Aug 6 in Prague (CEST) — a trip starting
    // Aug 6 is already live, a trip that ended Aug 5 is already past
    const afterCzechMidnight = new Date('2026-08-05T23:30:00.000Z')
    const startsAug6 = { name: 'startsAug6', tripDateFrom: d('2026-08-06'), tripDateTo: d('2026-08-08') }
    const endedAug5 = { name: 'endedAug5', tripDateFrom: d('2026-08-03'), tripDateTo: d('2026-08-05') }
    const buckets = bucketChatas([startsAug6, endedAug5], afterCzechMidnight)
    expect(buckets.live.map((c) => c.name)).toEqual(['startsAug6'])
    expect(buckets.past.map((c) => c.name)).toEqual(['endedAug5'])
    expect(daysUntil(d('2026-08-06'), afterCzechMidnight)).toBe(0)
  })
})

describe('countdown and labels', () => {
  it('computes day distances', () => {
    expect(daysUntil(d('2026-09-10'), TODAY)).toBe(35)
    expect(daysUntil(d('2026-08-06'), TODAY)).toBe(0)
    expect(daysUntil(d('2026-08-01'), TODAY)).toBe(-5)
  })

  it('uses Czech plurals', () => {
    expect(countdownLabel(0)).toBe('Dnes')
    expect(countdownLabel(1)).toBe('Zítra')
    expect(countdownLabel(2)).toBe('Za 2 dny')
    expect(countdownLabel(4)).toBe('Za 4 dny')
    expect(countdownLabel(5)).toBe('Za 5 dní')
    expect(countdownLabel(43)).toBe('Za 43 dní')
  })

  it('says until which weekday the live trip runs (genitive)', () => {
    expect(untilLabel(d('2026-08-09'))).toBe('do neděle') // Sunday
    expect(untilLabel(d('2026-08-06'))).toBe('do čtvrtka') // Thursday
    expect(untilLabel(d('2026-08-08'))).toBe('do soboty') // Saturday
  })
})

describe('date range formatting', () => {
  it('formats same-month ranges', () => {
    expect(formatDateRangeLong(d('2026-08-05'), d('2026-08-09'))).toBe('5.–9. srpna 2026')
    expect(formatDateRangeShort(d('2026-09-18'), d('2026-09-20'))).toBe('18.–20. 9.')
  })

  it('formats cross-month and cross-year ranges', () => {
    expect(formatDateRangeLong(d('2026-09-28'), d('2026-10-02'))).toBe('28. září – 2. října 2026')
    expect(formatDateRangeLong(d('2026-12-30'), d('2027-01-02'))).toBe(
      '30. prosince 2026 – 2. ledna 2027'
    )
    expect(formatDateRangeShort(d('2026-12-30'), d('2027-01-02'))).toBe('30. 12. – 2. 1.')
  })

  it('handles single days and missing to-date', () => {
    expect(formatDateRangeLong(d('2026-08-05'), d('2026-08-05'))).toBe('5. srpna 2026')
    expect(formatDateRangeLong(d('2026-08-05'))).toBe('5. srpna 2026')
    expect(formatDateRangeShort(d('2026-08-05'))).toBe('5. 8.')
  })

  it('formats month + year for archive cards', () => {
    expect(formatMonthYear(d('2026-05-15'))).toBe('květen 2026')
    expect(formatMonthYear(d('2025-12-13'))).toBe('prosinec 2025')
  })

  it('extracts the grouping year', () => {
    expect(chataYear({ tripDateFrom: d('2026-03-27'), tripDateTo: d('2026-03-29') })).toBe(2026)
    expect(chataYear({ tripDateFrom: null, tripDateTo: d('2025-12-16') })).toBe(2025)
    expect(chataYear({ tripDateFrom: null, tripDateTo: null })).toBeNull()
  })
})

describe('settlement (1 Kč threshold — see CLAUDE.md)', () => {
  it('keeps small rounding differences settled', () => {
    expect(settlementFromBalance(0).status).toBe('settled')
    expect(settlementFromBalance(0.9).status).toBe('settled')
    expect(settlementFromBalance(-1).status).toBe('settled')
  })

  it('classifies debtors and creditors with rounded amounts', () => {
    expect(settlementFromBalance(-445.4)).toEqual({ status: 'debtor', amount: 445 })
    expect(settlementFromBalance(120.6)).toEqual({ status: 'creditor', amount: 121 })
  })
})

describe('viewer balance/cost aggregation', () => {
  const stats = {
    participants: {
      Vojta: { balance: -300, cost: 1240 },
      'Katka ml.': { balance: -145.4, cost: 200 },
      Tomáš: { balance: 445, cost: 800 },
    },
  }

  it('sums the balances of all own participants', () => {
    expect(viewerBalance(stats, ['Vojta', 'Katka ml.'])).toBeCloseTo(-445.4)
    expect(viewerCost(stats, ['Vojta'])).toBe(1240)
  })

  it('returns null when nothing matches', () => {
    expect(viewerBalance(stats, ['Nikdo'])).toBeNull()
    expect(viewerBalance(undefined, ['Vojta'])).toBeNull()
    expect(viewerBalance(stats, [])).toBeNull()
    expect(viewerCost(stats, ['Nikdo'])).toBeNull()
  })
})

describe('greetingName', () => {
  it('prefers the account vokativ', () => {
    expect(
      greetingName({
        userVokativ: 'Katko',
        userName: 'Kateřina Rechová',
        participantVokativs: ['Kačko'],
        participantNames: ['Katka'],
      })
    ).toBe('Katko')
  })

  it('falls back to participant vokativ, then account first name, then participant name', () => {
    expect(
      greetingName({ participantVokativs: [null, 'Vojto'], participantNames: ['Vojta'] })
    ).toBe('Vojto')
    expect(greetingName({ userName: 'Kateřina Rechová', participantNames: ['Katka'] })).toBe(
      'Kateřina'
    )
    expect(greetingName({ participantNames: ['Katka'] })).toBe('Katka')
    expect(greetingName({})).toBeNull()
  })
})
