import { describe, it, expect } from 'vitest'
import {
  accommodationAvailableFor,
  canSeePlanningResults,
  normalizeVoterName,
  parsePlanningVoteIntent,
  planningVoteReturnTo,
  tallyVotes,
  validateVoteSelection,
  type PlanningVote,
} from '@/lib/planning'
import { dateOptionLabel } from '@/collections/TripDateOptions'

// The pratele shape: two candidate weekends, four cottages, one of them
// (Kloučka) available only for the November window.
const october = { id: 1 }
const november = { id: 2 }
const dateOptions = [october, november]
const kamenna = { id: 10, dateOptionIds: [] as number[] }
const kloucka = { id: 11, dateOptionIds: [2] }
const oaza = { id: 12, dateOptionIds: [1, 2] }
const skvrnov = { id: 13, dateOptionIds: [1, 2] }
const accommodations = [kamenna, kloucka, oaza, skvrnov]

describe('accommodationAvailableFor', () => {
  it('empty availability means every date', () => {
    expect(accommodationAvailableFor(kamenna, [1])).toBe(true)
    expect(accommodationAvailableFor(kamenna, [2])).toBe(true)
  })

  it('a restricted option needs at least one selected date in its list', () => {
    expect(accommodationAvailableFor(kloucka, [1])).toBe(false)
    expect(accommodationAvailableFor(kloucka, [2])).toBe(true)
    expect(accommodationAvailableFor(kloucka, [1, 2])).toBe(true)
  })

  it('with no dates selected yet everything shows as available', () => {
    expect(accommodationAvailableFor(kloucka, [])).toBe(true)
  })

  it('compares ids as strings (REST bodies send numbers or strings)', () => {
    expect(accommodationAvailableFor(kloucka, ['2'])).toBe(true)
  })
})

describe('validateVoteSelection', () => {
  const base = { dateOptions, accommodations }

  it('accepts a full valid selection', () => {
    expect(
      validateVoteSelection({
        ...base,
        dateOptionIds: [1, 2],
        accommodationOptionIds: [10, 11],
      }),
    ).toBeNull()
  })

  it('accommodations may be empty (no preference)', () => {
    expect(
      validateVoteSelection({ ...base, dateOptionIds: [1], accommodationOptionIds: [] }),
    ).toBeNull()
  })

  it('requires at least one date — not voting is the no', () => {
    expect(
      validateVoteSelection({ ...base, dateOptionIds: [], accommodationOptionIds: [] }),
    ).toBe('no-dates')
  })

  it('rejects ids from another chata', () => {
    expect(
      validateVoteSelection({ ...base, dateOptionIds: [99], accommodationOptionIds: [] }),
    ).toBe('unknown-date')
    expect(
      validateVoteSelection({ ...base, dateOptionIds: [1], accommodationOptionIds: [99] }),
    ).toBe('unknown-accommodation')
  })

  it('rejects an accommodation unavailable on every selected date', () => {
    expect(
      validateVoteSelection({ ...base, dateOptionIds: [1], accommodationOptionIds: [11] }),
    ).toBe('accommodation-unavailable')
  })
})

describe('canSeePlanningResults', () => {
  it('chata admins see results', () => {
    expect(canSeePlanningResults({ canViewAll: true, linkedParticipantIds: [] })).toBe(true)
  })

  it('a viewer with a linked participant here sees results', () => {
    expect(canSeePlanningResults({ canViewAll: false, linkedParticipantIds: [5] })).toBe(true)
  })

  it('anonymous visitors and unlinked accounts do not', () => {
    expect(canSeePlanningResults({ canViewAll: false, linkedParticipantIds: [] })).toBe(false)
  })
})

