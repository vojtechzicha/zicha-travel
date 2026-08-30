import { describe, it, expect } from 'vitest'
import {
  accommodationAvailableFor,
  canSeePlanningResults,
  normalizeVoterName,
  describeVoteSelection,
  resolveVoter,
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

describe('resolveVoter', () => {
  const participants = [
    { id: 1, name: 'Vojta', accountId: 1 },
    { id: 2, name: 'Katka Nováková', accountId: null },
  ]

  it('an account with a linked participant votes as that participant, whatever name it typed', () => {
    expect(resolveVoter({ participants, userId: 1, name: 'Somebody Else' })).toEqual({
      kind: 'linked',
      participantId: 1,
    })
    expect(resolveVoter({ participants, userId: '1', name: null })).toEqual({
      kind: 'linked',
      participantId: 1,
    })
  })

  it('a new face needs a name and gets a participant created', () => {
    expect(resolveVoter({ participants, userId: 9, name: '  David  N. ' })).toEqual({
      kind: 'create',
      name: 'David N.',
    })
    expect(resolveVoter({ participants, userId: 9, name: '   ' })).toEqual({
      kind: 'name-required',
    })
  })

  it('votes as the participant asked for, but only one of its own', () => {
    const family = [
      { id: 1, name: 'Máma', accountId: 7 },
      { id: 2, name: 'Dítě', accountId: 7 },
      { id: 3, name: 'Soused', accountId: 8 },
    ]
    expect(resolveVoter({ participants: family, userId: 7, name: null, participantId: 2 })).toEqual({
      kind: 'linked',
      participantId: 2,
    })
    expect(resolveVoter({ participants: family, userId: 7, name: null, participantId: 3 })).toEqual({
      kind: 'forbidden',
    })
    expect(resolveVoter({ participants: family, userId: 7, name: null, participantId: 99 })).toEqual({
      kind: 'forbidden',
    })
  })

  it('never takes over an existing participant by name (case-insensitive)', () => {
    expect(resolveVoter({ participants, userId: 9, name: 'katka nováková' })).toEqual({
      kind: 'name-taken',
    })
    expect(resolveVoter({ participants, userId: 9, name: 'VOJTA' })).toEqual({
      kind: 'name-taken',
    })
  })
})

describe('describeVoteSelection', () => {
  const dates = [
    { id: 1, label: '16.–18. 10. 2026' },
    { id: 2, label: '13.–15. 11. 2026 (preferovaný)' },
  ]
  const places = [
    { id: 2, name: 'Chata Kloučka' },
    { id: 4, name: 'Chata Skvrňov' },
  ]

  it('keeps the order picked and drops ids the chata no longer has', () => {
    expect(
      describeVoteSelection(
        { dateOptionIds: [2, 1, 99], accommodationOptionIds: ['4', 2] },
        dates,
        places,
      ),
    ).toEqual({
      dates: ['13.–15. 11. 2026 (preferovaný)', '16.–18. 10. 2026'],
      places: ['Chata Skvrňov', 'Chata Kloučka'],
    })
  })

  it('no places is an empty list, not a missing one', () => {
    expect(
      describeVoteSelection({ dateOptionIds: [1], accommodationOptionIds: [] }, dates, places),
    ).toEqual({ dates: ['16.–18. 10. 2026'], places: [] })
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
