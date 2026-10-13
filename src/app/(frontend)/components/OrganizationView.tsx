'use client'

// "Organizace" — rooms & cars, redesigned per "Organizace a účastníci —
// finál": beds and their occupants are visible right away (no expanding),
// the night timeline shows only for people who are not staying the whole
// trip, free places are stated openly (and hidden once the trip is over),
// and the viewer's own bed/car is highlighted in the chata theme color.
//
// Editing is casual on purpose (rules in src/lib/organizationEditing.ts,
// building blocks in OrganizationEditing.tsx). The plan reads the same for
// everybody; a signed-in participant acts from "Tvoje místa", one row per
// own participant (a parent and a child): "Vybrat postel" / "Svezu se"
// switch the page into a picking MODE where free places light up with
// "Sem" and a sticky bar says what you're choosing; "Jedu autem" opens a
// short form. The banker and chata admins get a quiet "Upravit rozdělení"
// toggle for moving anybody. Anonymous visitors see the read-only plan.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BedDouble, Car, TrainFront } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import type { AppLocale } from '@/i18n/config'
import type { Chata, Media, Participant } from '@/payload-types'
import { anonymousViewer, type FinanceViewer } from '@/lib/financeAccess'
import { accusativeName } from '@/lib/czechNames'
import {
  canEditCar,
  carHasSeatFor,
  refOf,
  roomHasSpace,
  type CarRow,
  type RoomRow,
} from '@/lib/organizationEditing'
import {
  getOccupantNights,
  getOccupantParticipant,
  getTripNights,
  type Room,
} from '../utils/participantHelpers'
import {
  arrivalsOnNight,
  carOccupants,
  dayOnly,
  getBedAssignments,
  getTransportAssignments,
  getTripPhase,
  nightLabel,
  presentOnNight,
  sleepingCapacity,
  tonightNumber,
  transportDay,
  transportRiders,
} from '../utils/tripData'
import { AccentCard, PersonChip, Sheet, SheetHeading, StatStrip, StatusBadge } from './SheetUi'
import {
  CarForm,
  EditPanel,
  HereButton,
  InlineError,
  NightPicker,
  PickBar,
  RemoveButton,
  SeatDots,
  Toast,
  WhoPicker,
  ghostButtonClass,
  linkButtonClass,
  primaryButtonClass,
  useOrganizationEditor,
  type CarFormValue,
  type OrganizationAction,
} from './OrganizationEditing'

interface OrganizationViewProps {
  chata: Chata
  participants: Participant[]
  viewer?: FinanceViewer
  /** silent reload after an edit; without it the view stays read-only */
  onDataChanged?: () => Promise<void> | void
}

type SharedCar = NonNullable<Chata['sharedCars']>[number]
type Occupant = NonNullable<NonNullable<Room['beds']>[number]['occupants']>[number]

/** The picking mode: free places light up, the bar says what for. */
type PickMode =
  | {
      kind: 'bed'
      participantId: number
      /** per-night mode: the bed tapped, waiting for the nights */
      target: { roomId: string; bedId: string; roomName: string; bedName: string } | null
      nights: number[]
    }
  | { kind: 'seat'; participantId: number }

type CarFormState =
  | { kind: 'new'; driverId: number | null; organizer: boolean }
  | { kind: 'edit'; carId: string; organizer: boolean }

/** Organizer mode: the inline "Přidat sem" / "Posadit" panel. */
type OrgPanel =
  | { kind: 'bed'; roomId: string; bedId: string; who: number | null; nights: number[] }
  | { kind: 'seat'; carId: string; who: number | null }

interface CarSeat {
  car: SharedCar
  role: 'driver' | 'front' | 'back'
}

