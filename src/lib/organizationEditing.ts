// Frontend editing of "Organizace" (beds and shared cars) — the pure rules
// behind POST /api/chatas/:id/organization (src/collections/Chatas/
// organizationEndpoints.ts) and the inline controls in OrganizationView.
//
// Who may move whom: a signed-in participant places and moves their OWN
// participants (a parent and a child); the banker and chata admins
// ("organizers") move anybody. Rooms and beds stay admin-defined; cars may
// be offered by any participant, who then drives them.
//
// The operations take the chata's arrays as stored (depth 0 — relations are
// ids) and return new arrays; unknown row fields are carried through, so a
// room keeps its image and description. A person sleeps in one bed per
// night and sits in one car: placing them somewhere moves them.

export type Id = number | string

export interface OccupantRow {
  id?: string | null
  participant: Id | { id: Id }
  /** 1-based night numbers; null/empty = the whole stay */
  nights?: unknown
  [key: string]: unknown
}

export interface BedRow {
  id?: string | null
  name: string
  occupants?: OccupantRow[] | null
  [key: string]: unknown
}

export interface RoomRow {
  id?: string | null
  name: string
  maxSleepingSpaces: number
  beds?: BedRow[] | null
  [key: string]: unknown
}

export interface PassengerRow {
  id?: string | null
  participant: Id | { id: Id }
  [key: string]: unknown
}

export interface CarRow {
  id?: string | null
  name: string
  description?: string | null
  seats?: number | null
  driver: Id | { id: Id }
  frontPassenger?: Id | { id: Id } | null
  passengers?: PassengerRow[] | null
  equipment?: { id?: string | null; name: string }[] | null
  [key: string]: unknown
}

export type OrganizationError =
  | 'not-found'
  | 'forbidden'
  | 'room-full'
  | 'car-full'
  | 'front-taken'
  | 'is-driver'
  | 'already-driving'
  | 'seats-too-few'
  | 'invalid-car'

export type Result<T> = { ok: true; value: T } | { ok: false; error: OrganizationError }

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T>(error: OrganizationError): Result<T> => ({ ok: false, error })

export const refOf = (value: unknown): string | null =>
  value == null
    ? null
    : typeof value === 'object'
      ? String((value as { id: unknown }).id)
      : String(value)

// ─── permissions ─────────────────────────────────────────────────────────

/** May this viewer place, move or remove `participantId`? */
export function canMoveParticipant(args: {
  participantId: Id
  ownParticipantIds: Id[]
  isOrganizer: boolean
}): boolean {
  if (args.isOrganizer) return true
  return args.ownParticipantIds.map(String).includes(String(args.participantId))
}

/** May this viewer edit or withdraw a car? Its driver's account or an organizer. */
export function canEditCar(car: CarRow, ownParticipantIds: Id[], isOrganizer: boolean): boolean {
  return isOrganizer || ownParticipantIds.map(String).includes(refOf(car.driver) ?? '')
}

// ─── beds ────────────────────────────────────────────────────────────────

/** Valid 1-based nights, sorted and unique; null = the whole stay. */
export function normalizeNights(value: unknown, totalNights: number): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const nights = [...new Set(value.map(Number))]
    .filter((n) => Number.isInteger(n) && n >= 1 && (totalNights <= 0 || n <= totalNights))
    .sort((a, b) => a - b)
  if (nights.length === 0) return null
  return totalNights > 0 && nights.length >= totalNights ? null : nights
}

const allNights = (totalNights: number) => Array.from({ length: totalNights }, (_, i) => i + 1)

/** The nights an occupant row covers (whole stay expanded when known). */
function nightsOf(occupant: OccupantRow, totalNights: number): number[] | null {
  const nights = normalizeNights(occupant.nights, totalNights)
  return nights ?? (totalNights > 0 ? allNights(totalNights) : null)
}

/**
 * Take `participantId` out of every bed — in per-night mode only for the
 * given nights (their other nights elsewhere stay). Rows left with no
 * night are dropped.
 */
export function removeFromBeds(
  rooms: RoomRow[],
  participantId: Id,
  nights: number[] | null = null,
  totalNights = 0,
): RoomRow[] {
  const target = String(participantId)
  return rooms.map((room) => ({
    ...room,
    beds: (room.beds ?? []).map((bed) => ({
      ...bed,
      occupants: (bed.occupants ?? []).flatMap((occupant) => {
        if (refOf(occupant.participant) !== target) return [occupant]
        if (nights == null) return []
        const current = nightsOf(occupant, totalNights)
        if (current == null) return []
        const left = current.filter((n) => !nights.includes(n))
        if (left.length === 0) return []
        return [{ ...occupant, nights: normalizeNights(left, totalNights) }]
      }),
    })),
  }))
}

