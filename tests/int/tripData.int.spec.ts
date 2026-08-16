import { describe, expect, it } from 'vitest'
import type { Chata, Participant } from '@/payload-types'
import { getTripNights, isTentativeTrip } from '@/app/(frontend)/utils/participantHelpers'
import {
  arrivalsOnNight,
  getArrivalGroups,
  getTripPhase,
  nightLabel,
  nightlyCounts,
} from '@/app/(frontend)/utils/tripData'

// Trip dates are stored at 12:00Z (see production data)
const d = (iso: string) => `${iso}T12:00:00.000Z`

const chata = (overrides: Partial<Chata>): Chata => overrides as Chata

// balt/polsko-2027: window 1.–31. 7. 2027, 10 planned nights
const balt = chata({
  tripDateFrom: d('2027-07-01'),
  tripDateTo: d('2027-07-31'),
  tripDatesTentative: true,
  tripPlannedNights: 10,
})

describe('tentative trip nights', () => {
  it('takes the planned night count instead of the window span', () => {
    expect(getTripNights(balt)).toBe(10)
    expect(isTentativeTrip(balt)).toBe(true)
  })

  it('still counts fixed trips from the dates', () => {
    const fixed = chata({ tripDateFrom: d('2027-07-01'), tripDateTo: d('2027-07-31') })
    expect(getTripNights(fixed)).toBe(30)
    expect(isTentativeTrip(fixed)).toBe(false)
  })

  it('returns 0 when the planned count is missing', () => {
    const noNights = chata({
      tripDateFrom: d('2027-07-01'),
      tripDateTo: d('2027-07-31'),
      tripDatesTentative: true,
    })
    expect(getTripNights(noNights)).toBe(0)
  })
})

describe('tentative trip phase', () => {
  it('stays "before" for the whole window, never "during"', () => {
    expect(getTripPhase(balt, new Date('2026-08-13T10:00:00Z'))).toBe('before')
    expect(getTripPhase(balt, new Date('2027-07-15T10:00:00Z'))).toBe('before')
    expect(getTripPhase(balt, new Date('2027-07-31T10:00:00Z'))).toBe('before')
  })

  it('turns "after" once the window closes', () => {
    expect(getTripPhase(balt, new Date('2027-08-01T10:00:00Z'))).toBe('after')
  })

  it('keeps the during phase for fixed dates', () => {
    const fixed = chata({ tripDateFrom: d('2027-07-01'), tripDateTo: d('2027-07-31') })
    expect(getTripPhase(fixed, new Date('2027-07-15T10:00:00Z'))).toBe('during')
  })
})

describe('tentative night labels', () => {
  it('uses plain numbers because night N has no calendar day yet', () => {
    expect(nightLabel(balt, 1, 'cs')).toBe('1')
    expect(nightLabel(balt, 4, 'en')).toBe('4')
  })
})

// "Kdo přijede kdy" — the grouping now feeds two tabs (Informace for
// signed-in viewers, Účastníci for everyone, per compliance decision 12),
// so pin down the group/order/count behaviour it promises.
describe('arrival groups', () => {
  const p = (id: number, name: string): Participant => ({ id, name }) as Participant
  const anna = p(1, 'Anna')
  const bara = p(2, 'Bára')
  const cyril = p(3, 'Cyril')
  const dita = p(4, 'Dita')

  // 3 nights; Anna + Bára whole stay, Cyril from night 2, Dita unassigned
  const withRozpis = chata({
    tripDateFrom: d('2026-09-03'),
    tripDateTo: d('2026-09-06'),
    rooms: [
      {
        name: 'Pokoj 1',
        maxSleepingSpaces: 4,
        beds: [
          {
            name: 'Postel A',
            occupants: [{ participant: 1 }, { participant: 2 }],
          },
          {
            name: 'Postel B',
            occupants: [{ participant: 3, nights: [2, 3] }],
          },
        ],
      },
    ],
  } as Partial<Chata>)
  const everyone = [anna, bara, cyril, dita]

  it('groups identical night patterns, whole stay first', () => {
    const groups = getArrivalGroups(withRozpis, everyone)
    expect(groups).toHaveLength(2)
    expect(groups[0].wholeStay).toBe(true)
    expect(groups[0].participants.map((x) => x.name)).toEqual(['Anna', 'Bára'])
    expect(groups[0].presence).toEqual([true, true, true])
    expect(groups[1].wholeStay).toBe(false)
    expect(groups[1].participants.map((x) => x.name)).toEqual(['Cyril'])
    expect(groups[1].presence).toEqual([false, true, true])
  })

  it('skips participants with no bed assignment', () => {
    const grouped = getArrivalGroups(withRozpis, everyone).flatMap((g) => g.participants)
    expect(grouped.map((x) => x.name)).not.toContain('Dita')
  })

  it('counts sleepers per night from the groups', () => {
    expect(nightlyCounts(withRozpis, everyone)).toEqual([2, 3, 3])
  })

  it('finds who arrives on a given night (partial stays only)', () => {
    expect(arrivalsOnNight(withRozpis, everyone, 2).map((x) => x.name)).toEqual(['Cyril'])
    // whole-stay people never count as "arriving today"
    expect(arrivalsOnNight(withRozpis, everyone, 1)).toEqual([])
  })

  it('returns nothing without a rozpis or without nights', () => {
    const noRooms = chata({ tripDateFrom: d('2026-09-03'), tripDateTo: d('2026-09-06') })
    expect(getArrivalGroups(noRooms, everyone)).toEqual([])
    const noDates = chata({})
    expect(getArrivalGroups(noDates, everyone)).toEqual([])
  })
})
