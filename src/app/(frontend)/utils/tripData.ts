// Derived, read-only trip data shared by the Informace / Organizace /
// Účastníci sheets: trip phase, bed & car assignments of the signed-in
// viewer, "who arrives when" groups — everything computed from data the
// slug API already returns (chata at depth 2, participants at depth 0).

import type { Chata, Participant } from '@/payload-types'
import type { AppLocale } from '@/i18n/config'
import { getOccupantNights, getTripNights, type Room } from './participantHelpers'

export type TripPhase = 'before' | 'during' | 'after'

type SharedCar = NonNullable<Chata['sharedCars']>[number]

/** Local-midnight Date for a stored day-only ISO value. */
export function dayOnly(value: string | Date): Date {
  const d = typeof value === 'string' ? new Date(value) : value
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

/** null when the chata has no trip dates. */
export function getTripPhase(chata: Chata, now: Date = new Date()): TripPhase | null {
  if (!chata.tripDateFrom || !chata.tripDateTo) return null
  const today = dayOnly(now)
  if (today < dayOnly(chata.tripDateFrom)) return 'before'
  if (today > dayOnly(chata.tripDateTo)) return 'after'
  return 'during'
}

export function daysUntilTrip(chata: Chata, now: Date = new Date()): number {
  if (!chata.tripDateFrom) return 0
  return diffDays(dayOnly(chata.tripDateFrom), dayOnly(now))
}

/** 1-based trip day (arrival day = 1); only meaningful during the trip. */
export function tripDayIndex(chata: Chata, now: Date = new Date()): number {
  if (!chata.tripDateFrom) return 0
  return diffDays(dayOnly(now), dayOnly(chata.tripDateFrom)) + 1
}

export function tripTotalDays(chata: Chata): number {
  return getTripNights(chata) + 1
}

/** 1-based night number whose evening is "tonight"; 0 outside the trip. */
export function tonightNumber(chata: Chata, now: Date = new Date()): number {
  const idx = tripDayIndex(chata, now)
  const nights = getTripNights(chata)
  return idx >= 1 && idx <= nights ? idx : 0
}

/** Short weekday label of night N (its starting evening), e.g. "st". */
export function nightLabel(chata: Chata, night: number, locale: AppLocale): string {
  if (!chata.tripDateFrom) return String(night)
  const d = dayOnly(chata.tripDateFrom)
  d.setDate(d.getDate() + night - 1)
  return new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
    weekday: 'short',
  })
    .format(d)
    .replace('.', '')
}

function participantId(ref: number | Participant | null | undefined): number | null {
  if (ref == null) return null
  return typeof ref === 'object' ? ref.id : ref
}

export interface BedAssignment {
  roomName: string
  bedName: string
  /** other people in the same bed */
  roommates: Participant[]
  /** null = whole stay */
  nights: number[] | null
}

/** participantId → their bed (first match wins, like the admin rozpis). */
export function getBedAssignments(
  chata: Chata,
  participants: Participant[],
): Map<number, BedAssignment> {
  const byId = new Map(participants.map((p) => [p.id, p]))
  const result = new Map<number, BedAssignment>()
  for (const room of chata.rooms || []) {
    for (const bed of room.beds || []) {
      const occupants = bed.occupants || []
      for (const occupant of occupants) {
        const id = participantId(occupant.participant)
        if (id == null || result.has(id)) continue
        const roommates = occupants
          .map((o) => participantId(o.participant))
          .filter((otherId): otherId is number => otherId != null && otherId !== id)
          .map((otherId) => byId.get(otherId))
          .filter((p): p is Participant => p != null)
        result.set(id, {
          roomName: room.name,
          bedName: bed.name,
          roommates,
          nights: getOccupantNights(occupant),
        })
      }
    }
  }
  return result
}

export type CarRole = 'driver' | 'front' | 'back'

export interface CarAssignment {
  carName: string
  role: CarRole
}

/** participantId → their car and seat role. */
export function getCarAssignments(chata: Chata): Map<number, CarAssignment> {
  const result = new Map<number, CarAssignment>()
  for (const car of chata.sharedCars || []) {
    const claim = (ref: number | Participant | null | undefined, role: CarRole) => {
      const id = participantId(ref)
      if (id != null && !result.has(id)) result.set(id, { carName: car.name, role })
    }
    claim(car.driver, 'driver')
    claim(car.frontPassenger, 'front')
    for (const passenger of car.passengers || []) claim(passenger.participant, 'back')
  }
  return result
}