/**
 * Put `participantId` into a bed. Whole-stay mode (`perNight` false) moves
 * them out of any other bed; per-night mode moves only the chosen nights.
 * The room's maxSleepingSpaces is the limit, checked per night.
 */
export function placeInBed(
  rooms: RoomRow[],
  args: {
    roomId: string
    bedId: string
    participantId: Id
    perNight: boolean
    totalNights: number
    nights?: unknown
  },
): Result<RoomRow[]> {
  const room = rooms.find((r) => r.id === args.roomId)
  const bed = room?.beds?.find((b) => b.id === args.bedId)
  if (!room || !bed) return fail('not-found')

  // per-night mode with no (valid) nights picked means the whole stay
  const wanted = args.perNight ? normalizeNights(args.nights, args.totalNights) : null
  const cleared = removeFromBeds(rooms, args.participantId, wanted, args.totalNights)
  const clearedRoom = cleared.find((r) => r.id === args.roomId)!

  // capacity per night (or overall when the stay length is unknown)
  const max = Number(room.maxSleepingSpaces) || 0
  if (max > 0) {
    const occupants = (clearedRoom.beds ?? []).flatMap((b) => b.occupants ?? [])
    const checkNights = wanted ?? (args.totalNights > 0 ? allNights(args.totalNights) : null)
    if (checkNights == null) {
      if (occupants.length >= max) return fail('room-full')
    } else {
      for (const night of checkNights) {
        const present = occupants.filter((o) => {
          const n = nightsOf(o, args.totalNights)
          return n == null || n.includes(night)
        }).length
        if (present >= max) return fail('room-full')
      }
    }
  }

  return ok(
    cleared.map((r) =>
      r.id !== args.roomId
        ? r
        : {
            ...r,
            beds: (r.beds ?? []).map((b) =>
              b.id !== args.bedId
                ? b
                : {
                    ...b,
                    occupants: addOccupant(
                      b.occupants ?? [],
                      args.participantId,
                      wanted,
                      args.totalNights,
                    ),
                  },
            ),
          },
    ),
  )
}

/**
 * Would `participantId` fit into this room? The same per-night count as
 * placeInBed, without the person themselves (moving inside a room is fine).
 * `nights` null = the whole stay. The UI uses it to offer "Sem" only where
 * the server will say yes.
 */
export function roomHasSpace(
  room: RoomRow,
  participantId: Id,
  nights: number[] | null,
  totalNights: number,
): boolean {
  const max = Number(room.maxSleepingSpaces) || 0
  if (max <= 0) return true
  const target = String(participantId)
  const others = (room.beds ?? [])
    .flatMap((b) => b.occupants ?? [])
    .filter((o) => refOf(o.participant) !== target)
  const checkNights = nights ?? (totalNights > 0 ? allNights(totalNights) : null)
  if (checkNights == null) return others.length < max
  return checkNights.every(
    (night) =>
      others.filter((o) => {
        const n = nightsOf(o, totalNights)
        return n == null || n.includes(night)
      }).length < max,
  )
}

/**
 * Add a person to a bed's occupants. If they already sleep in this bed on
 * other nights (per-night mode), their nights merge into that one row
 * instead of a second chip appearing for the same person.
 */
function addOccupant(
  occupants: OccupantRow[],
  participantId: Id,
  nights: number[] | null,
  totalNights: number,
): OccupantRow[] {
  const target = String(participantId)
  const existing = occupants.find((o) => refOf(o.participant) === target)
  if (!existing) return [...occupants, { participant: Number(participantId), nights }]
  const current = nightsOf(existing, totalNights)
  const merged =
    nights == null || current == null ? null : normalizeNights([...current, ...nights], totalNights)
  return occupants.map((o) => (o === existing ? { ...o, nights: merged } : o))
}

// ─── cars ────────────────────────────────────────────────────────────────

/** Everybody in a car, driver included. */
export function carOccupantIds(car: CarRow): string[] {
  return [
    refOf(car.driver),
    refOf(car.frontPassenger),
    ...(car.passengers ?? []).map((p) => refOf(p.participant)),
  ].filter((id): id is string => id != null)
}

