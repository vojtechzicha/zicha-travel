import type { Endpoint, Payload, PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Chata } from '@/payload-types'
import { canManageChata, refId } from '@/lib/access'
import {
  canEditCar,
  canMoveParticipant,
  leaveCar,
  offerCar,
  placeInBed,
  removeCar,
  removeFromBeds,
  takeSeat,
  updateCar,
  type CarRow,
  type OrganizationError,
  type Result,
  type RoomRow,
} from '@/lib/organizationEditing'
import { getTripNights } from '@/app/(frontend)/utils/participantHelpers'
import { getTripPhase } from '@/app/(frontend)/utils/tripData'

// POST /api/chatas/:id/organization — frontend editing of "Organizace"
// (beds and shared cars; rules in src/lib/organizationEditing.ts). Every
// action re-reads the chata inside a transaction that holds an advisory
// lock on it, so two people grabbing the last free place can't both win and
// nobody's edit overwrites another's arrays.

type DbSession = { execute?: (q: unknown) => Promise<unknown> } | undefined

function transactionSession(payload: Payload, tid: number | string): DbSession {
  return (payload.db as unknown as { sessions?: Record<string, { db?: DbSession }> }).sessions?.[
    String(tid)
  ]?.db
}

class ActionError extends Error {
  constructor(
    readonly code: OrganizationError | 'disabled' | 'planning' | 'trip-over' | 'invalid',
    readonly status: number,
  ) {
    super(code)
  }
}

const STATUS: Record<OrganizationError, number> = {
  'not-found': 404,
  forbidden: 403,
  'room-full': 409,
  'car-full': 409,
  'front-taken': 409,
  'is-driver': 409,
  'already-driving': 409,
  'seats-too-few': 409,
  'invalid-car': 400,
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new ActionError(result.error, STATUS[result.error])
  return result.value
}

const idParam = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function readBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    return ((await req.json?.()) ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

export const organizationEndpoints: Endpoint[] = [
  {
    path: '/:id/organization',
    method: 'post',
    handler: async (req) => {
      const user = req.user
      if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
      const chataId = idParam(req.routeParams?.id)
      if (chataId == null) return Response.json({ error: 'invalid' }, { status: 400 })
      const body = await readBody(req)
      const action = typeof body.action === 'string' ? body.action : ''

      const payload = req.payload
      const tid = await payload.db.beginTransaction()
      if (tid == null) return Response.json({ error: 'unavailable' }, { status: 503 })
      const txReq = { transactionID: tid } as unknown as PayloadRequest
      try {
        const session = transactionSession(payload, tid)
        if (session?.execute) {
          await session.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`organization:${chataId}`}))`,
          )
        }

        const chata = (await payload.findByID({
          collection: 'chatas',
          id: chataId,
          depth: 0,
          overrideAccess: true,
          req: txReq,
          context: { triggerAfterRead: false },
        })) as Chata
        if (chata.planningEnabled === true) throw new ActionError('planning', 409)
        // after the trip the rozpis is a record, read-only like in the UI
        if (getTripPhase(chata) === 'after') throw new ActionError('trip-over', 409)

        const participants = await payload.find({
          collection: 'participants',
          where: { chata: { equals: chataId } },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
          req: txReq,
        })
        const chataParticipantIds = new Set(participants.docs.map((p) => String(p.id)))
        const ownIds = participants.docs
          .filter((p) => p.account != null && refId(p.account) === String(user.id))
          .map((p) => p.id)
        const isOrganizer =
          canManageChata(user, chataId) ||
          (chata.banker != null && ownIds.map(String).includes(refId(chata.banker)))
        if (!isOrganizer && ownIds.length === 0) throw new ActionError('forbidden', 403)

        /** a participant of THIS chata whom the viewer may move */
        const movable = (value: unknown): number => {
          const id = idParam(value)
          if (id == null || !chataParticipantIds.has(String(id))) {
            throw new ActionError('invalid', 400)
          }
          if (!canMoveParticipant({ participantId: id, ownParticipantIds: ownIds, isOrganizer })) {
            throw new ActionError('forbidden', 403)
          }
          return id
        }

        const rooms = (chata.rooms ?? []) as unknown as RoomRow[]
        const cars = (chata.sharedCars ?? []) as unknown as CarRow[]
        const carById = (value: unknown): CarRow => {
          const car = cars.find((c) => c.id === value)
          if (!car) throw new ActionError('not-found', 404)
          return car
        }
        const requireBeds = () => {
          if (chata.bedroomOrganizationEnabled !== true) throw new ActionError('disabled', 409)
        }
        const requireCars = () => {
          if (chata.sharedCarsEnabled !== true) throw new ActionError('disabled', 409)
        }

        let data: { rooms?: RoomRow[]; sharedCars?: CarRow[] }
        switch (action) {
          case 'bed.place': {
            requireBeds()
            data = {
              rooms: unwrap(
                placeInBed(rooms, {
                  roomId: String(body.roomId ?? ''),
                  bedId: String(body.bedId ?? ''),
                  participantId: movable(body.participantId),
                  perNight: chata.advancedBedroomMode === true,
                  totalNights: getTripNights(chata),
                  nights: body.nights,
                }),
              ),
            }
            break
          }
          case 'bed.leave': {
            requireBeds()
            data = { rooms: removeFromBeds(rooms, movable(body.participantId)) }
            break
          }
          case 'car.offer': {
            requireCars()
            data = {
              sharedCars: unwrap(
                offerCar(cars, movable(body.driverId), body.car as Record<string, unknown>),
              ),
            }
            break
          }
          case 'car.update':
          case 'car.remove': {
            requireCars()
            const car = carById(body.carId)
            if (!canEditCar(car, ownIds, isOrganizer)) throw new ActionError('forbidden', 403)
            data = {
              sharedCars: unwrap(
                action === 'car.update'
                  ? updateCar(cars, String(body.carId), body.car as Record<string, unknown>)
                  : removeCar(cars, String(body.carId)),
              ),
            }
            break
          }
          case 'car.seat': {
            requireCars()
            const seat = body.seat === 'front' ? 'front' : body.seat === 'back' ? 'back' : null
            if (!seat) throw new ActionError('invalid', 400)
            data = {
              sharedCars: unwrap(
                takeSeat(cars, {
                  carId: String(body.carId ?? ''),
                  participantId: movable(body.participantId),
                  seat,
                }),
              ),
            }
            break
          }
          case 'car.leave': {
            requireCars()
            data = { sharedCars: unwrap(leaveCar(cars, movable(body.participantId))) }
            break
          }
          default:
            throw new ActionError('invalid', 400)
        }

        await payload.update({
          collection: 'chatas',
          id: chataId,
          data: data as Partial<Chata>,
          depth: 0,
          overrideAccess: true,
          req: txReq,
          context: { triggerAfterRead: false },
        })
        await payload.db.commitTransaction(tid)
        return Response.json({ ok: true })
      } catch (err) {
        await payload.db.rollbackTransaction(tid).catch(() => undefined)
        if (err instanceof ActionError) {
          return Response.json({ error: err.code }, { status: err.status })
        }
        payload.logger.error({ err }, 'Organization edit failed')
        return Response.json({ error: 'failed' }, { status: 500 })
      }
    },
  },
]
