import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type Access,
  type Endpoint,
  type Payload,
  type PayloadRequest,
  type Where,
} from 'payload'
import { canManageChata, isSuperadmin, refId } from '../lib/access'
import { linkedParticipantIds } from '../lib/expenseAuthoring'
import { bankerAccountId } from '../utils/rohlikConnection'
import { syncListExpense } from '../utils/listExpense'
import { lockList } from '../utils/listLock'

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

/** The chata field that closes each list ("Uzavřít objednávku"). */
export type ListCloseField = 'shoppingClosedAt' | 'beerClosedAt'

/**
 * A closed list stays readable but takes no changes from the page: once the
 * banker has ordered, nobody may add, change or remove items until they
 * reopen it. Same for a list that's switched off or a trip still in
 * planning. Scripts and the lists' own endpoints (no user) and chata admins
 * (fixing things in the admin panel) pass.
 */
export async function assertListOpen(
  req: PayloadRequest,
  chataId: number | string,
  field: ListCloseField,
): Promise<void> {
  // every write to a list waits for a close in progress (and vice versa), so
  // the closed receipt and its Finance row always see the same items
  await lockList(req, chataId, field === 'shoppingClosedAt' ? 'shopping' : 'beer')
  const user = req.user
  if (!user || canManageChata(user, chataId)) return
  const chata = await req.payload
    .findByID({
      req,
      collection: 'chatas',
      id: chataId,
      depth: 0,
      overrideAccess: true,
      context: { triggerAfterRead: false },
    })
    .catch(() => null)
  // a switched-off list, or a trip still being planned, takes nothing: the
  // slug API hides it, and items written now would surface later unseen
  const enabled = field === 'shoppingClosedAt' ? chata?.shoppingListEnabled : chata?.beerListEnabled
  if (!chata || enabled !== true || chata.planningEnabled === true) {
    throw new APIError('Tenhle seznam teď není zapnutý', 409)
  }
  if (chata[field]) throw new APIError('Objednávka je uzavřená, změny už nejdou', 409)
}

/** afterDelete: a removed item takes its "tohle nechci" rows with it. */
export function dropItemOptOuts(list: 'shopping' | 'beer') {
  return async ({ req, id }: { req: PayloadRequest; id: number | string }) => {
    await req.payload.delete({
      collection: 'list-opt-outs',
      where: { and: [{ list: { equals: list } }, { itemId: { equals: Number(id) } }] },
      overrideAccess: true,
      req,
    })
  }
}

/** beforeDelete: the same guard, looked up from the item being deleted. */
export function guardDeleteWhenClosed(
  collection: 'shopping-items' | 'keg-items',
  field: ListCloseField,
) {
  return async ({ req, id }: { req: PayloadRequest; id: number | string }) => {
    if (!req.user) return
    const item = await req.payload
      .findByID({ req, collection, id, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (item?.chata != null) await assertListOpen(req, refId(item.chata), field)
  }
}

/**
 * POST <collection>/close { chata, closed }: the banker (or a chata admin)
 * closes the list after ordering, or opens it again. Stamps or clears the
 * chata's close field; closing also writes the list's Finance row
 * (syncListExpense) and reports it.
 */
export function closeListEndpoint(field: ListCloseField): Endpoint {
  const list = field === 'shoppingClosedAt' ? 'shopping' : 'beer'
  return {
    path: '/close',
    method: 'post',
    handler: async (req) => {
      let body: Record<string, unknown> = {}
      try {
        body = ((await req.json?.()) ?? {}) as Record<string, unknown>
      } catch {
        body = {}
      }
      const chataId = Number(body.chata)
      if (!Number.isInteger(chataId) || chataId <= 0) {
        return Response.json({ error: 'invalid-chata' }, { status: 400 })
      }
      if (!req.user) return Response.json({ error: 'forbidden' }, { status: 403 })
      const banker = await bankerAccountId(req.payload, chataId)
      if (banker !== String(req.user.id) && !canManageChata(req.user, chataId)) {
        return Response.json({ error: 'forbidden' }, { status: 403 })
      }
      const closing = body.closed === true

      // One transaction under the list's lock: the close stamp and the
      // Finance row land together, against exactly the items that are
      // there; item writes wait for it (assertListOpen takes the same lock)
      const shouldCommit = await initTransaction(req)
      try {
        await lockList(req, chataId, list)
        const chata = await req.payload.findByID({
          req,
          collection: 'chatas',
          id: chataId,
          depth: 0,
          overrideAccess: true,
          context: { triggerAfterRead: false },
        })
        const enabled = list === 'shopping' ? chata.shoppingListEnabled : chata.beerListEnabled
        // a hidden list isn't closed into Finance (stale items would land there)
        if (closing && (enabled !== true || chata.planningEnabled === true)) {
          if (shouldCommit) await commitTransaction(req)
          return Response.json({ error: 'disabled' }, { status: 409 })
        }
        const closedAt = closing ? new Date().toISOString() : null
        await req.payload.update({
          req,
          collection: 'chatas',
          id: chataId,
          data: { [field]: closedAt },
          depth: 0,
          overrideAccess: true,
          context: { triggerAfterRead: false },
        })
        const expense = closing ? await syncListExpense(req.payload, chataId, list, req) : null
        if (shouldCommit) await commitTransaction(req)
        return Response.json(expense ? { closedAt, expense } : { closedAt })
      } catch (err) {
        await killTransaction(req)
        req.payload.logger.error({ err }, 'Closing the list failed')
        return Response.json({ error: 'failed' }, { status: 500 })
      }
    },
  }
}
