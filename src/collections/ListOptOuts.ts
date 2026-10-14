import { APIError, type Access, type CollectionConfig, type Endpoint, type Where } from 'payload'
import { canManageChata, isSuperadmin, refId } from '../lib/access'
import { linkedParticipantIds } from '../lib/expenseAuthoring'
import { canSetOptOut, type ListKind } from '../lib/listSplit'
import { bankerAccountId } from '../utils/rohlikConnection'
import { assertListOpen } from './listItemRules'

const ITEM_COLLECTION: Record<ListKind, 'shopping-items' | 'keg-items'> = {
  shopping: 'shopping-items',
  beer: 'keg-items',
}
const CLOSE_FIELD = { shopping: 'shoppingClosedAt', beer: 'beerClosedAt' } as const

// The slug API ships opt-outs (names to signed-in viewers only); the
// collection itself is for the admin panel
const adminRead: Access = ({ req }) => {
  const user = req.user
  if (!user) return false
  if (isSuperadmin(user)) return true
  if (user.role === 'admin' && (user.assignedChatas ?? []).length > 0) {
    return { chata: { in: user.assignedChatas } }
  }
  return false
}

// POST /api/list-opt-outs/set { chata, list, item | null, participant, out }
// "Tohle nechci" (item) or "na tohle se neskládám" (item null = the whole
// list, items added later included). For your own participants (a parent
// for a child), or for anyone as the banker or a chata admin; never on a
// closed list (chata admins excepted, like every other change).
export const setOptOut: Endpoint = {
  path: '/set',
  method: 'post',
  handler: async (req) => {
    let body: Record<string, unknown> = {}
    try {
      body = ((await req.json?.()) ?? {}) as Record<string, unknown>
    } catch {
      body = {}
    }
    const chataId = Number(body.chata)
    const participantId = Number(body.participant)
    const list = body.list === 'shopping' || body.list === 'beer' ? body.list : null
    const itemId = body.item == null ? null : Number(body.item)
    if (
      !Number.isInteger(chataId) ||
      !Number.isInteger(participantId) ||
      !list ||
      (itemId !== null && !Number.isInteger(itemId))
    ) {
      return Response.json({ error: 'invalid' }, { status: 400 })
    }
    const user = req.user
    if (!user) return Response.json({ error: 'forbidden' }, { status: 403 })

    const { docs: participants } = await req.payload.find({
      collection: 'participants',
      where: { chata: { equals: chataId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    if (!participants.some((p) => p.id === participantId)) {
      return Response.json({ error: 'invalid-participant' }, { status: 400 })
    }
    const allowed = canSetOptOut({
      ownsParticipant: linkedParticipantIds(user.id, participants).includes(String(participantId)),
      isBanker: (await bankerAccountId(req.payload, chataId)) === String(user.id),
      isChataAdmin: canManageChata(user, chataId),
    })
    if (!allowed) return Response.json({ error: 'forbidden' }, { status: 403 })
    try {
      await assertListOpen(req, chataId, CLOSE_FIELD[list])
    } catch (err) {
      if (err instanceof APIError) return Response.json({ error: 'closed' }, { status: 409 })
      throw err
    }
    if (itemId !== null) {
      const item = await req.payload
        .findByID({ collection: ITEM_COLLECTION[list], id: itemId, depth: 0, overrideAccess: true })
        .catch(() => null)
      if (!item || String(refId(item.chata)) !== String(chataId)) {
        return Response.json({ error: 'invalid-item' }, { status: 400 })
      }
    }

    const where: Where = {
      and: [
        { chata: { equals: chataId } },
        { list: { equals: list } },
        { participant: { equals: participantId } },
        itemId === null ? { itemId: { exists: false } } : { itemId: { equals: itemId } },
      ],
    }
    if (body.out === true) {
      const existing = await req.payload.find({
        collection: 'list-opt-outs',
        where,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (existing.docs.length === 0) {
        await req.payload.create({
          collection: 'list-opt-outs',
          data: { chata: chataId, list, itemId, participant: participantId, setBy: user.id },
          depth: 0,
          overrideAccess: true,
        })
      }
    } else {
      await req.payload.delete({ collection: 'list-opt-outs', where, overrideAccess: true })
    }
    return Response.json({ ok: true })
  },
}

// "Neskládám se": who doesn't chip in for an item of "Nákup" / "Pivo", or for
// a whole list (src/lib/listSplit.ts). Written only by the endpoint above.
export const ListOptOuts: CollectionConfig = {
  slug: 'list-opt-outs',
  labels: {
    singular: { en: 'List opt-out', cs: 'Neskládá se' },
    plural: { en: 'List opt-outs', cs: 'Kdo se neskládá' },
  },
  admin: {
    group: { en: 'System', cs: 'Systém' },
    defaultColumns: ['participant', 'list', 'itemId', 'chata'],
    description: {
      en: 'Who does not chip in for an item of the shopping list or the beer order (no item = the whole list). Set from the tab.',
      cs: 'Kdo se neskládá na položku nákupu nebo objednávky piva (bez položky = na celý seznam). Nastavuje se v záložce.',
    },
  },
  access: {
    read: adminRead,
    create: () => false,
    update: () => false,
    delete: ({ req }) => isSuperadmin(req.user),
  },
  endpoints: [setOptOut],
  fields: [
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      index: true,
    },
    {
      name: 'list',
      type: 'select',
      required: true,
      options: [
        { label: { en: 'Shopping', cs: 'Nákup' }, value: 'shopping' },
        { label: { en: 'Beer', cs: 'Pivo' }, value: 'beer' },
      ],
    },
    {
      name: 'itemId',
      type: 'number',
      label: { en: 'Item', cs: 'Položka' },
      admin: {
        description: {
          en: 'Empty = the whole list, items added later included.',
          cs: 'Prázdné = celý seznam, včetně později přidaných položek.',
        },
      },
    },
    {
      name: 'participant',
      type: 'relationship',
      relationTo: 'participants',
      required: true,
    },
    {
      name: 'setBy',
      type: 'relationship',
      relationTo: 'users',
      maxDepth: 0,
      label: { en: 'Set by', cs: 'Nastavil(a)' },
      admin: { readOnly: true },
    },
  ],
}
