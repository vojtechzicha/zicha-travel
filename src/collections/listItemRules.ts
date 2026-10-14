import { APIError, type Access, type Payload, type PayloadRequest, type Where } from 'payload'
import { canManageChata, isSuperadmin, refId } from '../lib/access'
import { linkedParticipantIds } from '../lib/expenseAuthoring'

// The rules the chata's shared lists have in common: "Nákup"
// (shopping-items) and "Pivo" (keg-items). Anyone reads; signed-in
// participants add for themselves or their own other participants (a parent
// for a child); the author edits their items; the banker (they place the
// order) and chata admins tidy everything.

/** Chatas whose banker participant is linked to this account. */
export async function bankerChataIds(payload: Payload, userId: number | string): Promise<number[]> {
  const own = await payload.find({
    collection: 'participants',
    where: { account: { equals: userId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  if (own.docs.length === 0) return []
  const chatas = await payload.find({
    collection: 'chatas',
    where: { banker: { in: own.docs.map((p) => p.id) } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    context: { triggerAfterRead: false },
  })
  return chatas.docs.map((c) => c.id)
}

// Author, the chata's banker and chata admins; the precise create rules run
// in the collection's beforeChange hook (applyListAuthorship)
export const listEditAccess: Access = async ({ req }) => {
  const user = req.user
  if (!user) return false
  if (isSuperadmin(user)) return true
  const or: Where[] = [{ authoredBy: { equals: user.id } }]
  if (user.role === 'admin' && (user.assignedChatas ?? []).length > 0) {
    or.push({ chata: { in: user.assignedChatas } })
  }
  const banker = await bankerChataIds(req.payload, user.id)
  if (banker.length > 0) or.push({ chata: { in: banker } })
  return { or }
}

type Data = Record<string, unknown>

/** The item's chata; an item never moves to another one. */
export function listItemChataId(
  data: Data,
  operation: 'create' | 'update',
  originalDoc: Data | undefined,
): string {
  const chataRef = operation === 'create' ? data.chata : (originalDoc?.chata ?? data.chata)
  if (chataRef == null) throw new APIError('Chybí chata', 400)
  const chataId = refId(chataRef)
  if (operation === 'update' && data.chata != null && refId(data.chata) !== chataId) {
    throw new APIError('Položku nejde přesunout do jiné chaty', 400)
  }
  data.chata = Number(chataId)
  return chataId
}

/**
 * Who wrote the item and who it is for, for a signed-in writer. Stamps
 * `authoredBy` on create (kept on update unless a chata admin edits).
 * Everybody but chata admins adds only for their own participants and never
 * sets `serverFields` (written by the list's own endpoints, e.g. "sent to
 * the cart"); the banker reaches other people's items through
 * listEditAccess and may change them without changing whose they are.
 */
export async function applyListAuthorship(args: {
  data: Data
  operation: 'create' | 'update'
  originalDoc: Data | undefined
  req: PayloadRequest
  chataId: string
  serverFields: string[]
  notParticipantMessage: string
}): Promise<void> {
  const { data, operation, originalDoc, req, chataId } = args
  const user = req.user
  if (!user) return
  const managesThisChata = canManageChata(user, chataId)

  if (operation === 'create') data.authoredBy = user.id
  else if (!managesThisChata) data.authoredBy = originalDoc?.authoredBy

  if (managesThisChata) return

  for (const field of args.serverFields) {
    data[field] = operation === 'update' ? (originalDoc?.[field] ?? null) : null
  }

  const participants = await req.payload.find({
    collection: 'participants',
    where: { chata: { equals: chataId } },
    // oldest first: the default "pro koho" is the account's own
    // participant, not a child added later
    sort: 'createdAt',
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const own = linkedParticipantIds(user.id, participants.docs)
  if (operation === 'create' && own.length === 0) {
    throw new APIError(args.notParticipantMessage, 403)
  }
  // "pro koho": one of the author's own participants (a parent adds for a
  // child); defaults to the first one
  const wanted = data.participant ?? originalDoc?.participant
  if (wanted != null && !own.includes(refId(wanted))) {
    // the banker may tidy items of others without changing whose they are
    if (
      operation === 'update' &&
      originalDoc?.participant != null &&
      refId(wanted) === refId(originalDoc.participant)
    ) {
      return
    }
    throw new APIError('Položku můžeš přidat jen za sebe', 403)
  }
  if (operation === 'create' && wanted == null) data.participant = Number(own[0])
}
