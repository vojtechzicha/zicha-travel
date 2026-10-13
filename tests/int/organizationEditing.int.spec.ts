import { describe, it, expect } from 'vitest'
import {
  canEditCar,
  carHasSeatFor,
  canMoveParticipant,
  carOccupantIds,
  leaveCar,
  normalizeNights,
  offerCar,
  placeInBed,
  removeCar,
  removeFromBeds,
  roomHasSpace,
  sanitizeCarInput,
  takeSeat,
  updateCar,
  type CarRow,
  type RoomRow,
} from '@/lib/organizationEditing'

const rooms = (): RoomRow[] => [
  {
    id: 'r1',
    name: 'Ložnice 1',
    maxSleepingSpaces: 2,
    image: 99,
    beds: [{ id: 'b1', name: 'Manželská', occupants: [{ id: 'o1', participant: 10 }] }],
  },
  {
    id: 'r2',
    name: 'Ložnice 2',
    maxSleepingSpaces: 1,
    beds: [{ id: 'b2', name: 'Gauč', occupants: [] }],
  },
]

const occupantsOf = (list: RoomRow[], roomId: string) =>
  list
    .find((r) => r.id === roomId)!
    .beds!.flatMap((b) => b.occupants ?? [])
    .map((o) => ({ p: String(o.participant), n: o.nights ?? null }))

describe('permissions', () => {
  it('lets people move only their own participants, organizers anyone', () => {
    expect(
      canMoveParticipant({ participantId: 1, ownParticipantIds: [1, 2], isOrganizer: false }),
    ).toBe(true)
    expect(
      canMoveParticipant({ participantId: 3, ownParticipantIds: [1, 2], isOrganizer: false }),
    ).toBe(false)
    expect(canMoveParticipant({ participantId: 3, ownParticipantIds: [], isOrganizer: true })).toBe(
      true,
    )
  })

  it('lets the driver or an organizer edit a car', () => {
    const car: CarRow = { id: 'c', name: 'Auto', driver: { id: 5 } }
    expect(canEditCar(car, [5], false)).toBe(true)
    expect(canEditCar(car, [6], false)).toBe(false)
    expect(canEditCar(car, [], true)).toBe(true)
  })
})

