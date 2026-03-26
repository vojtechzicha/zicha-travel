import type { Chata, Participant } from '@/payload-types'

// Type helpers for bedrooms
export type Room = NonNullable<Chata['rooms']>[number]
export type Bed = NonNullable<Room['beds']>[number]
export type Occupant = NonNullable<Bed['occupants']>[number]

// Helper to get participant name from occupant
export function getParticipantName(occupant: Occupant): string {
  if (typeof occupant.participant === 'object' && occupant.participant !== null) {
    return (occupant.participant as Participant).name
  }
  return ''
}

// Helper to check if participant has a pet
export function participantHasPet(participant: Participant | number | null | undefined): boolean {
  if (typeof participant === 'object' && participant !== null) {
    return participant.hasPet === true
  }
  return false
}

// Helper to get participant object from occupant
export function getOccupantParticipant(occupant: Occupant): Participant | null {
  if (typeof occupant.participant === 'object' && occupant.participant !== null) {
    return occupant.participant as Participant
  }
  return null
}

// Helper to get occupant's nights (returns null if all nights)
export function getOccupantNights(occupant: Occupant): number[] | null {
  const nights = occupant.nights
  if (Array.isArray(nights) && nights.length > 0) {
    return nights as number[]
  }
  return null // all nights
}

// Helper to calculate number of trip nights
export function getTripNights(chata: Chata): number {
  if (!chata.tripDateFrom || !chata.tripDateTo) return 0
  const from = new Date(chata.tripDateFrom)
  const to = new Date(chata.tripDateTo)
  const diffTime = Math.abs(to.getTime() - from.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}
