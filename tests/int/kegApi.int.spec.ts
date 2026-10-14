import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Chata, KegItem, Participant, User } from '@/payload-types'
import type { PayloadRequest } from 'payload'
import { closeListEndpoint } from '@/collections/listItemRules'
import { setOptOut as setOptOutEndpoint } from '@/collections/ListOptOuts'
import { syncListExpense } from '@/utils/listExpense'

// "Pivo" (src/collections/KegItems.ts) against the real local API with its
// own fixture chata: product fields always come from the price list, the
// people rules are the ones "Nákup" uses (listItemRules.ts), and only the
// order-summary endpoint stamps the summary fields.
//
// Needs the local docker-compose database (pnpm db), like api.int.spec.ts.

let payload: Payload

const SLUG = 'vitest-kegs'

let chata: Chata
const users: Record<string, User> = {}
const people: Record<string, Participant> = {}
let authorItem: KegItem

const asUser = (u: User | undefined) =>
  ({ overrideAccess: false, user: u ? { ...u, collection: 'users' } : undefined }) as const

async function removeFixture() {
  const existing = await payload.find({
    collection: 'chatas',
    where: { slug: { equals: SLUG } },
    limit: 1,
    depth: 0,
    context: { triggerAfterRead: false },
  })
  const found = existing.docs[0]
  if (found) {
    for (const collection of ['expenses', 'list-opt-outs', 'keg-items', 'participants'] as const) {
      await payload.delete({ collection, where: { chata: { equals: found.id } }, depth: 0 })
    }
    await payload.delete({ collection: 'chatas', id: found.id, depth: 0 })
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: 'vitest-kegs-%' } },
    depth: 0,
  })
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await removeFixture()

  const mkUser = async (key: string, role: User['role']) =>
    (users[key] = await payload.create({
      collection: 'users',
      depth: 0,
      data: { email: `vitest-kegs-${key}@example.com`, role, password: `vitest-${key}-not-used` },
    }))
  await mkUser('author', 'user')
  await mkUser('other', 'user')
  await mkUser('banker', 'user')
  await mkUser('outsider', 'user')

  chata = await payload.create({
    collection: 'chatas',
    depth: 0,
    context: { triggerAfterRead: false },
    data: {
      name: 'Vitest pivo',
      shortName: 'Pivo',
      location: 'Test',
      slug: SLUG,
      beerListEnabled: true,
    },
  })
  const mkPerson = async (key: string, account?: User) =>
    (people[key] = await payload.create({
      collection: 'participants',
      depth: 0,
      data: { name: `Vitest ${key}`, chata: chata.id, ...(account ? { account: account.id } : {}) },
    }))
  await mkPerson('author', users.author)
  await mkPerson('other', users.other)
  await mkPerson('banker', users.banker)
  await payload.update({
    collection: 'chatas',
    id: chata.id,
    depth: 0,
    context: { triggerAfterRead: false },
    data: { banker: people.banker.id },
  })

  authorItem = await payload.create({
    collection: 'keg-items',
    depth: 0,
    data: { chata: chata.id, code: 'PIV311KOZ', quantity: 1 },
    ...asUser(users.author),
  })
}, 60_000)

afterAll(async () => {
  await removeFixture()
})

describe('keg-items create', () => {
  it('stamps the author, their participant and the catalog fields', () => {
    expect(String(authorItem.authoredBy)).toBe(String(users.author.id))
    expect(String(authorItem.participant)).toBe(String(people.author.id))
    expect(authorItem).toMatchObject({ name: 'Kozel 11°', liters: 30, price: 1230, unit: 'keg' })
  })

  it('never takes name, size, price or summary fields from the body', async () => {
    const item = await payload.create({
      collection: 'keg-items',
      depth: 0,
      data: {
        chata: chata.id,
        code: 'PIV024PLZ',
        quantity: 1,
        name: 'Zdarma',
        price: 1,
        liters: 999,
        summarySentAt: new Date().toISOString(),
        summaryQuantity: 1,
      },
      ...asUser(users.author),
    })
    expect(item).toMatchObject({ name: 'Plzeň 12°', price: 1926, liters: 30 })
    expect(item.summarySentAt ?? null).toBeNull()
    expect(item.summaryQuantity ?? null).toBeNull()
  })

  it('refuses a fractional quantity', async () => {
    await expect(
      payload.create({
        collection: 'keg-items',
        depth: 0,
        data: { chata: chata.id, code: 'PIV311KOZ', quantity: 1.5 },
        ...asUser(users.author),
      }),
    ).rejects.toThrow()
  })

  it('refuses a code the shop does not list', async () => {
    await expect(
      payload.create({
        collection: 'keg-items',
        depth: 0,
        data: { chata: chata.id, code: 'FREEBEER', quantity: 1 },
        ...asUser(users.author),
      }),
    ).rejects.toThrow()
  })

  it('refuses adding for somebody else, outsiders and anonymous visitors', async () => {
    const attempt = (user: User | undefined, participant?: number) =>
      payload.create({
        collection: 'keg-items',
        depth: 0,
        data: {
          chata: chata.id,
          code: 'PIV311KOZ',
          quantity: 1,
          ...(participant ? { participant } : {}),
        },
        ...asUser(user),
      })
    await expect(attempt(users.author, people.other.id)).rejects.toThrow()
    await expect(attempt(users.outsider)).rejects.toThrow()
    await expect(attempt(undefined)).rejects.toThrow()
  })
})

