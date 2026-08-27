// An expense or prepayment must never span chatas: every participant and
// joint-account reference on it has to belong to ITS chata. The admin
// filterOptions only constrain the UI — an API client could otherwise link
// people from another trip into a payer, a split, an invitation or a
// settlement mark, and the maths, the visibility rules and the private
// circle would silently count people the chata cannot even name.

import { APIError, type PayloadRequest } from 'payload'
import { refId } from '../lib/access'

const uniqueIds = (refs: ReadonlyArray<unknown>): string[] => [
  ...new Set(
    refs
      .filter((ref) => ref !== null && ref !== undefined)
      .map(refId)
      .filter((id) => id !== '' && id !== 'undefined' && id !== 'null'),
  ),
]

/**
 * Throws when any referenced participant or joint account lives outside the
 * given chata (or does not exist at all). Runs on the caller's request, so
 * inside a write it shares the transaction.
 */
export async function assertRefsBelongToChata(args: {
  req: PayloadRequest
  chataId: string
  participantRefs: ReadonlyArray<unknown>
  jointAccountRefs?: ReadonlyArray<unknown>
  participantMessage: string
  jointAccountMessage: string
}): Promise<void> {
  const participantIds = uniqueIds(args.participantRefs)
  if (participantIds.length > 0) {
    const found = await args.req.payload.find({
      collection: 'participants',
      where: {
        and: [{ id: { in: participantIds } }, { chata: { equals: args.chataId } }],
      },
      limit: participantIds.length,
      depth: 0,
      overrideAccess: true,
      req: args.req,
    })
    if (found.docs.length !== participantIds.length) {
      throw new APIError(args.participantMessage, 400)
    }
  }
  const jointAccountIds = uniqueIds(args.jointAccountRefs ?? [])
  if (jointAccountIds.length > 0) {
    const found = await args.req.payload.find({
      collection: 'joint-accounts',
      where: {
        and: [{ id: { in: jointAccountIds } }, { chata: { equals: args.chataId } }],
      },
      limit: jointAccountIds.length,
      depth: 0,
      overrideAccess: true,
      req: args.req,
    })
    if (found.docs.length !== jointAccountIds.length) {
      throw new APIError(args.jointAccountMessage, 400)
    }
  }
}
