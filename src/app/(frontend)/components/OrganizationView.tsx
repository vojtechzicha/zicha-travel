'use client'

import { useState } from 'react'
import { BedDouble, Car, ChevronDown, ChevronUp, Moon } from 'lucide-react'
import type { Chata, Media, Participant } from '@/payload-types'
import { getAvatarColor } from '@/lib/formatCurrency'
import {
  type Room,
  type Bed,
  type Occupant,
  getParticipantName,
  participantHasPet,
  getOccupantParticipant,
  getOccupantNights,
  getTripNights,
} from '../utils/participantHelpers'

interface OrganizationViewProps {
  chata: Chata
}

// Type helpers for shared cars
type SharedCar = NonNullable<Chata['sharedCars']>[number]
type CarPassenger = NonNullable<SharedCar['passengers']>[number]

// Helper to get date for a specific night
function getNightDate(chata: Chata, nightNumber: number): Date | null {
  if (!chata.tripDateFrom) return null
  const from = new Date(chata.tripDateFrom)
  from.setDate(from.getDate() + nightNumber - 1)
  return from
}

// Format date as short Czech format (e.g., "pá 15.3.")
function formatShortDate(date: Date): string {
  const days = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so']
  const dayName = days[date.getDay()]
  return `${dayName} ${date.getDate()}.${date.getMonth() + 1}.`
}

// Calculate room occupancy
function getRoomOccupancy(room: Room, totalNights: number = 0) {
  const beds = room.beds || []
  let currentOccupants = 0
  beds.forEach((bed) => {
    const occupants = bed.occupants || []
    currentOccupants += occupants.length
  })
  return {
    current: currentOccupants,
    max: room.maxSleepingSpaces,
    percentage: room.maxSleepingSpaces > 0
      ? Math.round((currentOccupants / room.maxSleepingSpaces) * 100)
      : 0,
  }
}

// Get occupancy color classes
function getOccupancyColorClass(percentage: number): string {
  if (percentage === 0) return 'bg-gray-100 text-gray-500 border-gray-200'
  if (percentage < 100) return 'bg-amber-100 text-amber-700 border-amber-300'
  return 'bg-emerald-100 text-emerald-700 border-emerald-300'
}

// Get occupancy emoji
function getOccupancyEmoji(percentage: number): string {
  if (percentage === 0) return '😴'
  if (percentage < 50) return '🛏️'
  if (percentage < 100) return '🌙'
  return '✨'
}

// Get Czech room count text
function getRoomCountText(count: number): string {
  if (count === 1) return 'pokoj'
  if (count >= 2 && count <= 4) return 'pokoje'
  return 'pokojů'
}

// Get Czech car count text
function getCarCountText(count: number): string {
  if (count === 1) return 'auto'
  if (count >= 2 && count <= 4) return 'auta'
  return 'aut'
}

// Get Czech passenger count text
function getPassengerCountText(count: number): string {
  if (count === 1) return 'cestující'
  if (count >= 2 && count <= 4) return 'cestující'
  return 'cestujících'
}

// Helper to get participant from relationship
function getParticipantFromRelation(
  relation: number | Participant | null | undefined
): Participant | null {
  if (typeof relation === 'object' && relation !== null) {
    return relation as Participant
  }
  return null
}

// Get total passenger count for a car (driver + front + back)
function getCarOccupancy(car: SharedCar): number {
  let count = 1 // driver always counts
  if (car.frontPassenger) count++
  count += (car.passengers || []).length
  return count
}

