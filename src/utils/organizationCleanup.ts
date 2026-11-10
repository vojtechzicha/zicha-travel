import type { CollectionBeforeDeleteHook, Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Chata } from '@/payload-types'
import { refId } from '@/lib/access'
import {
  withoutParticipant,
  type CarRow,
  type OrganizationRows,
  type RoomRow,
  type TransportRow,
} from '@/lib/organizationEditing'

// The rozpis ("Organizace": beds, cars, public transport riders) names
// participants in array rows whose `participant` is required. Deleting a
// participant only nulls those references in the database, and from then on
// Payload refuses EVERY save of the chata ("Occupants 1 > Participant: This
// field is required"), frontend edits of somebody else's car included. So
// the rows go with the participant, and every frontend edit sweeps up rows
// orphaned before this existed.

type DbSession = { execute?: (q: unknown) => Promise<unknown> } | undefined

/** Serialize rozpis writes of one chata for the rest of the transaction. */
export async function lockOrganization(
  payload: Payload,
  transactionID: number | string,
  chataId: number | string,
): Promise<void> {
  const session = (payload.db as unknown as { sessions?: Record<string, { db?: DbSession }> })
    .sessions?.[String(transactionID)]?.db
  if (session?.execute) {
    await session.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`organization:${chataId}`}))`)
  }
}

export function organizationRows(chata: Chata): OrganizationRows {
  return {
    rooms: (chata.rooms ?? []) as unknown as RoomRow[],
    sharedCars: (chata.sharedCars ?? []) as unknown as CarRow[],
    publicTransportOptions: (chata.publicTransportOptions ?? []) as unknown as TransportRow[],
  }
}

/** Only the arrays `withoutParticipant` changed, ready for `payload.update`. */
export function changedRows(
  result: ReturnType<typeof withoutParticipant>,
): Partial<OrganizationRows> {
  const data: Partial<OrganizationRows> = {}
  if (result.changed.rooms) data.rooms = result.rows.rooms
  if (result.changed.sharedCars) data.sharedCars = result.rows.sharedCars
  if (result.changed.publicTransportOptions) {
    data.publicTransportOptions = result.rows.publicTransportOptions
  }
  return data
}

/** Participants beforeDelete: take the participant out of their chata's rozpis. */
export const removeFromOrganizationOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { payload } = req
  const participant = await payload
    .findByID({ collection: 'participants', id, depth: 0, overrideAccess: true, req })
    .catch(() => null)
  if (!participant?.chata) return
  const chataId = refId(participant.chata)

  const transactionID = await req.transactionID
  if (transactionID != null) await lockOrganization(payload, transactionID, chataId)

  const chata = (await payload
    .findByID({
      collection: 'chatas',
      id: chataId,
      depth: 0,
      overrideAccess: true,
      req,
      context: { triggerAfterRead: false },
    })
    .catch(() => null)) as Chata | null
  if (!chata) return

  const data = changedRows(withoutParticipant(organizationRows(chata), id))
  if (Object.keys(data).length === 0) return
  await payload.update({
    collection: 'chatas',
    id: chataId,
    data: data as Partial<Chata>,
    depth: 0,
    overrideAccess: true,
    req,
    context: { triggerAfterRead: false },
  })
}
