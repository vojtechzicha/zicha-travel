'use client'

// "Organizace" — rooms & cars, redesigned per "Organizace a účastníci —
// finál": beds and their occupants are visible right away (no expanding),
// the night timeline shows only for people who are not staying the whole
// trip, free places are stated openly (and hidden once the trip is over),
// and the viewer's own bed/car is highlighted in the chata theme color.
// Read-only by design — the rozpis is the banker's job in the admin.

import { useMemo } from 'react'
import { BedDouble, Car } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import type { AppLocale } from '@/i18n/config'
import type { Chata, Media, Participant } from '@/payload-types'
import { anonymousViewer, type FinanceViewer } from '@/lib/financeAccess'
import {
  getOccupantNights,
  getOccupantParticipant,
  getTripNights,
  type Room,
} from '../utils/participantHelpers'
import {
  arrivalsOnNight,
  carOccupants,
  getBedAssignments,
  getCarAssignments,
  getTripPhase,
  nightLabel,
  presentOnNight,
  sleepingCapacity,
  tonightNumber,
} from '../utils/tripData'
import {
  AccentCard,
  PersonChip,
  Sheet,
  SheetHeading,
  StatStrip,
  StatusBadge,
} from './SheetUi'

interface OrganizationViewProps {
  chata: Chata
  participants: Participant[]
  viewer?: FinanceViewer
}

type SharedCar = NonNullable<Chata['sharedCars']>[number]
type Occupant = NonNullable<NonNullable<Room['beds']>[number]['occupants']>[number]

function petSuffix(participant: Participant | null): string {
  return participant?.hasPet ? ' 🐕' : ''
}

/**
 * "· čt–ne" — day range covered by a partial stay (arrival day of the first
 * night to the morning after the last night). Non-contiguous stays fall
 * back to a night count handled by the caller.
 */
function nightsRangeLabel(chata: Chata, nights: number[], locale: AppLocale): string | null {
  if (nights.length === 0) return null
  const sorted = [...nights].sort((a, b) => a - b)
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1)
  if (!contiguous) return null
  const first = sorted[0]
  const lastMorning = sorted[sorted.length - 1] + 1
  return `${nightLabel(chata, first, locale)}–${nightLabel(chata, lastMorning, locale)}`
}

function roomOccupantCount(room: Room): number {
  return (room.beds || []).reduce((acc, bed) => acc + (bed.occupants || []).length, 0)
}

