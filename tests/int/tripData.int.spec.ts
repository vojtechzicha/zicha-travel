import { describe, expect, it } from 'vitest'
import type { Chata } from '@/payload-types'
import { getTripNights, isTentativeTrip } from '@/app/(frontend)/utils/participantHelpers'
import { getTripPhase, nightLabel } from '@/app/(frontend)/utils/tripData'

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