describe('tallyVotes', () => {
  const votes: PlanningVote[] = [
    { participantId: 1, dateOptionIds: [1, 2], accommodationOptionIds: [10] },
    { participantId: 2, dateOptionIds: [2], accommodationOptionIds: [10, 12] },
    { participantId: 3, dateOptionIds: [2], accommodationOptionIds: [] },
  ]

  it('counts per option in the given order, with shares of all voters', () => {
    const tally = tallyVotes(votes, dateOptions, accommodations)
    expect(tally.total).toBe(3)
    expect(tally.dates).toEqual([
      { id: 1, count: 1, share: 1 / 3, leading: false },
      { id: 2, count: 3, share: 1, leading: true },
    ])
    expect(tally.accommodations.map((row) => row.count)).toEqual([2, 0, 1, 0])
  })

  it('marks every option tied for the top non-zero count as leading', () => {
    const tied: PlanningVote[] = [
      { participantId: 1, dateOptionIds: [1], accommodationOptionIds: [] },
      { participantId: 2, dateOptionIds: [2], accommodationOptionIds: [] },
    ]
    const tally = tallyVotes(tied, dateOptions, accommodations)
    expect(tally.dates.every((row) => row.leading)).toBe(true)
    // nothing leads when nobody picked anything
    expect(tally.accommodations.every((row) => row.leading === false)).toBe(true)
  })

  it('ignores votes for options that no longer exist', () => {
    const stale: PlanningVote[] = [
      { participantId: 1, dateOptionIds: [77], accommodationOptionIds: [88] },
    ]
    const tally = tallyVotes(stale, dateOptions, accommodations)
    expect(tally.dates.map((row) => row.count)).toEqual([0, 0])
    expect(tally.accommodations.map((row) => row.count)).toEqual([0, 0, 0, 0])
  })

  it('handles no votes at all', () => {
    const tally = tallyVotes([], dateOptions, accommodations)
    expect(tally.total).toBe(0)
    expect(tally.dates.every((row) => row.count === 0 && row.share === 0)).toBe(true)
  })
})

describe('normalizeVoterName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeVoterName('  Katka   Nováková ')).toBe('Katka Nováková')
  })

  it('refuses empty, non-string and absurdly long names', () => {
    expect(normalizeVoterName('   ')).toBeNull()
    expect(normalizeVoterName(42)).toBeNull()
    expect(normalizeVoterName('x'.repeat(101))).toBeNull()
  })
})

describe('planning vote intent (deferred anonymous votes)', () => {
  it('round-trips through the magic-link returnTo', () => {
    const returnTo = planningVoteReturnTo('/pratele', {
      name: 'Katka Nováková',
      dateOptionIds: [1, 2],
      accommodationOptionIds: [10],
    })
    const [path, query] = returnTo.split('?')
    expect(path).toBe('/pratele')
    const intent = parsePlanningVoteIntent(new URLSearchParams(query))
    expect(intent).toEqual({
      name: 'Katka Nováková',
      dateOptionIds: [1, 2],
      accommodationOptionIds: [10],
    })
  })

  it('keeps existing query params and drops empty parts', () => {
    const returnTo = planningVoteReturnTo('/pratele?view=planning', {
      name: null,
      dateOptionIds: [2],
      accommodationOptionIds: [],
    })
    const params = new URLSearchParams(returnTo.split('?')[1])
    expect(params.get('view')).toBe('planning')
    expect(params.has('pv_a')).toBe(false)
    expect(params.has('pv_n')).toBe(false)
    expect(parsePlanningVoteIntent(params)).toEqual({
      name: null,
      dateOptionIds: [2],
      accommodationOptionIds: [],
    })
  })

  it('rejects URLs without an intent or with mangled ids', () => {
    expect(parsePlanningVoteIntent(new URLSearchParams('view=planning'))).toBeNull()
    expect(parsePlanningVoteIntent(new URLSearchParams('pv_d='))).toBeNull()
    expect(parsePlanningVoteIntent(new URLSearchParams('pv_d=1,abc'))).toBeNull()
    expect(parsePlanningVoteIntent(new URLSearchParams('pv_d=1&pv_a=zero'))).toBeNull()
  })

  it('dedupes repeated ids and normalizes the name', () => {
    const intent = parsePlanningVoteIntent(
      new URLSearchParams('pv_d=1,1,2&pv_a=10,10&pv_n=++Katka++Nov%C3%A1kov%C3%A1'),
    )
    expect(intent).toEqual({
      name: 'Katka Nováková',
      dateOptionIds: [1, 2],
      accommodationOptionIds: [10],
    })
  })
})

describe('dateOptionLabel', () => {
  it('one-month window: "16.–18. 10. 2026"', () => {
    expect(dateOptionLabel('2026-10-16T00:00:00.000Z', '2026-10-18T00:00:00.000Z')).toBe(
      '16.–18. 10. 2026',
    )
  })

  it('cross-month window keeps both months', () => {
    expect(dateOptionLabel('2026-10-30T00:00:00.000Z', '2026-11-01T00:00:00.000Z')).toBe(
      '30. 10.–1. 11. 2026',
    )
  })
})