export function OrganizationView({
  chata,
  participants,
  viewer = anonymousViewer,
}: OrganizationViewProps) {
  const t = useTranslations('trip')
  const locale = useLocale() as AppLocale

  const hasBedrooms = chata.bedroomOrganizationEnabled === true
  const hasCars = chata.sharedCarsEnabled === true

  const phase = getTripPhase(chata)
  const totalNights = getTripNights(chata)
  const tonight = tonightNumber(chata)
  const rooms = chata.rooms || []
  const sharedCars = chata.sharedCars || []
  const capacity = sleepingCapacity(chata)
  const myIds = viewer.linkedParticipantIds

  const bedAssignments = useMemo(
    () => getBedAssignments(chata, participants),
    [chata, participants],
  )
  const carAssignments = useMemo(() => getCarAssignments(chata), [chata])
  const me = participants.find((p) => myIds.includes(p.id)) ?? null
  const myBed = me ? bedAssignments.get(me.id) : undefined
  const myCar = me ? carAssignments.get(me.id) : undefined

  if (!hasBedrooms && !hasCars) {
    return (
      <Sheet>
        <div className="text-center py-8">
          <BedDouble className="mx-auto text-gray-300 dark:text-slate-600 mb-4" size={48} />
          <p className="text-gray-600 dark:text-slate-300 text-lg">
            {t('organization.notAvailable')}
          </p>
        </div>
      </Sheet>
    )
  }

  // ── header strip ──
  const occupied = bedAssignments.size
  const statItems: Array<{ value: React.ReactNode; label: string }> = []
  if (hasBedrooms && rooms.length > 0) {
    statItems.push({
      value: rooms.length,
      label: t('organization.roomsCountLabel', { count: rooms.length }),
    })
    if (capacity > 0) {
      statItems.push({ value: `${occupied}/${capacity}`, label: t('organization.placesTaken') })
    }
  }
  if (totalNights > 0) {
    statItems.push({
      value: totalNights,
      label: t('organization.nightsCountLabel', { count: totalNights }),
    })
  }
  if (hasCars && sharedCars.length > 0) {
    statItems.push({
      value: sharedCars.length,
      label:
        t('organization.carsCountLabel', { count: sharedCars.length }) +
        ((chata.publicTransportOptions || []).length > 0
          ? ` + ${t('organization.trainSuffix')}`
          : ''),
    })
  }

  // ── my places card ──
  const myPlaces =
    me && (myBed || myCar) ? (
      <AccentCard label={t('organization.yourPlaces')} className="mt-4">
        <div className="flex flex-col gap-1.5 text-sm text-gray-800 dark:text-slate-200">
          {myBed && (
            <div>
              {t('organization.youSleepIn')}{' '}
              <strong className="font-semibold">{myBed.roomName}</strong>, {myBed.bedName}
              {myBed.roommates.length > 0 && (
                <span className="text-gray-500 dark:text-slate-400">
                  {' '}
                  · {t('organization.togetherWith')}{' '}
                  {myBed.roommates.map((p) => p.name + petSuffix(p)).join(', ')}
                </span>
              )}
            </div>
          )}
          {myCar && (
            <div>
              {t('organization.youRideIn')}{' '}
              <strong className="font-semibold">{myCar.carName}</strong>
              <span className="text-gray-500 dark:text-slate-400">
                {' '}
                ·{' '}
                {myCar.role === 'driver'
                  ? t('organization.roleYouDrive')
                  : myCar.role === 'front'
                    ? t('organization.roleFrontSeat')
                    : t('organization.roleBackSeat')}
              </span>
            </div>
          )}
        </div>
      </AccentCard>
    ) : null

  // ── tonight box (during the trip) ──
  const presentTonight = tonight > 0 ? presentOnNight(chata, participants, tonight) : []
  const arrivingToday = tonight > 0 ? arrivalsOnNight(chata, participants, tonight) : []
  const tonightBox =
    phase === 'during' && hasBedrooms && presentTonight.length > 0 ? (
      <div className="mt-4 rounded-2xl border border-emerald-600/25 bg-emerald-600/[0.05] dark:border-emerald-400/25 dark:bg-emerald-400/[0.06] px-4 py-3.5 sm:px-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300 mb-1.5">
          {t('organization.tonightTitle', {
            from: nightLabel(chata, tonight, locale),
            to: nightLabel(chata, tonight + 1, locale),
          })}
        </div>
        <div className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
          {t.rich('organization.tonightSleeps', {
            count: presentTonight.length,
            capacity: capacity > 0 ? capacity : presentTonight.length,
            strong: (chunks) => (
              <strong className="text-gray-900 dark:text-gray-100">{chunks}</strong>
            ),
          })}
          {arrivingToday.length > 0 && (
            <span className="text-gray-500 dark:text-slate-400">
              {' '}
              {t('organization.tonightArrives', {
                names: arrivingToday.map((p) => p.name + petSuffix(p)).join(', '),
              })}
            </span>
          )}
        </div>
      </div>
    ) : null

  // ── occupant chip with optional partial-stay suffix ──
  const occupantChip = (occupant: Occupant, key: React.Key) => {
    const participant = getOccupantParticipant(occupant)
    if (!participant) return null
    const isMine = myIds.includes(participant.id)
    const occupantNights = getOccupantNights(occupant)
    const rangeLabel =
      occupantNights !== null && totalNights > 0 && occupantNights.length < totalNights
        ? (nightsRangeLabel(chata, occupantNights, locale) ??
          t('organization.nightsShort', { count: occupantNights.length }))
        : null
    return (
      <PersonChip key={key} highlight={isMine}>
        {participant.name}
        {petSuffix(participant)}
        {isMine && ` ${t('organization.youSuffix')}`}
        {rangeLabel && (
          <span className={isMine ? 'text-white/80' : 'text-primary-dark dark:text-primary-light'}>
            {' '}
            · {rangeLabel}
          </span>
        )}
      </PersonChip>
    )
  }

  // ── rooms ──
  const roomsSection =
    hasBedrooms && rooms.length > 0 ? (
      <div>
        <SheetHeading
          icon={BedDouble}
          title={t('organization.roomsTitle')}
          aside={t('organization.readOnlyNote')}
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
          {rooms.map((room, roomIdx) => {
            const image = room.image as Media | null
            const occupantCount = roomOccupantCount(room)
            const max = room.maxSleepingSpaces || 0
            const isMyRoom = Boolean(myBed && myBed.roomName === room.name)
            const free = Math.max(0, max - occupantCount)
            const partialOccupants = (room.beds || [])
              .flatMap((bed) => bed.occupants || [])
              .filter((occupant) => {
                const nightsList = getOccupantNights(occupant)
                return (
                  nightsList !== null && totalNights > 0 && nightsList.length < totalNights
                )
              })

            return (
              <div
                key={room.id || roomIdx}
                className={`rounded-2xl overflow-hidden border ${
                  isMyRoom
                    ? 'border-2 border-primary/40'
                    : 'border-gray-200 dark:border-white/[0.08]'
                } bg-white dark:bg-white/[0.02]`}
              >
                {image?.url && (
                  <img
                    src={image.url}
                    alt={image.alt || room.name}
                    loading="lazy"
                    className="w-full h-24 object-cover"
                  />
                )}
                <div className="p-3.5">
                  <div className="flex justify-between items-baseline gap-2 mb-1">
                    <strong className="font-serif text-[16px] text-gray-900 dark:text-gray-100">
                      {room.name}
                    </strong>
                    {max > 0 && (
                      <StatusBadge
                        tone={occupantCount >= max ? 'green' : occupantCount > 0 ? 'amber' : 'gray'}
                      >
                        {occupantCount}/{max}
                      </StatusBadge>
                    )}
                  </div>
                  {room.description && (
                    <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed m-0 mb-2.5">
                      {room.description}
                      {isMyRoom && (
                        <span className="text-primary-dark dark:text-primary-light font-semibold">
                          {' '}
                          {t('organization.yourRoomNote')}
                        </span>
                      )}
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    {(room.beds || []).map((bed, bedIdx) => {
                      const occupants = (bed.occupants || []).filter((o) =>
                        getOccupantParticipant(o),
                      )
                      // Archived trips don't advertise free places (design rule)
                      if (occupants.length === 0 && phase === 'after') return null
                      return (
                        <div
                          key={bed.id || bedIdx}
                          className="rounded-lg bg-gray-50 dark:bg-white/[0.03] px-2.5 py-2"
                        >
                          <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-gray-500 dark:text-slate-400 mb-1.5">
                            {bed.name}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {occupants.length > 0 ? (
                              occupants.map((occupant, i) => occupantChip(occupant, occupant.id || i))
                            ) : (
                              <PersonChip dashed>{t('organization.freeSpot')}</PersonChip>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {free > 0 && phase !== 'after' && occupantCount > 0 && (
                      <div className="flex">
                        <PersonChip dashed>
                          {t('organization.freePlaces', { count: free })}
                        </PersonChip>
                      </div>
                    )}
                  </div>

                  {/* mini timeline — only people NOT staying the whole trip */}
                  {partialOccupants.length > 0 && totalNights > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-white/[0.06]">
                      {partialOccupants.map((occupant, i) => {
                        const participant = getOccupantParticipant(occupant)
                        const nightsList = getOccupantNights(occupant) || []
                        return (
                          <div key={occupant.id || i} className="flex gap-1 items-center mt-1">
                            <span
                              className="w-14 shrink-0 text-[10px] text-gray-400 dark:text-slate-500 truncate"
                              title={participant?.name}
                            >
                              {participant?.name}
                            </span>
                            {Array.from({ length: totalNights }, (_, nightIdx) => (
                              <span
                                key={nightIdx}
                                className={`flex-1 h-2.5 rounded-[3px] ${
                                  nightsList.includes(nightIdx + 1)
                                    ? 'bg-primary-light'
                                    : 'bg-gray-100 border border-gray-200 dark:bg-white/[0.05] dark:border-white/[0.08]'
                                }`}
                              />
                            ))}
                          </div>
                        )
                      })}
                      <div className="flex gap-1 mt-0.5" aria-hidden="true">
                        <span className="w-14 shrink-0" />
                        {Array.from({ length: totalNights }, (_, nightIdx) => (
                          <span
                            key={nightIdx}
                            className="flex-1 text-center text-[9px] text-gray-400 dark:text-slate-500"
                          >
                            {nightLabel(chata, nightIdx + 1, locale)}
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
    ) : null

  // ── cars ──
  const withoutCar = useMemo(() => {
    if (!hasCars || sharedCars.length === 0) return []
    return participants.filter((p) => !carAssignments.has(p.id))
  }, [hasCars, sharedCars.length, participants, carAssignments])

  const carsSection =
    hasCars && sharedCars.length > 0 ? (
      <div>
        <SheetHeading
          icon={Car}
          title={t('organization.sharedCarsTitle')}
          aside={
            withoutCar.length > 0 && (chata.publicTransportOptions || []).length > 0
              ? t('organization.trainRidersNote', {
                  names: withoutCar.map((p) => p.name).join(', '),
                })
              : undefined
          }
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
          {sharedCars.map((car: SharedCar, carIdx) => {
            const { driver, front, back } = carOccupants(car, participants)
            const occupantCount = (driver ? 1 : 0) + (front ? 1 : 0) + back.length
            const seats = car.seats ?? null
            const isMyCar = Boolean(myCar && myCar.carName === car.name)
            const freeBack = seats != null ? Math.max(0, seats - occupantCount) : 0

            const seatName = (participant: Participant | null) => {
              if (!participant) return null
              const isMine = myIds.includes(participant.id)
              return (
                <span
                  className={
                    isMine
                      ? 'font-semibold text-primary-dark dark:text-primary-light'
                      : undefined
                  }
                >
                  {participant.name}
                  {petSuffix(participant)}
                  {isMine && ` ${t('organization.youSuffix')}`}
                </span>
              )
            }

            return (
              <div
                key={car.id || carIdx}
                className={`rounded-2xl border ${
                  isMyCar
                    ? 'border-2 border-primary/40'
                    : 'border-gray-200 dark:border-white/[0.08]'
                } bg-white dark:bg-white/[0.02] px-4 py-3.5`}
              >
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <strong className="font-serif text-[16px] text-gray-900 dark:text-gray-100">
                    {car.name}
                  </strong>
                  {seats != null ? (
                    <StatusBadge tone={occupantCount >= seats ? 'green' : 'amber'}>
                      {occupantCount}/{seats}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="gray">{occupantCount}</StatusBadge>
                  )}
                </div>
                {car.description && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed m-0 mb-2.5 whitespace-pre-line">
                    {car.description}
                  </p>
                )}
                <div className="flex flex-col gap-1.5 text-[13px]">
                  <div className="flex gap-2.5">
                    <span className="w-14 shrink-0 text-gray-400 dark:text-slate-500">
                      {t('organization.driver')}
                    </span>
                    <span className="text-gray-900 dark:text-gray-100 font-semibold">
                      {driver ? seatName(driver) : t('organization.notAssigned')}
                    </span>
                  </div>
                  {front && (
                    <div className="flex gap-2.5">
                      <span className="w-14 shrink-0 text-gray-400 dark:text-slate-500">
                        {t('organization.frontSeat')}
                      </span>
                      <span className="text-gray-700 dark:text-slate-300">{seatName(front)}</span>
                    </div>
                  )}
                  {(back.length > 0 || freeBack > 0) && (
                    <div className="flex gap-2.5">
                      <span className="w-14 shrink-0 text-gray-400 dark:text-slate-500">
                        {t('organization.backSeat')}
                      </span>
                      <span className="text-gray-700 dark:text-slate-300">
                        {back.map((p, i) => (
                          <span key={p.id}>
                            {i > 0 && ', '}
                            {seatName(p)}
                          </span>
                        ))}
                        {freeBack > 0 && phase !== 'after' && (
                          <span className="text-gray-400 dark:text-slate-500">
                            {back.length > 0 && ' · '}
                            {t('organization.freeSeats', { count: freeBack })}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
                {(car.equipment || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100 dark:border-white/[0.06]">
                    {(car.equipment || []).map((item, eIdx) => (
                      <span
                        key={item.id || eIdx}
                        className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300 text-[11px] font-semibold px-2.5 py-0.5"
                      >
                        {item.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {withoutCar.length > 0 && (chata.publicTransportOptions || []).length === 0 && (
          <div className="text-[13px] text-gray-500 dark:text-slate-400 mt-3">
            {t('organization.withoutCarNote', {
              names: withoutCar.map((p) => p.name).join(', '),
            })}
          </div>
        )}
      </div>
    ) : null

  return (
    <Sheet>
      {statItems.length > 0 && <StatStrip items={statItems} />}
      {myPlaces}
      {tonightBox}
      {roomsSection}
      {carsSection}
    </Sheet>
  )
}