// Get initials from name
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function OrganizationView({ chata }: OrganizationViewProps) {
  const [expandedRooms, setExpandedRooms] = useState<string[]>([])
  const [expandedCars, setExpandedCars] = useState<string[]>([])

  const toggleRoom = (roomId: string) => {
    setExpandedRooms((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    )
  }

  const toggleCar = (carId: string) => {
    setExpandedCars((prev) =>
      prev.includes(carId) ? prev.filter((id) => id !== carId) : [...prev, carId]
    )
  }

  // Feature flags
  const hasBedrooms = chata.bedroomOrganizationEnabled === true
  const hasCars = chata.sharedCarsEnabled === true

  // Check if any organization feature is enabled
  if (!hasBedrooms && !hasCars) {
    return (
      <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-10 max-w-4xl mx-auto animate-in fade-in duration-300">
        <div className="text-center py-8">
          <BedDouble className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600 text-lg">Organizace není k dispozici.</p>
        </div>
      </div>
    )
  }

  // Bedroom data
  const rooms = chata.rooms || []
  const isAdvancedMode = chata.advancedBedroomMode === true
  const totalNights = getTripNights(chata)

  // Calculate bedroom stats
  const totalStats = rooms.reduce(
    (acc, room) => {
      const occ = getRoomOccupancy(room)
      acc.totalSpaces += occ.max
      acc.occupied += occ.current
      return acc
    },
    { totalSpaces: 0, occupied: 0 }
  )

  // Car data
  const sharedCars = chata.sharedCars || []
  const totalCarPassengers = sharedCars.reduce((acc, car) => acc + getCarOccupancy(car), 0)

  // Determine hero content based on enabled features
  const getHeroContent = () => {
    if (hasCars && hasBedrooms) {
      // Combined: mention both in title, but no icon (emojis in title are enough)
      return {
        icon: null,
        title: '🛏️ Kde budeme spát a jak se tam dostaneme? 🚗',
        emoji: '',
      }
    } else if (hasCars) {
      return {
        icon: <Car size={48} className="mx-auto text-primary mb-4" />,
        title: 'Jak se tam dostaneme?',
        emoji: '🚗',
      }
    } else {
      return {
        icon: <Moon size={48} className="mx-auto text-primary mb-4" />,
        title: 'Kde budeme spát?',
        emoji: '🛏️',
      }
    }
  }

  const heroContent = getHeroContent()

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-6 sm:p-10 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-light/20 to-primary-light/40 rounded-2xl p-6 sm:p-10 text-center mb-8 border-2 border-primary/10">
        {heroContent.icon}
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-gray-900 mb-6">
          {heroContent.title} {heroContent.emoji}
        </h2>
        <div className="flex justify-center gap-4 sm:gap-8 flex-wrap">
          {/* Bedroom stats only - car stats don't make sense across different trips */}
          {hasBedrooms && rooms.length > 0 && (
            <>
              <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-md min-w-[120px]">
                <span className="text-3xl block mb-1">🏠</span>
                <span className="text-2xl font-bold text-primary font-serif">{rooms.length}</span>
                <span className="block text-sm text-gray-600 font-medium">
                  {getRoomCountText(rooms.length)}
                </span>
              </div>
              <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-md min-w-[120px]">
                <span className="text-3xl block mb-1">🛏️</span>
                <span className="text-2xl font-bold text-primary font-serif">
                  {totalStats.occupied}/{totalStats.totalSpaces}
                </span>
                <span className="block text-sm text-gray-600 font-medium">obsazeno</span>
              </div>
            </>
          )}
          {isAdvancedMode && totalNights > 0 && (
            <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-md min-w-[120px]">
              <span className="text-3xl block mb-1">🌙</span>
              <span className="text-2xl font-bold text-primary font-serif">{totalNights}</span>
              <span className="block text-sm text-gray-600 font-medium">
                {totalNights === 1 ? 'noc' : totalNights >= 2 && totalNights <= 4 ? 'noci' : 'nocí'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Rooms Section - bedrooms come first */}
      {hasBedrooms && (
        <div className="mb-8">
        <div className="flex items-center gap-3 mb-6 pb-3 border-b-4 border-gray-100">
          <BedDouble size={24} className="text-primary" />
          <h3 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
            Pokoje a postele
          </h3>
        </div>

        {rooms.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>Zatím nejsou přidány žádné pokoje.</p>
          </div>
        ) : (
          <div className="rooms-grid">
            {rooms.map((room, idx) => {
              const roomId = room.id || String(idx)
              const isExpanded = expandedRooms.includes(roomId)
              const occupancy = getRoomOccupancy(room)
              const colorClass = getOccupancyColorClass(occupancy.percentage)
              const emoji = getOccupancyEmoji(occupancy.percentage)
              const image = room.image as Media | null

              return (
                <div
                  key={roomId}
                  className="bg-white rounded-2xl overflow-hidden shadow-lg border-2 border-gray-100 hover:-translate-y-1 transition-all duration-300"
                >
                  {/* Room Image */}
                  {image?.url && (
                    <div className="w-full h-44 overflow-hidden">
                      <img
                        src={image.url}
                        alt={image.alt || room.name}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}

                  <div className="p-5">
                    {/* Room Header */}
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-serif text-xl font-bold text-gray-900">{room.name}</h4>
                      <span
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${colorClass}`}
                      >
                        {emoji} {occupancy.current}/{occupancy.max}
                      </span>
                    </div>

                    {/* Description */}
                    {room.description && (
                      <p className="text-gray-600 text-sm leading-relaxed mb-4">
                        {room.description}
                      </p>
                    )}

                    {/* Expandable Beds Section */}
                    {room.beds && room.beds.length > 0 && (
                      <>
                        <button
                          onClick={() => toggleRoom(roomId)}
                          className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer font-semibold text-gray-600 hover:bg-gray-100 hover:text-primary transition-colors"
                        >
                          <span>{isExpanded ? 'Skrýt postele' : 'Zobrazit postele'}</span>
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>

                        {isExpanded && (
                          <div className="mt-4 space-y-3 animate-slideDown">
                            {isAdvancedMode && totalNights > 0 ? (
                              // Advanced Mode: Timeline Grid
                              <AdvancedBedsView
                                beds={room.beds}
                                totalNights={totalNights}
                                chata={chata}
                              />
                            ) : (
                              // Simple Mode: Bed list with occupant tags
                              room.beds.map((bed, bedIdx) => {
                                const bedOccupants = (bed.occupants || []).filter(
                                  (o) => getParticipantName(o)
                                )

                                return (
                                  <div
                                    key={bed.id || bedIdx}
                                    className="bg-gray-50 p-4 rounded-xl border-l-4 border-primary"
                                  >
                                    <div className="flex items-center gap-2 mb-3">
                                      <BedDouble size={16} className="text-primary" />
                                      <span className="font-semibold text-gray-900">{bed.name}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {bedOccupants.length > 0 ? (
                                        bedOccupants.map((occupant, i) => {
                                          const participant = getOccupantParticipant(occupant)
                                          return (
                                            <span
                                              key={occupant.id || i}
                                              className="bg-primary text-white px-3 py-1.5 rounded-full text-sm font-semibold"
                                            >
                                              {participant?.name}
                                              {participantHasPet(participant) && ' + 🐕'}
                                            </span>
                                          )
                                        })
                                      ) : (
                                        <span className="bg-gray-200 text-gray-500 px-3 py-1.5 rounded-full text-sm font-semibold">
                                          Volné místo 💤
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        </div>
      )}

      {/* Shared Cars Section */}
      {hasCars && sharedCars.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-6 pb-3 border-b-4 border-gray-100">
            <Car size={24} className="text-primary" />
            <h3 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">
              Sdílená auta
            </h3>
          </div>

          <div className="rooms-grid">
            {sharedCars.map((car, idx) => {
              const carId = car.id || String(idx)
              const isExpanded = expandedCars.includes(carId)
              const driver = getParticipantFromRelation(car.driver)
              const frontPassenger = getParticipantFromRelation(car.frontPassenger)
              const passengerCount = getCarOccupancy(car)

              return (
                <div
                  key={carId}
                  className="bg-white rounded-2xl overflow-hidden shadow-lg border-2 border-gray-100 hover:-translate-y-1 transition-all duration-300"
                >
                  {/* Car Header with gradient */}
                  <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-5">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-serif text-xl font-bold text-gray-900">{car.name}</h4>
                      <span className="px-3 py-1.5 rounded-full text-sm font-semibold border bg-emerald-100 text-emerald-700 border-emerald-300">
                        🚗 {passengerCount}
                      </span>
                    </div>
                    {car.description && (
                      <p className="text-gray-600 text-sm leading-relaxed">{car.description}</p>
                    )}
                  </div>

                  <div className="p-5">
                    {/* Driver row - always visible */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                        {driver ? getInitials(driver.name) : '?'}
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 uppercase font-semibold">Řidič</span>
                        <p className="font-semibold text-gray-900">
                          {driver?.name || 'Neurčeno'}
                          {participantHasPet(driver) && ' + 🐕'}
                        </p>
                      </div>
                    </div>

                    {/* Front passenger - if set */}
                    {frontPassenger && (
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className={`w-10 h-10 rounded-full ${getAvatarColor(frontPassenger.name)} flex items-center justify-center text-white font-bold text-sm`}
                        >
                          {getInitials(frontPassenger.name)}
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase font-semibold">
                            Spolujezdec
                          </span>
                          <p className="font-semibold text-gray-900">
                            {frontPassenger.name}
                            {participantHasPet(frontPassenger) && ' + 🐕'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Expandable passengers section */}
                    {car.passengers && car.passengers.length > 0 && (
                      <>
                        <button
                          onClick={() => toggleCar(carId)}
                          className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer font-semibold text-gray-600 hover:bg-gray-100 hover:text-primary transition-colors mt-3"
                        >
                          <span>
                            {isExpanded
                              ? 'Skrýt cestující'
                              : `Zobrazit cestující (${car.passengers.length})`}
                          </span>
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>

                        {isExpanded && (
                          <div className="mt-4 space-y-2 animate-slideDown">
                            {car.passengers.map((passenger, pIdx) => {
                              const p = getParticipantFromRelation(passenger.participant)
                              if (!p) return null
                              return (
                                <div
                                  key={passenger.id || pIdx}
                                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl"
                                >
                                  <div
                                    className={`w-8 h-8 rounded-full ${getAvatarColor(p.name)} flex items-center justify-center text-white font-bold text-xs`}
                                  >
                                    {getInitials(p.name)}
                                  </div>
                                  <span className="font-medium text-gray-900">
                                    {p.name}
                                    {participantHasPet(p) && ' + 🐕'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )}

                    {/* Equipment section - if any */}
                    {car.equipment && car.equipment.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <span className="text-xs text-gray-500 uppercase font-semibold block mb-2">
                          Náklad
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {car.equipment.map((item, eIdx) => (
                            <span
                              key={item.id || eIdx}
                              className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-sm font-semibold"
                            >
                              📦 {item.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Advanced Beds View with Timeline Grid
interface AdvancedBedsViewProps {
  beds: NonNullable<Room['beds']>
  totalNights: number
  chata: Chata
}

function AdvancedBedsView({ beds, totalNights, chata }: AdvancedBedsViewProps) {
  const nights = Array.from({ length: totalNights }, (_, i) => i + 1)

  return (
    <div className="space-y-4">
      {beds.map((bed, bedIdx) => {
        const occupants = bed.occupants || []

        return (
          <div key={bed.id || bedIdx} className="bg-gray-50 p-4 rounded-xl border-l-4 border-primary">
            <div className="flex items-center gap-2 mb-4">
              <BedDouble size={16} className="text-primary" />
              <span className="font-semibold text-gray-900">{bed.name}</span>
            </div>

            {occupants.length === 0 ? (
              <span className="bg-gray-200 text-gray-500 px-3 py-1.5 rounded-full text-sm font-semibold inline-block">
                Volné místo 💤
              </span>
            ) : (
              <div className="space-y-3">
                {/* Night headers */}
                <div className="flex gap-1">
                  <div className="w-24 shrink-0" />
                  {nights.map((night) => {
                    const nightDate = getNightDate(chata, night)
                    return (
                      <div
                        key={night}
                        className="flex-1 text-center text-xs text-gray-500 min-w-[40px]"
                      >
                        <div className="font-semibold">Noc {night}</div>
                        {nightDate && (
                          <div className="text-gray-400">{formatShortDate(nightDate)}</div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Occupant rows */}
                {occupants.map((occupant, occIdx) => {
                  const name = getParticipantName(occupant)
                  const participant = getOccupantParticipant(occupant)
                  const occupantNights = getOccupantNights(occupant)
                  const colorClass = getAvatarColor(name)
                  const hasPet = participantHasPet(participant)

                  return (
                    <div key={occupant.id || occIdx} className="flex gap-1 items-center">
                      <div
                        className="w-24 shrink-0 text-sm font-medium text-gray-700 truncate pr-2"
                        title={name}
                      >
                        {name}{hasPet && ' + 🐕'}
                      </div>
                      <div className="flex-1 flex gap-0.5">
                        {nights.map((night) => {
                          const isPresent =
                            occupantNights === null || occupantNights.includes(night)
                          return (
                            <div
                              key={night}
                              className={`flex-1 h-8 rounded min-w-[40px] transition-all ${
                                isPresent
                                  ? `${colorClass} opacity-90`
                                  : 'bg-gray-200 opacity-30'
                              }`}
                              title={
                                isPresent
                                  ? `${name} - Noc ${night}`
                                  : `${name} není přítomen/a`
                              }
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {/* Legend */}
                <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                  {occupants.map((occupant, occIdx) => {
                    const name = getParticipantName(occupant)
                    const participant = getOccupantParticipant(occupant)
                    const hasPet = participantHasPet(participant)
                    const occupantNights = getOccupantNights(occupant)
                    const nightsText =
                      occupantNights === null
                        ? 'celý pobyt'
                        : occupantNights.length === 1
                          ? `jen noc ${occupantNights[0]}`
                          : `jen noci ${occupantNights.slice(0, -1).join(', ')} a ${occupantNights[occupantNights.length - 1]}`
                    return (
                      <span key={occupant.id || occIdx} className="mr-3">
                        <span className="font-medium">{name}{hasPet && ' + 🐕'}</span>: {nightsText}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