/** Everyone in a car, in seating order (for occupancy counts and lists). */
export function carOccupants(
  car: SharedCar,
  participants: Participant[],
): { driver: Participant | null; front: Participant | null; back: Participant[] } {
  const byId = new Map(participants.map((p) => [p.id, p]))
  const resolve = (ref: number | Participant | null | undefined): Participant | null => {
    const id = participantId(ref)
    return id != null ? (byId.get(id) ?? null) : null
  }
  return {
    driver: resolve(car.driver),
    front: resolve(car.frontPassenger),
    back: (car.passengers || [])
      .map((p) => resolve(p.participant))
      .filter((p): p is Participant => p != null),
  }
}

export interface ArrivalGroup {
  participants: Participant[]
  /** presence per night, index 0 = night 1 */
  presence: boolean[]
  /** true when present every night */
  wholeStay: boolean
}

/**
 * "Kdo přijede kdy" — participants grouped by identical night patterns,
 * derived from the bedroom rozpis. Whole-stay group first, then partial
 * patterns by first present night.
 */
export function getArrivalGroups(chata: Chata, participants: Participant[]): ArrivalGroup[] {
  const totalNights = getTripNights(chata)
  if (totalNights === 0) return []
  const assignments = getBedAssignments(chata, participants)
  if (assignments.size === 0) return []

  const groups = new Map<string, ArrivalGroup>()
  for (const participant of participants) {
    const assignment = assignments.get(participant.id)
    if (!assignment) continue
    const presence = Array.from({ length: totalNights }, (_, i) =>
      assignment.nights === null ? true : assignment.nights.includes(i + 1),
    )
    const key = presence.map((p) => (p ? '1' : '0')).join('')
    const existing = groups.get(key)
    if (existing) {
      existing.participants.push(participant)
    } else {
      groups.set(key, {
        participants: [participant],
        presence,
        wholeStay: presence.every(Boolean),
      })
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.wholeStay !== b.wholeStay) return a.wholeStay ? -1 : 1
    const firstNight = (g: ArrivalGroup) => g.presence.findIndex(Boolean)
    return firstNight(a) - firstNight(b)
  })
}

/** How many people sleep on each night (index 0 = night 1). */
export function nightlyCounts(chata: Chata, participants: Participant[]): number[] {
  const totalNights = getTripNights(chata)
  if (totalNights === 0) return []
  const counts = new Array(totalNights).fill(0)
  for (const group of getArrivalGroups(chata, participants)) {
    group.presence.forEach((present, i) => {
      if (present) counts[i] += group.participants.length
    })
  }
  return counts
}

/** Total sleeping places across rooms (0 when no rozpis). */
export function sleepingCapacity(chata: Chata): number {
  return (chata.rooms || []).reduce(
    (acc, room: Room) => acc + (room.maxSleepingSpaces || 0),
    0,
  )
}

/** Occupied sleeping places (people assigned to any bed). */
export function occupiedPlaces(chata: Chata, participants: Participant[]): number {
  return getBedAssignments(chata, participants).size
}

/**
 * Person-nights for the "na osobonoc" recap metric. Prefers the bedroom
 * rozpis; falls back to everyone × all nights when no rozpis exists.
 */
export function personNights(chata: Chata, participants: Participant[]): number {
  const totalNights = getTripNights(chata)
  if (totalNights === 0) return 0
  const assignments = getBedAssignments(chata, participants)
  if (assignments.size === 0) return participants.length * totalNights
  let sum = 0
  for (const assignment of assignments.values()) {
    sum += assignment.nights === null ? totalNights : assignment.nights.length
  }
  return sum
}

/** Participants assigned to no shared car (train riders etc.). */
export function participantsWithoutCar(
  chata: Chata,
  participants: Participant[],
): Participant[] {
  const assigned = getCarAssignments(chata)
  return participants.filter((p) => !assigned.has(p.id))
}

/** Participants whose FIRST night is `night` — they arrive that day. */
export function arrivalsOnNight(
  chata: Chata,
  participants: Participant[],
  night: number,
): Participant[] {
  return getArrivalGroups(chata, participants)
    .filter((g) => !g.wholeStay && g.presence.findIndex(Boolean) === night - 1)
    .flatMap((g) => g.participants)
}

/** Participants present on a given night. */
export function presentOnNight(
  chata: Chata,
  participants: Participant[],
  night: number,
): Participant[] {
  return getArrivalGroups(chata, participants)
    .filter((g) => g.presence[night - 1])
    .flatMap((g) => g.participants)
}

/** Google Maps directions target, from coordinates or a text address. */
export function navigateUrl(chata: Chata): string | null {
  if (chata.destinationLat != null && chata.destinationLng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${chata.destinationLat},${chata.destinationLng}`
  }
  const query = chata.destinationLocation || chata.destinationName
  if (!query) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`
}