const noop = () => undefined

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

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function OrganizationView({
  chata,
  participants,
  viewer = anonymousViewer,
  onDataChanged,
}: OrganizationViewProps) {
  const t = useTranslations('trip')
  const o = useTranslations('trip.organization')
  const locale = useLocale() as AppLocale

  const hasBedrooms = chata.bedroomOrganizationEnabled === true
  const hasCars = chata.sharedCarsEnabled === true

  const phase = getTripPhase(chata)
  const totalNights = getTripNights(chata)
  const tonight = tonightNumber(chata)
  const rooms = useMemo(() => chata.rooms || [], [chata.rooms])
  const sharedCars = useMemo(() => chata.sharedCars || [], [chata.sharedCars])
  const capacity = sleepingCapacity(chata)
  const myIds = viewer.linkedParticipantIds

  const bedAssignments = useMemo(
    () => getBedAssignments(chata, participants),
    [chata, participants],
  )
  const transportAssignments = useMemo(() => getTransportAssignments(chata), [chata])
  // Public transport per direction: a ride BACK doesn't say how somebody
  // gets there, so only "tam" rides count as having a way to the chata
  const transportByDirection = useMemo(() => {
    const result = new Map<number, { there?: string; back?: string }>()
    for (const option of chata.publicTransportOptions || []) {
      for (const rider of transportRiders(option, participants)) {
        const entry = result.get(rider.id) ?? {}
        if (option.direction === 'zpet') entry.back ??= option.title
        else entry.there ??= option.title
        result.set(rider.id, entry)
      }
    }
    return result
  }, [chata.publicTransportOptions, participants])
  // participantId → their car and seat
  const carSeats = useMemo(() => {
    const result = new Map<number, CarSeat>()
    for (const car of sharedCars) {
      const { driver, front, back } = carOccupants(car, participants)
      if (driver && !result.has(driver.id)) result.set(driver.id, { car, role: 'driver' })
      if (front && !result.has(front.id)) result.set(front.id, { car, role: 'front' })
      for (const p of back) if (!result.has(p.id)) result.set(p.id, { car, role: 'back' })
    }
    return result
  }, [sharedCars, participants])
  // People riding public transport have a seat too — they don't belong in
  // the "no car yet" list.
  const withoutCar = useMemo(() => {
    if (!hasCars || sharedCars.length === 0) return []
    return participants.filter((p) => !carSeats.has(p.id) && !transportByDirection.get(p.id)?.there)
  }, [hasCars, sharedCars, participants, carSeats, transportByDirection])

  // the viewer's own participants, the account holder (first) leading
  const own = useMemo(() => participants.filter((p) => myIds.includes(p.id)), [participants, myIds])
  const selfId = own[0]?.id ?? null
  const byId = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants])

  // ── who may edit (the server checks the same rules) ──
  const bankerId = refOf(chata.banker)
  const isOrganizer =
    viewer.canViewAll || (bankerId != null && myIds.map(String).includes(bankerId))
  const canEdit =
    Boolean(onDataChanged) &&
    viewer.authenticated &&
    phase !== 'after' &&
    (own.length > 0 || isOrganizer)

  const editor = useOrganizationEditor(chata.id, onDataChanged ?? noop)
  const [pick, setPick] = useState<PickMode | null>(null)
  const [barError, setBarError] = useState<string | null>(null)
  const [carForm, setCarForm] = useState<CarFormState | null>(null)
  const [orgMode, setOrgMode] = useState(false)
  const [orgPanel, setOrgPanel] = useState<OrgPanel | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const roomsRef = useRef<HTMLDivElement | null>(null)
  const carsRef = useRef<HTMLDivElement | null>(null)
  const [scrollTarget, setScrollTarget] = useState<'rooms' | 'cars' | null>(null)

  useEffect(() => {
    if (!scrollTarget) return
    const node = scrollTarget === 'rooms' ? roomsRef.current : carsRef.current
    node?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    setScrollTarget(null)
  }, [scrollTarget])

  const perNight = chata.advancedBedroomMode === true && totalNights > 0
  const allNights = useMemo(
    () => Array.from({ length: totalNights }, (_, i) => i + 1),
    [totalNights],
  )
  const drivingIds = new Set(sharedCars.map((car) => refOf(car.driver)))
  const cancelPick = useCallback(() => {
    setPick(null)
    setBarError(null)
  }, [])

  const isSelf = (participantId: number) => participantId === selfId
  const nameOf = (participantId: number) => byId.get(participantId)?.name ?? ''
  const accusativeOf = (participantId: number) => {
    const p = byId.get(participantId)
    return p ? accusativeName(p, locale) : ''
  }
  const carNameDefault = (driverId: number | null) =>
    o('carNameDefault', { name: driverId != null ? nameOf(driverId) : '' }).trim()

  const save = async (
    body: OrganizationAction,
    onOk: () => void,
    onError: (message: string, taken: boolean) => void,
  ) => {
    const result = await editor.run(body)
    if (result.ok) onOk()
    else onError(result.message, result.taken)
  }

  // ── starting the modes ──
  const startBedPick = (participantId: number) => {
    setOrgMode(false)
    setOrgPanel(null)
    setCarForm(null)
    setBarError(null)
    setPick({ kind: 'bed', participantId, target: null, nights: allNights })
    setScrollTarget('rooms')
  }
  const startSeatPick = (participantId: number) => {
    setOrgMode(false)
    setOrgPanel(null)
    setCarForm(null)
    setBarError(null)
    setPick({ kind: 'seat', participantId })
    setScrollTarget('cars')
  }
  const openCarForm = (state: CarFormState) => {
    setPick(null)
    setPanelError(null)
    setCarForm(state)
    setScrollTarget('cars')
  }

  const placeInBed = (
    participantId: number,
    target: { roomId: string; bedId: string; roomName: string; bedName: string },
    nights: number[] | null,
  ) =>
    save(
      {
        action: 'bed.place',
        roomId: target.roomId,
        bedId: target.bedId,
        participantId,
        ...(nights && nights.length < totalNights ? { nights } : {}),
      },
      () => {
        setPick(null)
        setBarError(null)
        setToast(
          isSelf(participantId)
            ? o('toastBedSelf', { room: target.roomName, bed: target.bedName })
            : o('toastBedOther', {
                name: accusativeOf(participantId),
                room: target.roomName,
                bed: target.bedName,
              }),
        )
      },
      (message) => setBarError(message),
    )

  const takeSeat = (participantId: number, car: SharedCar, seat: 'front' | 'back') => {
    if (!car.id) return
    const driver = carOccupants(car, participants).driver
    return save(
      { action: 'car.seat', carId: car.id, participantId, seat },
      () => {
        setPick(null)
        setBarError(null)
        setToast(
          isSelf(participantId)
            ? o('toastSeatSelf', { driver: driver?.name ?? '' })
            : o('toastSeatOther', { name: nameOf(participantId), driver: driver?.name ?? '' }),
        )
      },
      (message) => setBarError(message),
    )
  }

  if (!hasBedrooms && !hasCars) {
    return (
      <Sheet>
        <div className="text-center py-8">
          <BedDouble className="mx-auto text-gray-300 dark:text-slate-600 mb-4" size={48} />
          <p className="text-gray-600 dark:text-slate-300 text-lg">{o('notAvailable')}</p>
        </div>
      </Sheet>
    )
  }

  // ── header strip ──
  const occupied = bedAssignments.size
  const statItems: Array<{ value: React.ReactNode; label: string }> = []
  if (hasBedrooms && rooms.length > 0) {
    statItems.push({ value: rooms.length, label: o('roomsCountLabel', { count: rooms.length }) })
    if (capacity > 0) {
      statItems.push({ value: `${occupied}/${capacity}`, label: o('placesTaken') })
    }
  }
  if (totalNights > 0) {
    statItems.push({ value: totalNights, label: o('nightsCountLabel', { count: totalNights }) })
  }
  if (hasCars && sharedCars.length > 0) {
    statItems.push({
      value: sharedCars.length,
      label:
        o('carsCountLabel', { count: sharedCars.length }) +
        ((chata.publicTransportOptions || []).length > 0 ? ` + ${o('trainSuffix')}` : ''),
    })
  }

  // ── "Tvoje místa": the personal hub ──
  const anyCarWithSeatFor = (participantId: number) =>
    sharedCars.some(
      (car) =>
        refOf(car.driver) !== String(participantId) &&
        carHasSeatFor(car as unknown as CarRow, participantId),
    )

  const hubRow = (participant: Participant) => {
    const self = isSelf(participant.id)
    const bed = bedAssignments.get(participant.id)
    const seat = carSeats.get(participant.id)
    const rides = transportByDirection.get(participant.id)
    const transport = seat ? undefined : rides?.there
    const showBeds = hasBedrooms && rooms.length > 0
    const label = 'w-24 shrink-0 text-[13px] text-gray-500 dark:text-slate-400 pt-2'

    const bedLine = showBeds && (
      <div className="flex gap-2">
        <span className={label}>{self ? o('hubSleepSelf') : o('hubSleepOther')}</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 py-1.5">
          {bed ? (
            <span className="text-[14px] text-gray-900 dark:text-gray-100">
              <strong className="font-semibold">{bed.roomName}</strong>, {bed.bedName}
              {bed.roommates.length > 0 && (
                <span className="text-gray-500 dark:text-slate-400">
                  , {o('togetherWith')} {bed.roommates.map((p) => p.name + petSuffix(p)).join(', ')}
                </span>
              )}
            </span>
          ) : (
            <span className="text-[14px] text-gray-500 dark:text-slate-400">
              {self ? o('notYetSelf') : o('notYetOther')}
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              disabled={editor.saving}
              onClick={() => startBedPick(participant.id)}
              className={linkButtonClass}
            >
              {bed ? o('change') : o('pickBed')}
            </button>
          )}
        </div>
      </div>
    )

    let travel: React.ReactNode = null
    if (seat) {
      const driver = carOccupants(seat.car, participants).driver
      if (seat.role === 'driver') {
        const taken = (() => {
          const { front, back } = carOccupants(seat.car, participants)
          return 1 + (front ? 1 : 0) + back.length
        })()
        const free = seat.car.seats != null ? Math.max(0, seat.car.seats - taken) : 0
        travel = (
          <>
            <span className="text-[14px] text-gray-900 dark:text-gray-100">
              {self ? o('driverSelf', { count: free }) : o('driverOther', { count: free })}
            </span>
            {canEdit && seat.car.id && (
              <button
                type="button"
                onClick={() => openCarForm({ kind: 'edit', carId: seat.car.id!, organizer: false })}
                className={linkButtonClass}
              >
                {o('editCar')}
              </button>
            )}
          </>
        )
      } else {
        const front = seat.role === 'front'
        travel = (
          <>
            <span className="text-[14px] text-gray-900 dark:text-gray-100">
              {o(
                self
                  ? front
                    ? 'passengerFrontSelf'
                    : 'passengerSelf'
                  : front
                    ? 'passengerFrontOther'
                    : 'passengerOther',
                { driver: driver?.name ?? '' },
              )}
            </span>
            {canEdit && (
              <button
                type="button"
                disabled={editor.saving}
                onClick={() =>
                  void save(
                    { action: 'car.leave', participantId: participant.id },
                    () => setToast(o('toastLeftCar')),
                    (message) => setToast(message),
                  )
                }
                className={linkButtonClass}
              >
                {o('leaveCar')}
              </button>
            )}
          </>
        )
      }
    } else if (transport) {
      travel = (
        <span className="text-[14px] text-gray-900 dark:text-gray-100">
          <strong className="font-semibold">{transport}</strong>
          <span className="text-gray-500 dark:text-slate-400"> · {o('ptRideNote')}</span>
        </span>
      )
    } else {
      const canRide = canEdit && anyCarWithSeatFor(participant.id)
      const canDrive = canEdit && self && !drivingIds.has(String(participant.id))
      travel = (
        <>
          <span className="text-[14px] text-gray-500 dark:text-slate-400">
            {self ? o('notYetSelf') : o('notYetOther')}
          </span>
          {canRide && (
            <button
              type="button"
              onClick={() => startSeatPick(participant.id)}
              className={linkButtonClass}
            >
              {self ? o('rideAlongSelf') : o('rideAlongOther')}
            </button>
          )}
          {canDrive && (
            <button
              type="button"
              onClick={() =>
                openCarForm({ kind: 'new', driverId: participant.id, organizer: false })
              }
              className={linkButtonClass}
            >
              {o('iDrive')}
            </button>
          )}
        </>
      )
    }
    const travelLine = (hasCars || seat || transport || rides?.back) && (
      <div className="flex gap-2">
        <span className={label}>{self ? o('hubTravelSelf') : o('hubTravelOther')}</span>
        <div className="flex min-w-0 flex-1 flex-col py-1.5">
          <div className="flex flex-wrap items-center gap-x-1">{travel}</div>
          {rides?.back && (
            <div className="mt-0.5 text-[13px] text-gray-500 dark:text-slate-400">
              {o('travelBack', { title: rides.back })}
            </div>
          )}
        </div>
      </div>
    )

    return (
      <div key={participant.id} className="flex flex-col">
        {own.length > 1 && (
          <div className="text-[13px] font-semibold text-gray-800 dark:text-slate-200">
            {participant.name}
            {self && ` ${o('youSuffix')}`}
          </div>
        )}
        {bedLine}
        {travelLine}
      </div>
    )
  }

  const hubHasContent = own.some(
    (p) => bedAssignments.has(p.id) || carSeats.has(p.id) || transportAssignments.has(p.id),
  )
  const hub =
    own.length > 0 && (canEdit || hubHasContent) ? (
      <AccentCard label={o('yourPlaces')} className="mt-4">
        <div className="flex flex-col gap-3 divide-y divide-primary/15">
          {own.map((p) => (
            <div key={p.id} className="pt-1 first:pt-0">
              {hubRow(p)}
            </div>
          ))}
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
          {o('tonightTitle', {
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
              {o('tonightArrives', {
                names: arrivingToday.map((p) => p.name + petSuffix(p)).join(', '),
              })}
            </span>
          )}
        </div>
      </div>
    ) : null

  // the quiet organizer switch in the section headings
  const orgToggle =
    canEdit && isOrganizer ? (
      <button
        type="button"
        aria-pressed={orgMode}
        onClick={() => {
          setPick(null)
          setOrgPanel(null)
          setPanelError(null)
          setOrgMode((on) => !on)
        }}
        className="inline-flex min-h-8 items-center rounded-full px-2.5 text-xs font-semibold text-primary-dark hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:text-primary-light"
      >
        {orgMode ? o('orgDone') : o('orgEdit')}
      </button>
    ) : null

  const orgRemove = (participant: Participant, action: OrganizationAction, onDark: boolean) =>
    orgMode ? (
      <RemoveButton
        label={o('orgRemove', { name: participant.name })}
        onDark={onDark}
        disabled={editor.saving}
        onClick={() =>
          void save(
            action,
            () => setToast(o('toastRemoved', { name: participant.name })),
            (message) => setToast(message),
          )
        }
      />
    ) : null

  // ── occupant chip with optional partial-stay suffix ──
  const occupantChip = (occupant: Occupant, key: React.Key, faded: boolean) => {
    const participant = getOccupantParticipant(occupant)
    if (!participant) return null
    const isMine = myIds.includes(participant.id)
    const occupantNights = getOccupantNights(occupant)
    const rangeLabel =
      occupantNights !== null && totalNights > 0 && occupantNights.length < totalNights
        ? (nightsRangeLabel(chata, occupantNights, locale) ??
          o('nightsShort', { count: occupantNights.length }))
        : null
    return (
      <span key={key} className={faded ? 'opacity-60' : undefined}>
        <PersonChip highlight={isMine}>
          {participant.name}
          {petSuffix(participant)}
          {isMine && ` ${o('youSuffix')}`}
          {rangeLabel && (
            <span
              className={isMine ? 'text-white/80' : 'text-primary-dark dark:text-primary-light'}
            >
              {' '}
              · {rangeLabel}
            </span>
          )}
          {orgRemove(participant, { action: 'bed.leave', participantId: participant.id }, isMine)}
        </PersonChip>
      </span>
    )
  }

  // ── rooms ──
  const bedPick = pick?.kind === 'bed' ? pick : null
  const roomsSection =
    hasBedrooms && rooms.length > 0 ? (
      <div ref={roomsRef} className="scroll-mt-4">
        <SheetHeading icon={BedDouble} title={o('roomsTitle')} aside={orgToggle} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
          {rooms.map((room, roomIdx) => {
            const image = room.image as Media | null
            const occupantCount = roomOccupantCount(room)
            const max = room.maxSleepingSpaces || 0
            const isMyRoom = own.some((p) => bedAssignments.get(p.id)?.roomName === room.name)
            const free = Math.max(0, max - occupantCount)
            const roomRow = room as unknown as RoomRow
            const partialOccupants = (room.beds || [])
              .flatMap((bed) => bed.occupants || [])
              .filter((occupant) => {
                const nightsList = getOccupantNights(occupant)
                return nightsList !== null && totalNights > 0 && nightsList.length < totalNights
              })
            // picking: does the chosen person fit here (any night in per-night mode)?
            const spaceFor = (participantId: number) =>
              perNight
                ? allNights.some((n) => roomHasSpace(roomRow, participantId, [n], totalNights))
                : roomHasSpace(roomRow, participantId, null, totalNights)
            const pickable = bedPick != null && Boolean(room.id) && spaceFor(bedPick.participantId)
            const orgPlaceable = orgMode && Boolean(room.id) && (perNight || max === 0 || free > 0)

            return (
              <div
                key={room.id || roomIdx}
                className={`rounded-2xl overflow-hidden border transition-opacity motion-reduce:transition-none ${
                  isMyRoom
                    ? 'border-2 border-primary/40'
                    : pickable
                      ? 'border-2 border-primary/60'
                      : 'border-gray-200 dark:border-white/[0.08]'
                } bg-white dark:bg-white/[0.02] ${bedPick && !pickable ? 'opacity-45' : ''}`}
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
                          {o('yourRoomNote')}
                        </span>
                      )}
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    {(room.beds || []).map((bed, bedIdx) => {
                      const occupants = (bed.occupants || []).filter((oc) =>
                        getOccupantParticipant(oc),
                      )
                      // Archived trips don't advertise free places (design rule)
                      if (occupants.length === 0 && phase === 'after') return null
                      const inThisBed = new Set(
                        occupants.map((oc) => getOccupantParticipant(oc)?.id),
                      )
                      const target =
                        room.id && bed.id
                          ? {
                              roomId: room.id,
                              bedId: bed.id,
                              roomName: room.name,
                              bedName: bed.name,
                            }
                          : null
                      // whole stay: nothing to pick where you already sleep
                      const showHere =
                        pickable &&
                        target != null &&
                        (perNight || !inThisBed.has(bedPick!.participantId))
                      const panelOpen =
                        orgPanel?.kind === 'bed' &&
                        orgPanel.roomId === room.id &&
                        orgPanel.bedId === bed.id
                      const orgCandidates = participants.filter(
                        (p) => perNight || !inThisBed.has(p.id),
                      )
                      return (
                        <div
                          key={bed.id || bedIdx}
                          className="rounded-lg bg-gray-50 dark:bg-white/[0.03] px-2.5 py-2"
                        >
                          <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-gray-500 dark:text-slate-400 mb-1.5">
                            {bed.name}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {occupants.map((occupant, i) =>
                              occupantChip(occupant, occupant.id || i, bedPick != null),
                            )}
                            {showHere ? (
                              <HereButton
                                disabled={editor.saving}
                                label={`${o('here')}: ${room.name}, ${bed.name}`}
                                onClick={() => {
                                  setBarError(null)
                                  if (perNight) {
                                    setPick({ ...bedPick!, target: target! })
                                  } else {
                                    void placeInBed(bedPick!.participantId, target!, null)
                                  }
                                }}
                              >
                                {o('here')}
                              </HereButton>
                            ) : orgPlaceable && target && !panelOpen ? (
                              <button
                                type="button"
                                disabled={editor.saving}
                                onClick={() => {
                                  setPanelError(null)
                                  setOrgPanel({
                                    kind: 'bed',
                                    roomId: target.roomId,
                                    bedId: target.bedId,
                                    who: orgCandidates[0]?.id ?? null,
                                    nights: allNights,
                                  })
                                }}
                                className={`${ghostButtonClass} border border-dashed border-primary/50 text-primary-dark dark:text-primary-light`}
                              >
                                {o('orgPlace')}
                              </button>
                            ) : (
                              occupants.length === 0 && (
                                <PersonChip dashed>{o('freeSpot')}</PersonChip>
                              )
                            )}
                          </div>
                          {panelOpen && orgPanel?.kind === 'bed' && target && (
                            <EditPanel>
                              <WhoPicker
                                label={o('pickWho')}
                                candidates={orgCandidates}
                                selectedId={orgPanel.who}
                                onSelect={(id) => setOrgPanel({ ...orgPanel, who: id })}
                                ownIds={myIds}
                                youSuffix={o('youSuffix')}
                              />
                              {perNight && (
                                <NightPicker
                                  label={o('nightsQuestion')}
                                  totalNights={totalNights}
                                  selected={orgPanel.nights}
                                  onChange={(nights) => setOrgPanel({ ...orgPanel, nights })}
                                  nightLabel={(night) => nightLabel(chata, night, locale)}
                                />
                              )}
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={editor.saving || orgPanel.who == null}
                                  onClick={() => {
                                    if (orgPanel.who == null) return
                                    const who = orgPanel.who
                                    void save(
                                      {
                                        action: 'bed.place',
                                        roomId: target.roomId,
                                        bedId: target.bedId,
                                        participantId: who,
                                        ...(perNight && orgPanel.nights.length < totalNights
                                          ? { nights: orgPanel.nights }
                                          : {}),
                                      },
                                      () => {
                                        setOrgPanel(null)
                                        setToast(
                                          o('toastBedOther', {
                                            name: accusativeOf(who),
                                            room: target.roomName,
                                            bed: target.bedName,
                                          }),
                                        )
                                      },
                                      (message) => setPanelError(message),
                                    )
                                  }}
                                  className={primaryButtonClass}
                                >
                                  {editor.saving ? o('saving') : o('save')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOrgPanel(null)}
                                  className={ghostButtonClass}
                                >
                                  {o('cancel')}
                                </button>
                              </div>
                              <InlineError message={panelError} />
                            </EditPanel>
                          )}
                        </div>
                      )
                    })}
                    {free > 0 && phase !== 'after' && occupantCount > 0 && !bedPick && (
                      <div className="flex">
                        <PersonChip dashed>{o('freePlaces', { count: free })}</PersonChip>
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
  const seatPick = pick?.kind === 'seat' ? pick : null
  const carFormValue = (car: SharedCar): CarFormValue => ({
    name: car.name,
    seats: car.seats ?? 4,
    description: car.description ?? undefined,
    equipment: (car.equipment || []).map((item) => item.name),
  })
  const notDriving = participants.filter((p) => !drivingIds.has(String(p.id)))

  const carFormBlock = (state: CarFormState, car?: SharedCar) => {
    const driverId = car ? Number(refOf(car.driver)) : state.kind === 'new' ? state.driverId : null
    const withdraw = car?.id
      ? () =>
          void save(
            { action: 'car.remove', carId: car.id! },
            () => {
              setCarForm(null)
              setToast(o('toastCarRemoved'))
            },
            (message) => setPanelError(message),
          )
      : undefined
    return (
      <CarForm
        key={state.kind === 'edit' ? state.carId : `new-${driverId}`}
        mode={state.kind}
        initial={car ? carFormValue(car) : undefined}
        drivers={state.kind === 'new' && state.organizer ? notDriving : undefined}
        ownIds={myIds}
        defaultDriverId={driverId ?? notDriving[0]?.id ?? null}
        defaultNameFor={carNameDefault}
        showName={state.organizer}
        saving={editor.saving}
        error={panelError}
        onCancel={() => {
          setCarForm(null)
          setPanelError(null)
        }}
        onWithdraw={withdraw}
        forSomeoneElse={
          state.organizer && (state.kind === 'new' || (driverId != null && !isSelf(driverId)))
        }
        withdrawLabel={
          state.organizer && driverId != null && !isSelf(driverId) ? o('removeCar') : undefined
        }
        onSubmit={(value, chosenDriver) => {
          if (state.kind === 'edit') {
            void save(
              { action: 'car.update', carId: state.carId, car: value },
              () => {
                setCarForm(null)
                setToast(o('toastCarSaved'))
              },
              (message) => setPanelError(message),
            )
          } else if (chosenDriver != null) {
            void save(
              { action: 'car.offer', driverId: chosenDriver, car: value },
              () => {
                setCarForm(null)
                setToast(o('toastCarOffered'))
              },
              (message) => setPanelError(message),
            )
          }
        }}
      />
    )
  }

  const carsSection =
    hasCars && (sharedCars.length > 0 || canEdit) ? (
      <div ref={carsRef} className="scroll-mt-4">
        <SheetHeading
          icon={Car}
          title={o('sharedCarsTitle')}
          aside={
            <span className="inline-flex flex-wrap items-center justify-end gap-2">
              {withoutCar.length > 0 && (chata.publicTransportOptions || []).length > 0 && (
                <span>
                  {o('trainRidersNote', { names: withoutCar.map((p) => p.name).join(', ') })}
                </span>
              )}
              {orgToggle}
            </span>
          }
        />
        {carForm?.kind === 'new' && <div className="mb-4 max-w-md">{carFormBlock(carForm)}</div>}
        {sharedCars.length === 0 && carForm?.kind !== 'new' && (
          <p className="text-[13px] text-gray-500 dark:text-slate-400 mb-3">{o('noCarsYet')}</p>
        )}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
          {sharedCars.map((car: SharedCar, carIdx) => {
            const { driver, front, back } = carOccupants(car, participants)
            const taken = (driver ? 1 : 0) + (front ? 1 : 0) + back.length
            const seats = car.seats ?? null
            const isMyCar = own.some((p) => carSeats.get(p.id)?.car === car)
            const carRow = car as unknown as CarRow

            if (carForm?.kind === 'edit' && carForm.carId === car.id) {
              return <div key={car.id}>{carFormBlock(carForm, car)}</div>
            }

            // riding mode: a free seat for the chosen person?
            const pickable =
              seatPick != null &&
              Boolean(car.id) &&
              refOf(car.driver) !== String(seatPick.participantId) &&
              carHasSeatFor(carRow, seatPick.participantId)
            const frontFree = front == null || front.id === seatPick?.participantId
            const sitsHere = seatPick != null && back.some((p) => p.id === seatPick.participantId)
            const editable = orgMode && Boolean(car.id) && canEditCar(carRow, myIds, isOrganizer)
            const panelOpen = orgPanel?.kind === 'seat' && orgPanel.carId === car.id
            const orgCandidates = participants.filter(
              (p) =>
                !drivingIds.has(String(p.id)) &&
                p.id !== front?.id &&
                !back.some((b) => b.id === p.id),
            )
            const customName = driver != null && car.name !== carNameDefault(driver.id)

            const personName = (participant: Participant, withRemove: boolean) => {
              const isMine = myIds.includes(participant.id)
              return (
                <span key={participant.id} className="inline-flex items-center">
                  <span
                    className={
                      isMine ? 'font-semibold text-primary-dark dark:text-primary-light' : undefined
                    }
                  >
                    {participant.name}
                    {petSuffix(participant)}
                    {isMine && ` ${o('youSuffix')}`}
                  </span>
                  {withRemove &&
                    orgRemove(
                      participant,
                      { action: 'car.leave', participantId: participant.id },
                      false,
                    )}
                </span>
              )
            }

            return (
              <div
                key={car.id || carIdx}
                className={`rounded-2xl border transition-opacity motion-reduce:transition-none ${
                  isMyCar
                    ? 'border-2 border-primary/40'
                    : pickable
                      ? 'border-2 border-primary/60'
                      : 'border-gray-200 dark:border-white/[0.08]'
                } bg-white dark:bg-white/[0.02] px-4 py-3.5 ${seatPick && !pickable ? 'opacity-45' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="font-serif text-[16px] text-gray-900 dark:text-gray-100">
                    {driver ? o('driverHeadline', { name: driver.name }) : car.name}
                  </strong>
                  {seats != null ? (
                    <SeatDots
                      taken={taken}
                      seats={seats}
                      label={o('seatsAria', { taken, seats })}
                    />
                  ) : (
                    <StatusBadge tone="gray">{taken}</StatusBadge>
                  )}
                </div>
                {customName && (
                  <div className="text-xs text-gray-500 dark:text-slate-400">{car.name}</div>
                )}
                {car.description && (
                  <p className="text-[13px] text-gray-600 dark:text-slate-300 leading-relaxed m-0 mt-1.5 whitespace-pre-line">
                    {o('departs', { note: car.description })}
                  </p>
                )}
                <div className="mt-2 flex flex-col gap-1 text-[13px]">
                  {front && (
                    <div className="flex gap-2.5">
                      <span className="w-14 shrink-0 text-gray-400 dark:text-slate-500">
                        {o('frontSeat')}
                      </span>
                      <span className="text-gray-700 dark:text-slate-300">
                        {personName(front, true)}
                      </span>
                    </div>
                  )}
                  {back.length > 0 && (
                    <div className="flex gap-2.5">
                      <span className="w-14 shrink-0 text-gray-400 dark:text-slate-500">
                        {o('backSeat')}
                      </span>
                      <span className="flex flex-wrap gap-x-1 text-gray-700 dark:text-slate-300">
                        {back.map((p, i) => (
                          <span key={p.id} className="inline-flex items-center">
                            {i > 0 && ', '}
                            {personName(p, true)}
                          </span>
                        ))}
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

                {/* riding mode: back seat, or the front when it's free */}
                {pickable && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!sitsHere && (
                      <HereButton
                        disabled={editor.saving}
                        onClick={() => void takeSeat(seatPick!.participantId, car, 'back')}
                      >
                        {o('backHere')}
                      </HereButton>
                    )}
                    {frontFree && front?.id !== seatPick!.participantId && (
                      <HereButton
                        disabled={editor.saving}
                        onClick={() => void takeSeat(seatPick!.participantId, car, 'front')}
                      >
                        {o('frontHere')}
                      </HereButton>
                    )}
                  </div>
                )}

                {/* organizer mode: seat anybody, edit or withdraw any car */}
                {orgMode && car.id && !panelOpen && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(seats == null || taken < seats) && orgCandidates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPanelError(null)
                          setOrgPanel({ kind: 'seat', carId: car.id!, who: orgCandidates[0].id })
                        }}
                        className={`${ghostButtonClass} border border-dashed border-primary/50 text-primary-dark dark:text-primary-light`}
                      >
                        {o('orgSeat')}
                      </button>
                    )}
                    {editable && (
                      <button
                        type="button"
                        onClick={() =>
                          openCarForm({ kind: 'edit', carId: car.id!, organizer: true })
                        }
                        className={ghostButtonClass}
                      >
                        {o('editCar')}
                      </button>
                    )}
                  </div>
                )}
                {panelOpen && orgPanel?.kind === 'seat' && (
                  <EditPanel>
                    <WhoPicker
                      label={o('pickWho')}
                      candidates={orgCandidates}
                      selectedId={orgPanel.who}
                      onSelect={(id) => setOrgPanel({ ...orgPanel, who: id })}
                      ownIds={myIds}
                      youSuffix={o('youSuffix')}
                    />
                    <div className="flex flex-wrap gap-2">
                      {(['back', 'front'] as const)
                        .filter((seat) => seat === 'back' || front == null)
                        .map((seat) => (
                          <button
                            key={seat}
                            type="button"
                            disabled={editor.saving || orgPanel.who == null}
                            onClick={() => {
                              if (orgPanel.who == null || !car.id) return
                              const who = orgPanel.who
                              void save(
                                { action: 'car.seat', carId: car.id, participantId: who, seat },
                                () => {
                                  setOrgPanel(null)
                                  setToast(
                                    o('toastSeatOther', {
                                      name: nameOf(who),
                                      driver: driver?.name ?? '',
                                    }),
                                  )
                                },
                                (message) => setPanelError(message),
                              )
                            }}
                            className={primaryButtonClass}
                          >
                            {seat === 'front' ? o('frontHere') : o('backSeat')}
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => setOrgPanel(null)}
                        className={ghostButtonClass}
                      >
                        {o('cancel')}
                      </button>
                    </div>
                    <InlineError message={panelError} />
                  </EditPanel>
                )}
              </div>
            )
          })}
        </div>
        {orgMode && notDriving.length > 0 && carForm == null && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() =>
                openCarForm({ kind: 'new', driverId: notDriving[0]?.id ?? null, organizer: true })
              }
              className={`${ghostButtonClass} border border-dashed border-primary/50 text-primary-dark dark:text-primary-light`}
            >
              {o('orgAddCar')}
            </button>
          </div>
        )}
        {withoutCar.length > 0 && (chata.publicTransportOptions || []).length === 0 && (
          <div className="text-[13px] text-gray-500 dark:text-slate-400 mt-3">
            {o('withoutCarNote', { names: withoutCar.map((p) => p.name).join(', ') })}
          </div>
        )}
      </div>
    ) : null

  // ── public transport ("kdo jede vlakem") ──
  const ptDayLabel = (dateString: string | null | undefined): string | null => {
    if (!dateString) return null
    const d = dayOnly(dateString)
    const weekday = new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
      weekday: 'short',
    })
      .format(d)
      .replace('.', '')
    return locale === 'cs'
      ? `${weekday} ${d.getDate()}. ${d.getMonth() + 1}.`
      : `${weekday} ${d.getDate()}/${d.getMonth() + 1}`
  }

  const ptOptions = (chata.publicTransportOptions || [])
    .map((option) => ({ option, riders: transportRiders(option, participants) }))
    .filter(({ riders }) => riders.length > 0)

  const ptSection =
    ptOptions.length > 0 ? (
      <div>
        <SheetHeading icon={TrainFront} title={o('ptTitle')} aside={o('ptDetailNote')} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
          {ptOptions.map(({ option, riders }, idx) => {
            const connections = option.connections || []
            const firstDeparture = connections[0]?.departure
            const lastArrival = connections[connections.length - 1]?.arrival
            const isBack = option.direction === 'zpet'
            // tentative dates: the window bounds are not travel days
            const day = ptDayLabel(transportDay(chata, option))
            const isMyRide = riders.some((p) => myIds.includes(p.id))
            const whenBits = [
              day,
              firstDeparture && lastArrival ? `${firstDeparture} → ${lastArrival}` : null,
              option.totalDuration || null,
            ].filter(Boolean)
            return (
              <div
                key={option.id || idx}
                className={`rounded-2xl border ${
                  isMyRide
                    ? 'border-2 border-primary/40'
                    : 'border-gray-200 dark:border-white/[0.08]'
                } bg-white dark:bg-white/[0.02] px-4 py-3.5`}
              >
                <div className="flex justify-between items-baseline gap-2 mb-1">
                  <strong className="font-serif text-[16px] text-gray-900 dark:text-gray-100">
                    {option.title}
                  </strong>
                  <StatusBadge tone="gray">
                    {isBack ? o('directionBack') : o('directionThere')}
                  </StatusBadge>
                </div>
                {whenBits.length > 0 && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed m-0 mb-2.5 tabular-nums">
                    {whenBits.join(' · ')}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {riders.map((p) => (
                    <PersonChip key={p.id} highlight={myIds.includes(p.id)}>
                      {p.name}
                      {petSuffix(p)}
                      {myIds.includes(p.id) && ` ${o('youSuffix')}`}
                    </PersonChip>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    ) : null

  // ── the sticky bar of the picking modes ──
  let bar: React.ReactNode = null
  if (bedPick) {
    const pid = bedPick.participantId
    const title = bedPick.target
      ? o('nightsQuestion')
      : isSelf(pid)
        ? o('barBedSelf')
        : o('barBedOther', { name: accusativeOf(pid) })
    bar = (
      <PickBar title={title} error={barError} onCancel={cancelPick}>
        {bedPick.target && (
          <div className="flex flex-col gap-2.5">
            <NightPicker
              label={`${bedPick.target.roomName}, ${bedPick.target.bedName}`}
              totalNights={totalNights}
              selected={bedPick.nights}
              onChange={(nights) => setPick({ ...bedPick, nights })}
              nightLabel={(night) => nightLabel(chata, night, locale)}
              onDark
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={editor.saving}
                onClick={() => void placeInBed(pid, bedPick.target!, bedPick.nights)}
                className={primaryButtonClass}
              >
                {editor.saving ? o('saving') : o('done')}
              </button>
            </div>
          </div>
        )}
      </PickBar>
    )
  } else if (seatPick) {
    const pid = seatPick.participantId
    bar = (
      <PickBar
        title={isSelf(pid) ? o('barSeatSelf') : o('barSeatOther', { name: accusativeOf(pid) })}
        error={barError}
        onCancel={cancelPick}
      />
    )
  }

  return (
    <Sheet>
      {statItems.length > 0 && <StatStrip items={statItems} />}
      {hub}
      {tonightBox}
      {roomsSection}
      {carsSection}
      {ptSection}
      {/* room under the sticky bar so it never covers the last card */}
      {bar && <div aria-hidden="true" className="h-36" />}
      {bar}
      {!bar && <Toast message={toast} onDone={clearToast} />}
    </Sheet>
  )
}