describe('keg-items update and delete', () => {
  it('lets the author change their own item, re-reading the catalog on a new code', async () => {
    const updated = await payload.update({
      collection: 'keg-items',
      id: authorItem.id,
      depth: 0,
      data: { quantity: 2, code: 'PIV312KOZ', price: 1 },
      ...asUser(users.author),
    })
    expect(updated).toMatchObject({ quantity: 2, liters: 50, price: 1980 })
  })

  it('refuses another participant', async () => {
    await expect(
      payload.update({
        collection: 'keg-items',
        id: authorItem.id,
        depth: 0,
        data: { quantity: 9 },
        ...asUser(users.other),
      }),
    ).rejects.toThrow()
  })

  it('lets the banker tidy any item without changing whose it is', async () => {
    const updated = await payload.update({
      collection: 'keg-items',
      id: authorItem.id,
      depth: 0,
      data: { quantity: 3 },
      ...asUser(users.banker),
    })
    expect(updated.quantity).toBe(3)
    expect(String(updated.participant)).toBe(String(people.author.id))
    expect(String(updated.authoredBy)).toBe(String(users.author.id))
  })

  it('reads publicly', async () => {
    const found = await payload.find({
      collection: 'keg-items',
      where: { chata: { equals: chata.id } },
      depth: 0,
      ...asUser(undefined),
    })
    expect(found.docs.length).toBeGreaterThan(0)
  })
})

describe('closing the order', () => {
  const close = (user: User | undefined, closed: boolean) =>
    closeListEndpoint('beerClosedAt').handler({
      payload,
      user: user ? { ...user, collection: 'users' } : null,
      json: async () => ({ chata: chata.id, closed }),
    } as unknown as PayloadRequest)

  it('lets only the banker close it', async () => {
    expect((await close(users.other, true)).status).toBe(403)
    expect((await close(undefined, true)).status).toBe(403)
    const res = await close(users.banker, true)
    expect(res.status).toBe(200)
    const reread = await payload.findByID({
      collection: 'chatas',
      id: chata.id,
      depth: 0,
      context: { triggerAfterRead: false },
    })
    expect(reread.beerClosedAt).toBeTruthy()
  })

  it('refuses every change from the page while closed, the banker included', async () => {
    await expect(
      payload.create({
        collection: 'keg-items',
        depth: 0,
        data: { chata: chata.id, code: 'PIV311KOZ', quantity: 1 },
        ...asUser(users.author),
      }),
    ).rejects.toThrow()
    for (const user of [users.author, users.banker]) {
      await expect(
        payload.update({
          collection: 'keg-items',
          id: authorItem.id,
          depth: 0,
          data: { quantity: 7 },
          ...asUser(user),
        }),
      ).rejects.toThrow()
      await expect(
        payload.delete({ collection: 'keg-items', id: authorItem.id, ...asUser(user) }),
      ).rejects.toThrow()
    }
  })

  it('takes changes again once the banker reopens it', async () => {
    expect((await close(users.banker, false)).status).toBe(200)
    const updated = await payload.update({
      collection: 'keg-items',
      id: authorItem.id,
      depth: 0,
      data: { quantity: 4 },
      ...asUser(users.author),
    })
    expect(updated.quantity).toBe(4)
  })
})