/** Is there a seat for `participantId` (not counting their current seat here)? */
export function carHasSeatFor(car: CarRow, participantId: Id): boolean {
  if (car.seats == null) return true
  const others = carOccupantIds(car).filter((id) => id !== String(participantId))
  return others.length < car.seats
}

/** Take a participant out of every passenger seat (drivers stay). */
export function removeFromSeats(cars: CarRow[], participantId: Id): CarRow[] {
  const target = String(participantId)
  return cars.map((car) => ({
    ...car,
    frontPassenger: refOf(car.frontPassenger) === target ? null : (car.frontPassenger ?? null),
    passengers: (car.passengers ?? []).filter((p) => refOf(p.participant) !== target),
  }))
}

export interface CarInput {
  name: string
  seats: number
  description?: string | null
  equipment?: string[]
}

/** Trimmed, bounded car fields; null when they don't make a car. */
export function sanitizeCarInput(input: Partial<CarInput> | null | undefined): CarInput | null {
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 60) : ''
  const seats = Number(input?.seats)
  if (!name || !Number.isInteger(seats) || seats < 1 || seats > 9) return null
  const description =
    typeof input?.description === 'string' && input.description.trim()
      ? input.description.trim().slice(0, 300)
      : null
  const equipment = Array.isArray(input?.equipment)
    ? input.equipment
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 12)
    : []
  return { name, seats, description, equipment }
}

/** A participant offers their car: they become its driver (and leave any seat). */
export function offerCar(
  cars: CarRow[],
  driverId: Id,
  input: Partial<CarInput> | null | undefined,
): Result<CarRow[]> {
  const car = sanitizeCarInput(input)
  if (!car) return fail('invalid-car')
  if (cars.some((c) => refOf(c.driver) === String(driverId))) return fail('already-driving')
  return ok([
    ...removeFromSeats(cars, driverId),
    {
      name: car.name,
      description: car.description,
      seats: car.seats,
      driver: Number(driverId),
      frontPassenger: null,
      passengers: [],
      equipment: (car.equipment ?? []).map((name) => ({ name })),
    },
  ])
}

/** Edit a car's name, seats, note and equipment; seats can't drop below who's in. */
export function updateCar(
  cars: CarRow[],
  carId: string,
  input: Partial<CarInput> | null | undefined,
): Result<CarRow[]> {
  const index = cars.findIndex((c) => c.id === carId)
  if (index < 0) return fail('not-found')
  const car = sanitizeCarInput(input)
  if (!car) return fail('invalid-car')
  if (carOccupantIds(cars[index]).length > car.seats) return fail('seats-too-few')
  return ok(
    cars.map((c, i) =>
      i !== index
        ? c
        : {
            ...c,
            name: car.name,
            seats: car.seats,
            description: car.description,
            equipment: (car.equipment ?? []).map((name) => ({ name })),
          },
    ),
  )
}

export function removeCar(cars: CarRow[], carId: string): Result<CarRow[]> {
  if (!cars.some((c) => c.id === carId)) return fail('not-found')
  return ok(cars.filter((c) => c.id !== carId))
}

/** Sit in a car, front or back; moves the participant out of any other seat. */
export function takeSeat(
  cars: CarRow[],
  args: { carId: string; participantId: Id; seat: 'front' | 'back' },
): Result<CarRow[]> {
  const target = String(args.participantId)
  if (!cars.some((c) => c.id === args.carId)) return fail('not-found')
  // a driver withdraws their car before riding with somebody else
  if (cars.some((c) => refOf(c.driver) === target)) return fail('is-driver')
  const cleared = removeFromSeats(cars, args.participantId)
  const car = cleared.find((c) => c.id === args.carId)!
  if (car.seats != null && carOccupantIds(car).length >= car.seats) return fail('car-full')
  if (args.seat === 'front' && car.frontPassenger != null) return fail('front-taken')
  return ok(
    cleared.map((c) =>
      c.id !== args.carId
        ? c
        : args.seat === 'front'
          ? { ...c, frontPassenger: Number(args.participantId) }
          : {
              ...c,
              passengers: [...(c.passengers ?? []), { participant: Number(args.participantId) }],
            },
    ),
  )
}

/** Leave whichever passenger seat the participant has. */
export function leaveCar(cars: CarRow[], participantId: Id): Result<CarRow[]> {
  return ok(removeFromSeats(cars, participantId))
}
