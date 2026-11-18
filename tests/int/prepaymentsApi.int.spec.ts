import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Chata, Participant, Prepayment, User } from '@/payload-types'
import {
  canManagePrepayments,
  prepaymentProblem,
  signedPrepaymentAmount,
} from '@/lib/prepayments'

// Payments between people and the banker (src/collections/Prepayments.ts):
// the banker of a chata and its admins record them without the admin panel;
// everybody else only reads. Pure rules first, then the access matrix against
// the real local API.
//
// Needs the local docker-compose database (pnpm db), like api.int.spec.ts.

describe('prepayment rules (pure)', () => {
  it('stores money to the banker positive and money from the banker negative', () => {
    expect(signedPrepaymentAmount('advance', 500)).toBe(500)
    expect(signedPrepaymentAmount('supplement', -500)).toBe(500)
    expect(signedPrepaymentAmount('refund', 500)).toBe(-500)
    expect(signedPrepaymentAmount('distribution', 500)).toBe(-500)
  })

  it('refuses a sign that disagrees with the type, zero and absurd amounts', () => {
    expect(prepaymentProblem({ type: 'advance', amount: 500 })).toBeNull()
    expect(prepaymentProblem({ type: 'refund', amount: -500 })).toBeNull()
    expect(prepaymentProblem({ type: 'advance', amount: -500 })).toBe('sign')
    expect(prepaymentProblem({ type: 'refund', amount: 500 })).toBe('sign')
    expect(prepaymentProblem({ type: 'advance', amount: 0 })).toBe('amount')
    expect(prepaymentProblem({ type: 'advance', amount: 5_000_000 })).toBe('amount')
    expect(prepaymentProblem({ type: 'advance', amount: Number.NaN })).toBe('amount')
    expect(prepaymentProblem({ type: 'gift', amount: 5 })).toBe('type')
  })

  it('the banker and chata admins manage, nobody else', () => {
    expect(canManagePrepayments({ managesChata: false, isBanker: true })).toBe(true)
    expect(canManagePrepayments({ managesChata: true, isBanker: false })).toBe(true)
    expect(canManagePrepayments({ managesChata: false, isBanker: false })).toBe(false)
  })
})

let payload: Payload

const SLUG = 'vitest-prepayments'
const OTHER_SLUG = 'vitest-prepayments-other'

let chata: Chata
let otherChata: Chata
const users: Record<string, User> = {}
const people: Record<string, Participant> = {}
let otherPerson: Participant

const asUser = (u: User | undefined) =>
  ({ overrideAccess: false, user: u ? { ...u, collection: 'users' } : undefined }) as const

async function removeFixture() {
  for (const slug of [SLUG, OTHER_SLUG]) {
    const existing = await payload.find({
      collection: 'chatas',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      context: { triggerAfterRead: false },
    })
    const found = existing.docs[0]
    if (!found) continue
    await payload.update({
      collection: 'chatas',
      id: found.id,
      data: { banker: null },
      depth: 0,
      context: { triggerAfterRead: false },
    })
    for (const collection of ['prepayments', 'participants'] as const) {
      await payload.delete({ collection, where: { chata: { equals: found.id } }, depth: 0 })
    }
    await payload.delete({ collection: 'chatas', id: found.id, depth: 0 })
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: 'vitest-prepay-%' } },
    depth: 0,
  })
}

const advance = (from: Participant, amount = 500) => ({
  chata: chata.id,
  from: { relationTo: 'participants' as const, value: from.id },
  amount,
  type: 'advance' as const,
})

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await removeFixture()

  const mkChata = (slug: string, name: string) =>
    payload.create({
      collection: 'chatas',
      depth: 0,
      context: { triggerAfterRead: false },
      data: { name, shortName: name, location: 'Test', slug },
    })
  chata = await mkChata(SLUG, 'Vitest zálohy')
  otherChata = await mkChata(OTHER_SLUG, 'Vitest jinde')

  const mkUser = async (key: string, role: User['role'], extra: Partial<User> = {}) =>
    (users[key] = await payload.create({
      collection: 'users',
      depth: 0,
      data: { email: `vitest-prepay-${key}@example.com`, role, password: `vitest-${key}-not-used`, ...extra },
    }))
  await mkUser('banker', 'user')
  await mkUser('member', 'user')
  await mkUser('chataAdmin', 'admin', { assignedChatas: [chata.id] })
  await mkUser('foreignAdmin', 'admin', { assignedChatas: [otherChata.id] })

  const mkPerson = async (key: string, account?: User) =>
    (people[key] = await payload.create({
      collection: 'participants',
      depth: 0,
      data: { name: `Vitest ${key}`, chata: chata.id, ...(account ? { account: account.id } : {}) },
    }))
  await mkPerson('banker', users.banker)
  await mkPerson('member', users.member)
  await mkPerson('kid')
  otherPerson = await payload.create({
    collection: 'participants',
    depth: 0,
    data: { name: 'Vitest jinde', chata: otherChata.id, account: users.banker.id },
  })
  await payload.update({
    collection: 'chatas',
    id: chata.id,
    depth: 0,
    context: { triggerAfterRead: false },
    data: { banker: people.banker.id },
  })
}, 60_000)