describe('opting out and the Finance row', () => {
  const setOut = (user: User, participant: Participant, item: number | null, out = true) =>
    setOptOutEndpoint.handler({
      payload,
      user: { ...user, collection: 'users' },
      json: async () => ({ chata: chata.id, list: 'beer', item, participant: participant.id, out }),
    } as unknown as PayloadRequest)
  const close = (closed: boolean) =>
    closeListEndpoint('beerClosedAt').handler({
      payload,
      user: { ...users.banker, collection: 'users' },
      json: async () => ({ chata: chata.id, closed }),
    } as unknown as PayloadRequest)
  let plzen: KegItem

  beforeAll(async () => {
    plzen = await payload.create({
      collection: 'keg-items',
      depth: 0,
      data: { chata: chata.id, code: 'PIV024PLZ', quantity: 1 },
      ...asUser(users.other),
    })
  })

  it('lets people opt themselves out, never somebody else', async () => {
    expect((await setOut(users.other, people.other, plzen.id)).status).toBe(200)
    expect((await setOut(users.other, people.author, plzen.id)).status).toBe(403)
    // the banker may do it for anyone
    expect((await setOut(users.banker, people.author, plzen.id)).status).toBe(200)
  })

  it('turns the closed order into one expense split by who chips in', async () => {
    const res = await close(true)
    const body = (await res.json()) as { expense: { status: string; amount: number } }
    // the closing tests above already created it once: this close recalculates it
    expect(body.expense.status).toBe('updated')
    const { docs } = await payload.find({
      collection: 'expenses',
      where: { and: [{ chata: { equals: chata.id } }, { sourceList: { equals: 'beer' } }] },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    const expense = docs[0]
    const kegs = await payload.find({
      collection: 'keg-items',
      where: { chata: { equals: chata.id } },
      depth: 0,
    })
    const plzenCost = 1926
    const othersCost = kegs.docs
      .filter((item) => item.id !== plzen.id)
      .reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)
    expect(expense.amount).toBe(plzenCost + othersCost)
    expect(String(expense.payer && (expense.payer as { value: unknown }).value)).toBe(
      String(people.banker.id),
    )
    const weightOf = (p: Participant) =>
      expense.weights?.find((w) => String(w.participant) === String(p.id))?.weight ?? 0
    // only the banker wanted the Plzeň; everything else is split three ways
    expect(weightOf(people.banker) - weightOf(people.other)).toBeCloseTo(plzenCost, -1)
    expect(Math.abs(weightOf(people.author) - weightOf(people.other))).toBeLessThanOrEqual(1)
    expect(expense.weights?.reduce((sum, w) => sum + w.weight, 0)).toBe(expense.amount)
  })

  it('keeps the real bill and rescales the shares when closed again', async () => {
    const { docs } = await payload.find({
      collection: 'expenses',
      where: { and: [{ chata: { equals: chata.id } }, { sourceList: { equals: 'beer' } }] },
      depth: 0,
    })
    await payload.update({
      collection: 'expenses',
      id: docs[0].id,
      data: { isPlanned: false, amount: 20000 },
      depth: 0,
    })
    expect((await close(false)).status).toBe(200)
    const res = await close(true)
    const body = (await res.json()) as { expense: { status: string; amount: number } }
    expect(body.expense).toMatchObject({ status: 'updated', amount: 20000 })
    const again = await payload.findByID({ collection: 'expenses', id: docs[0].id, depth: 0 })
    expect(again.amount).toBe(20000)
    expect(again.weights?.reduce((sum, w) => sum + w.weight, 0)).toBe(20000)
    expect((await close(false)).status).toBe(200)
  })

  it("drops an item's opt-outs with the item", async () => {
    await payload.delete({ collection: 'keg-items', id: plzen.id, ...asUser(users.other) })
    const left = await payload.find({
      collection: 'list-opt-outs',
      where: { itemId: { equals: plzen.id } },
      depth: 0,
    })
    expect(left.docs).toHaveLength(0)
  })
})

describe("the list expense stays the list's own", () => {
  const listExpense = async () =>
    (
      await payload.find({
        collection: 'expenses',
        where: { and: [{ chata: { equals: chata.id } }, { sourceList: { equals: 'beer' } }] },
        depth: 0,
      })
    ).docs

  it("never lets a participant mark an expense as the list's", async () => {
    const own = await payload.create({
      collection: 'expenses',
      depth: 0,
      data: {
        chata: chata.id,
        title: 'Podvržené pivo',
        amount: 100,
        payer: { relationTo: 'participants', value: people.author.id },
        splitType: 'equal',
        sourceList: 'beer',
      },
      ...asUser(users.author),
    })
    expect(own.sourceList ?? null).toBeNull()
    const updated = await payload.update({
      collection: 'expenses',
      id: own.id,
      depth: 0,
      data: { sourceList: 'beer' },
      ...asUser(users.author),
    })
    expect(updated.sourceList ?? null).toBeNull()
    await payload.delete({ collection: 'expenses', id: own.id, depth: 0 })
  })

  it('moves a planned row to the current banker', async () => {
    const [expense] = await listExpense()
    await payload.update({
      collection: 'expenses',
      id: expense.id,
      data: { isPlanned: true },
      depth: 0,
    })
    await payload.update({
      collection: 'chatas',
      id: chata.id,
      depth: 0,
      context: { triggerAfterRead: false },
      data: { banker: people.other.id },
    })
    await syncListExpense(payload, chata.id, 'beer')
    const [after] = await listExpense()
    expect(String((after.payer as { value: unknown }).value)).toBe(String(people.other.id))
    await payload.update({
      collection: 'chatas',
      id: chata.id,
      depth: 0,
      context: { triggerAfterRead: false },
      data: { banker: people.banker.id },
    })
  })

  it('removes a planned row once nothing priced is left', async () => {
    const { docs: left } = await payload.find({
      collection: 'keg-items',
      where: { chata: { equals: chata.id } },
      depth: 0,
    })
    for (const item of left)
      await payload.delete({ collection: 'keg-items', id: item.id, depth: 0 })
    const result = await syncListExpense(payload, chata.id, 'beer')
    expect(result.status).toBe('removed')
    expect(await listExpense()).toHaveLength(0)
  })
})