describe('beds', () => {
  it('places into a room with a free place and keeps other row fields', () => {
    const result = placeInBed(rooms(), {
      roomId: 'r1',
      bedId: 'b1',
      participantId: 11,
      perNight: false,
      totalNights: 2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(occupantsOf(result.value, 'r1')).toEqual([
      { p: '10', n: null },
      { p: '11', n: null },
    ])
    expect(result.value[0].image).toBe(99)
  })

  it('refuses a full room', () => {
    const result = placeInBed(rooms(), {
      roomId: 'r2',
      bedId: 'b2',
      participantId: 11,
      perNight: false,
      totalNights: 2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      placeInBed(result.value, {
        roomId: 'r2',
        bedId: 'b2',
        participantId: 12,
        perNight: false,
        totalNights: 2,
      }),
    ).toEqual({ ok: false, error: 'room-full' })
  })

  it('moves a person instead of duplicating them', () => {
    const result = placeInBed(rooms(), {
      roomId: 'r2',
      bedId: 'b2',
      participantId: 10,
      perNight: false,
      totalNights: 2,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(occupantsOf(result.value, 'r1')).toEqual([])
    expect(occupantsOf(result.value, 'r2')).toEqual([{ p: '10', n: null }])
  })

  it('counts capacity per night in per-night mode', () => {
    // r2 holds 1: participant 11 there for night 1 only leaves night 2 free
    const first = placeInBed(rooms(), {
      roomId: 'r2',
      bedId: 'b2',
      participantId: 11,
      perNight: true,
      totalNights: 2,
      nights: [1],
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(
      placeInBed(first.value, {
        roomId: 'r2',
        bedId: 'b2',
        participantId: 12,
        perNight: true,
        totalNights: 2,
        nights: [2],
      }).ok,
    ).toBe(true)
    expect(
      placeInBed(first.value, {
        roomId: 'r2',
        bedId: 'b2',
        participantId: 12,
        perNight: true,
        totalNights: 2,
        nights: [1],
      }),
    ).toEqual({ ok: false, error: 'room-full' })
  })

  it('moves only the chosen nights in per-night mode', () => {
    const result = placeInBed(rooms(), {
      roomId: 'r2',
      bedId: 'b2',
      participantId: 10,
      perNight: true,
      totalNights: 2,
      nights: [2],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(occupantsOf(result.value, 'r1')).toEqual([{ p: '10', n: [1] }])
    expect(occupantsOf(result.value, 'r2')).toEqual([{ p: '10', n: [2] }])
  })

  it('stores all nights as the whole stay', () => {
    expect(normalizeNights([2, 1, 2], 2)).toBeNull()
    expect(normalizeNights([3, 0, 'x', 1], 2)).toEqual([1])
    expect(normalizeNights([], 2)).toBeNull()
  })

  it('reports an unknown room or bed', () => {
    expect(
      placeInBed(rooms(), {
        roomId: 'nope',
        bedId: 'b1',
        participantId: 1,
        perNight: false,
        totalNights: 2,
      }),
    ).toEqual({ ok: false, error: 'not-found' })
  })

  it('removes a person from every bed', () => {
    expect(occupantsOf(removeFromBeds(rooms(), 10), 'r1')).toEqual([])
  })
})

describe('cars', () => {
  const cars = (): CarRow[] => [
    {
      id: 'c1',
      name: 'Auto Vojty',
      seats: 3,
      driver: 1,
      frontPassenger: null,
      passengers: [],
      equipment: [{ name: 'Pivo' }],
    },
  ]

  it('sanitizes car input', () => {
    expect(
      sanitizeCarInput({ name: '  Octavia ', seats: 5, equipment: [' kufry ', '', 3 as never] }),
    ).toEqual({
      name: 'Octavia',
      seats: 5,
      description: null,
      equipment: ['kufry'],
    })
    expect(sanitizeCarInput({ name: '', seats: 5 })).toBeNull()
    expect(sanitizeCarInput({ name: 'X', seats: 12 })).toBeNull()
  })

  it('offers a car with the participant as driver, out of any seat', () => {
    const seated = takeSeat(cars(), { carId: 'c1', participantId: 2, seat: 'back' })
    expect(seated.ok).toBe(true)
    if (!seated.ok) return
    const result = offerCar(seated.value, 2, { name: 'Fabia', seats: 4 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toHaveLength(2)
    expect(carOccupantIds(result.value[0])).toEqual(['1'])
    expect(result.value[1]).toMatchObject({ name: 'Fabia', seats: 4, driver: 2 })
  })

  it('refuses a second car for the same driver', () => {
    expect(offerCar(cars(), 1, { name: 'Druhé', seats: 4 })).toEqual({
      ok: false,
      error: 'already-driving',
    })
  })

  it('seats front and back, up to the seat count', () => {
    const a = takeSeat(cars(), { carId: 'c1', participantId: 2, seat: 'front' })
    expect(a.ok).toBe(true)
    if (!a.ok) return
    expect(takeSeat(a.value, { carId: 'c1', participantId: 3, seat: 'front' })).toEqual({
      ok: false,
      error: 'front-taken',
    })
    const b = takeSeat(a.value, { carId: 'c1', participantId: 3, seat: 'back' })
    expect(b.ok).toBe(true)
    if (!b.ok) return
    expect(takeSeat(b.value, { carId: 'c1', participantId: 4, seat: 'back' })).toEqual({
      ok: false,
      error: 'car-full',
    })
  })

  it('moves a passenger between seats without counting them twice', () => {
    const a = takeSeat(cars(), { carId: 'c1', participantId: 2, seat: 'back' })
    expect(a.ok).toBe(true)
    if (!a.ok) return
    const b = takeSeat(a.value, { carId: 'c1', participantId: 2, seat: 'front' })
    expect(b.ok).toBe(true)
    if (!b.ok) return
    expect(carOccupantIds(b.value[0])).toEqual(['1', '2'])
  })

  it('keeps a driver from riding elsewhere', () => {
    expect(takeSeat(cars(), { carId: 'c1', participantId: 1, seat: 'back' })).toEqual({
      ok: false,
      error: 'is-driver',
    })
  })

  it('updates a car but not below its occupants', () => {
    const a = takeSeat(cars(), { carId: 'c1', participantId: 2, seat: 'back' })
    expect(a.ok).toBe(true)
    if (!a.ok) return
    expect(updateCar(a.value, 'c1', { name: 'Auto', seats: 1 })).toEqual({
      ok: false,
      error: 'seats-too-few',
    })
    const b = updateCar(a.value, 'c1', { name: 'Auto Vojty', seats: 5, equipment: ['Kytara'] })
    expect(b.ok && b.value[0]).toMatchObject({ seats: 5, equipment: [{ name: 'Kytara' }] })
  })

  it('removes a car and lets passengers leave', () => {
    const a = takeSeat(cars(), { carId: 'c1', participantId: 2, seat: 'back' })
    expect(a.ok).toBe(true)
    if (!a.ok) return
    const left = leaveCar(a.value, 2)
    expect(left.ok && carOccupantIds(left.value[0])).toEqual(['1'])
    expect(removeCar(a.value, 'c1')).toEqual({ ok: true, value: [] })
    expect(removeCar(a.value, 'nope')).toEqual({ ok: false, error: 'not-found' })
  })
})

describe('space checks for the UI', () => {
  it('sees room space per night and ignores the person moving', () => {
    const full: RoomRow = {
      id: 'r',
      name: 'Malý',
      maxSleepingSpaces: 1,
      beds: [{ id: 'b', name: 'Gauč', occupants: [{ participant: { id: 7 }, nights: [1] }] }],
    }
    expect(roomHasSpace(full, 8, null, 2)).toBe(false)
    expect(roomHasSpace(full, 8, [2], 2)).toBe(true)
    expect(roomHasSpace(full, 7, null, 2)).toBe(true)
    expect(roomHasSpace({ ...full, maxSleepingSpaces: 0 }, 8, null, 2)).toBe(true)
  })

  it('sees a free car seat, not counting the person themselves', () => {
    const car: CarRow = {
      id: 'c',
      name: 'Auto',
      seats: 2,
      driver: 1,
      passengers: [{ participant: 2 }],
    }
    expect(carHasSeatFor(car, 3)).toBe(false)
    expect(carHasSeatFor(car, 2)).toBe(true)
    expect(carHasSeatFor({ ...car, seats: null }, 3)).toBe(true)
  })
})