afterAll(async () => {
  await removeFixture()
})

describe('prepayments: who writes', () => {
  let bankersRow: Prepayment

  it('the banker records a payment from anybody in the chata', async () => {
    bankersRow = await payload.create({
      collection: 'prepayments',
      depth: 0,
      data: advance(people.member),
      ...asUser(users.banker),
    })
    expect(bankersRow.amount).toBe(500)
  })

  it('a participant who is not the banker cannot, not even for themselves', async () => {
    await expect(
      payload.create({ collection: 'prepayments', depth: 0, data: advance(people.member), ...asUser(users.member) }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'prepayments',
        id: bankersRow.id,
        depth: 0,
        data: { amount: 1 },
        ...asUser(users.member),
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({ collection: 'prepayments', id: bankersRow.id, depth: 0, ...asUser(users.member) }),
    ).rejects.toThrow()
  })

  it('anonymous visitors cannot write', async () => {
    await expect(
      payload.create({ collection: 'prepayments', depth: 0, data: advance(people.member), ...asUser(undefined) }),
    ).rejects.toThrow()
  })

  it("an admin of another chata cannot write into this one (create was open to every admin before)", async () => {
    await expect(
      payload.create({
        collection: 'prepayments',
        depth: 0,
        data: advance(people.member),
        ...asUser(users.foreignAdmin),
      }),
    ).rejects.toThrow()
  })

  it('the banker keeps the sign matching the type', async () => {
    await expect(
      payload.create({
        collection: 'prepayments',
        depth: 0,
        data: { ...advance(people.member), amount: -500 },
        ...asUser(users.banker),
      }),
    ).rejects.toThrow()
    const refund = await payload.create({
      collection: 'prepayments',
      depth: 0,
      data: { ...advance(people.kid), type: 'refund', amount: -120 },
      ...asUser(users.banker),
    })
    expect(refund.amount).toBe(-120)
  })

  it('the banker edits and deletes rows of their chata', async () => {
    const updated = await payload.update({
      collection: 'prepayments',
      id: bankersRow.id,
      depth: 0,
      data: { amount: 700, type: 'supplement', note: 'Doplatek' },
      ...asUser(users.banker),
    })
    expect(updated).toMatchObject({ amount: 700, type: 'supplement', note: 'Doplatek' })
  })

  it("the banker cannot move a row to a chata they don't keep the money of", async () => {
    await expect(
      payload.update({
        collection: 'prepayments',
        id: bankersRow.id,
        depth: 0,
        data: { chata: otherChata.id, from: { relationTo: 'participants', value: otherPerson.id } },
        ...asUser(users.banker),
      }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'prepayments',
        depth: 0,
        data: {
          chata: otherChata.id,
          from: { relationTo: 'participants', value: otherPerson.id },
          amount: 100,
          type: 'advance',
        },
        ...asUser(users.banker),
      }),
    ).rejects.toThrow()
  })

  it('the chata admin keeps the admin panel freedom', async () => {
    const row = await payload.create({
      collection: 'prepayments',
      depth: 0,
      data: { ...advance(people.kid), amount: -50 },
      ...asUser(users.chataAdmin),
    })
    expect(row.amount).toBe(-50)
    await payload.delete({ collection: 'prepayments', id: row.id, depth: 0, ...asUser(users.chataAdmin) })
  })

  it("the banker fixes a legacy row's note without touching its odd sign, but can't re-sign it wrong", async () => {
    const legacy = await payload.create({
      collection: 'prepayments',
      depth: 0,
      data: { ...advance(people.kid), amount: -50 },
    })
    const noted = await payload.update({
      collection: 'prepayments',
      id: legacy.id,
      depth: 0,
      data: { note: 'opraveno', amount: -50, type: 'advance' },
      ...asUser(users.banker),
    })
    expect(noted).toMatchObject({ note: 'opraveno', amount: -50, type: 'advance' })
    await expect(
      payload.update({
        collection: 'prepayments',
        id: legacy.id,
        depth: 0,
        data: { amount: -60 },
        ...asUser(users.banker),
      }),
    ).rejects.toThrow()
    await payload.delete({ collection: 'prepayments', id: legacy.id, depth: 0 })
  })

  it('a former banker loses access once the banker changes', async () => {
    await payload.update({
      collection: 'chatas',
      id: chata.id,
      depth: 0,
      context: { triggerAfterRead: false },
      data: { banker: people.member.id },
    })
    try {
      await expect(
        payload.delete({ collection: 'prepayments', id: bankersRow.id, depth: 0, ...asUser(users.banker) }),
      ).rejects.toThrow()
      await payload.delete({ collection: 'prepayments', id: bankersRow.id, depth: 0, ...asUser(users.member) })
    } finally {
      await payload.update({
        collection: 'chatas',
        id: chata.id,
        depth: 0,
        context: { triggerAfterRead: false },
        data: { banker: people.banker.id },
      })
    }
  })
})
