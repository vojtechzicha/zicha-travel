// Frontend-specific types for the Chata expense tracker
// Re-export backend stats types for consistency
export type {
  ParticipantStats,
  ChataStats as Stats,
} from '@/utils/calculateStats'

// Extended types for Payload data with stats
export interface ChataWithStats {
  _stats?: {
    participants: Record<string, ParticipantStats>
    debtors: Array<{ name: string; amount: number }>
    creditors: Array<{ name: string; amount: number }>
    totalExpenses: number
    totalPrepayments: number
  }
}

// Transportation types for Information view
export interface CarRoute {
  from: string
  duration: string
  distance: string
  route: string
}

export interface PublicTransportConnection {
  type: string
  number: string
  from: string
  to: string
  departure: string
  arrival: string
}

export interface PublicTransport {
  title: string
  totalDuration: string
  connections: PublicTransportConnection[]
  notes?: string
}

export interface Bed {
  type: string
  occupants: string[]
}

export interface Bedroom {
  name: string
  beds: Bed[]
}

export interface Photo {
  url: string
  alt?: string
}

export interface Destination {
  name: string
  location?: string
  description?: string
  links?: { label: string; url: string }[]
  photos?: Photo[]
}

export interface Transportation {
  car?: CarRoute[]
  publicTransport?: PublicTransport[]
  parking?: string
}

export interface InformationConfig {
  enabled: boolean
  dates?: {
    from: string
    to: string
  }
  destination?: Destination
  transportation?: Transportation
  bedrooms?: Bedroom[]
  basicInfo?: string[]
}

// Contact info type
export interface ContactInfo {
  number: string
  iban: string
}
