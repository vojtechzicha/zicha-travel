import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Chata, Expense, JointAccount, Participant, User } from '@/payload-types'

// The private-expense access matrix (docs/PRD-soukromy-vydaj.md), exercised
// against the real local API with its own fixture chata: the circle is the
// payer, the split members and superadmins — chata admins, the banker and
// the surprise target get nothing, not even through a blind write.
//
// Needs the local docker-compose database (pnpm db), like api.int.spec.ts.

let payload: Payload

const SLUG = 'vitest-private-expenses'

let chata: Chata
let jointAccount: JointAccount
const users: Record<string, User> = {}
const people: Record<string, Participant> = {}
let privateExpense: Expense
let publicExpense: Expense

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
  if (!found) return
  for (const collection of ['expenses', 'joint-accounts', 'participants'] as const) {
    await payload.delete({
      collection,
      where: { chata: { equals: found.id } },
      depth: 0,
    })
  }
  await payload.delete({ collection: 'chatas', id: found.id, depth: 0 })
  await payload.delete({
    collection: 'users',
    where: { email: { like: 'vitest-private-%' } },
    depth: 0,
  })
}

beforeAll(async () => {
  const payloadConfig = await config
  payload = await getPayload({ config: payloadConfig })
  await removeFixture()

  const mkUser = async (key: string, role: User['role']) =>
    (users[key] = await payload.create({
      collection: 'users',
      depth: 0,
      data: {
        email: `vitest-private-${key}@example.com`,
        role,
        password: `vitest-${key}-not-used`,
      },
    }))
  await mkUser('superadmin', 'superadmin')
  await mkUser('chataAdmin', 'admin')
  await mkUser('payer', 'user')
  await mkUser('member', 'user')
  await mkUser('target', 'user')
  await mkUser('banker', 'user')
  await mkUser('outsider', 'user')

  chata = await payload.create({
    collection: 'chatas',
    depth: 0,
    context: { triggerAfterRead: false },
    data: {
      name: 'Vitest — soukromé výdaje',
      shortName: 'Vitest',
      location: 'Testov',
      slug: SLUG,
    },
  })
  await payload.update({
    collection: 'users',
    id: users.chataAdmin.id,
    depth: 0,
    data: { assignedChatas: [chata.id] },
  })
  users.chataAdmin = await payload.findByID({
    collection: 'users',
    id: users.chataAdmin.id,
    depth: 0,
  })

  const mkParticipant = async (name: string, account?: User) =>
    (people[name] = await payload.create({
      collection: 'participants',
      depth: 0,
      data: { name, chata: chata.id, ...(account ? { account: account.id } : {}) },
    }))
  await mkParticipant('Martin', users.payer)
  await mkParticipant('Tereza', users.member)
  await mkParticipant('Ondra')
  await mkParticipant('Katka', users.target)
  await mkParticipant('Vojta', users.banker)

  await payload.update({
    collection: 'chatas',
    id: chata.id,
    depth: 0,
    context: { triggerAfterRead: false },
    data: { banker: people.Vojta.id },
  })

  jointAccount = await payload.create({
    collection: 'joint-accounts',
    depth: 0,
    data: {
      name: 'Martin + Tereza',
      chata: chata.id,
      members: [people.Martin.id, people.Tereza.id],
    },
  })

  // The private gift, created through the real authoring path (the payer's
  // own frontend account)
  privateExpense = await payload.create({
    collection: 'expenses',
    depth: 0,
    ...asUser(users.payer),
    data: {
      chata: chata.id,
      title: 'Dárek pro Katku',
      amount: 2400,
      payer: { relationTo: 'participants', value: people.Martin.id },
      splitType: 'weighted',
      weights: [
        { participant: people.Martin.id, weight: 1 },
        { participant: people.Tereza.id, weight: 1 },
        { participant: people.Ondra.id, weight: 1 },
      ],
      isPrivate: true,
    },
  })
  publicExpense = await payload.create({
    collection: 'expenses',
    depth: 0,
    ...asUser(users.payer),
    data: {
      chata: chata.id,
      title: 'Nákup potravin',
      amount: 600,
      payer: { relationTo: 'participants', value: people.Martin.id },
      splitType: 'equal',
    },
  })
})

afterAll(async () => {
  await removeFixture()
})

const findExpenseIds = async (viewer: User | undefined) => {
  const result = await payload.find({
    collection: 'expenses',
    where: { chata: { equals: chata.id } },
    depth: 0,
    limit: 100,
    ...asUser(viewer),
  })
  return result.docs.map((d) => d.id)
}

describe('who may read a private expense (REST access)', () => {
  it('is created approved, never pending', () => {
    expect(privateExpense.approvalStatus).toBe('approved')
    expect(privateExpense.isPrivate).toBe(true)
  })

  it('anonymous readers, the target, the banker, non-payer members and outsiders get nothing', async () => {
    for (const viewer of [undefined, users.target, users.banker, users.outsider, users.member]) {
      const ids = await findExpenseIds(viewer)
      expect(ids, `viewer ${viewer?.email ?? 'anonymous'}`).not.toContain(privateExpense.id)
      expect(ids, `viewer ${viewer?.email ?? 'anonymous'}`).toContain(publicExpense.id)
    }
  })

  it('chata admins get nothing either — by id, by list, or via a blind write', async () => {
    expect(await findExpenseIds(users.chataAdmin)).not.toContain(privateExpense.id)
    await expect(
      payload.findByID({
        collection: 'expenses',
        id: privateExpense.id,
        depth: 0,
        ...asUser(users.chataAdmin),
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'expenses',
        id: privateExpense.id,
        depth: 0,
        data: { title: 'odhaleno' },
        ...asUser(users.chataAdmin),
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({
        collection: 'expenses',
        id: privateExpense.id,
        depth: 0,
        ...asUser(users.chataAdmin),
      }),
    ).rejects.toThrow()
  })

  it('the target account cannot write to it blindly either', async () => {
    await expect(
      payload.update({
        collection: 'expenses',
        id: privateExpense.id,
        depth: 0,
        data: { title: 'odhaleno' },
        ...asUser(users.target),
      }),
    ).rejects.toThrow()
  })

  it("the payer's account and superadmins see it (REST); the other members go through the slug API", async () => {
    expect(await findExpenseIds(users.payer)).toContain(privateExpense.id)
    expect(await findExpenseIds(users.superadmin)).toContain(privateExpense.id)
  })

  it('the chata stats carry no trace of it', async () => {
    const doc = await payload.findByID({
      collection: 'chatas',
      id: chata.id,
      depth: 0,
      ...asUser(undefined),
    })
    const stats = (doc as unknown as { _stats?: { totalExpenses: number } })._stats
    expect(stats?.totalExpenses).toBe(600)
  })
})

describe('the structural invariants', () => {
  const base = () => ({
    chata: chata.id,
    title: 'Pokus',
    amount: 500,
    payer: { relationTo: 'participants' as const, value: people.Martin.id },
    splitType: 'weighted' as const,
    weights: [{ participant: people.Tereza.id, weight: 1 }],
    isPrivate: true,
  })

  it('rejects an equal split, a joint-account payer, a refund and invitations', async () => {
    await expect(
      payload.create({
        collection: 'expenses',
        depth: 0,
        ...asUser(users.payer),
        data: { ...base(), splitType: 'equal' },
      }),
    ).rejects.toThrow(/podíl/i)
    await expect(
      payload.create({
        collection: 'expenses',
        depth: 0,
        ...asUser(users.payer),
        data: {
          ...base(),
          payer: { relationTo: 'joint-accounts', value: jointAccount.id },
        },
      }),
    ).rejects.toThrow(/účastník/i)
    await expect(
      payload.create({
        collection: 'expenses',
        depth: 0,
        ...asUser(users.payer),
        data: { ...base(), amount: -500 },
      }),
    ).rejects.toThrow(/částku/i)
    await expect(
      payload.create({
        collection: 'expenses',
        depth: 0,
        ...asUser(users.payer),
        data: {
          ...base(),
          invitations: [{ host: people.Martin.id, guest: people.Tereza.id }],
        },
      }),
    ).rejects.toThrow(/pozvání/i)
  })

  it('rejects a creator who is not the payer — chata admins included', async () => {
    await expect(
      payload.create({
        collection: 'expenses',
        depth: 0,
        ...asUser(users.member),
        data: base(),
      }),
    ).rejects.toThrow(/plátce/i)
    await expect(
      payload.create({
        collection: 'expenses',
        depth: 0,
        ...asUser(users.chataAdmin),
        data: base(),
      }),
    ).rejects.toThrow(/plátce/i)
  })

  it('a public expense can never become private', async () => {
    await expect(
      payload.update({
        collection: 'expenses',
        id: publicExpense.id,
        depth: 0,
        data: { isPrivate: true },
        ...asUser(users.payer),
      }),
    ).rejects.toThrow(/soukrom/i)
  })

  it('adds no auto paidBy invitation rows to a private expense', async () => {
    await payload.update({
      collection: 'participants',
      id: people.Ondra.id,
      depth: 0,
      data: { paidBy: people.Tereza.id },
    })
    try {
      const created = await payload.create({
        collection: 'expenses',
        depth: 0,
        ...asUser(users.payer),
        data: {
          ...base(),
          weights: [{ participant: people.Ondra.id, weight: 1 }],
        },
      })
      expect(created.invitations ?? []).toEqual([])
      await payload.delete({ collection: 'expenses', id: created.id, depth: 0 })
    } finally {
      await payload.update({
        collection: 'participants',
        id: people.Ondra.id,
        depth: 0,
        data: { paidBy: null },
      })
    }
  })
})

describe('settlement marks', () => {
  const markSettled = (participantId: number) =>
    payload.update({
      collection: 'expenses',
      id: privateExpense.id,
      depth: 0,
      overrideAccess: true,
      context: { expensePrivateSettle: true, skipExpenseApprovalEffects: true },
      data: {
        privateSettlements: [
          { participant: participantId, settledAt: new Date().toISOString() },
        ],
      },
    })

  it('is server-owned: a frontend PATCH cannot plant a mark', async () => {
    const updated = await payload.update({
      collection: 'expenses',
      id: privateExpense.id,
      depth: 0,
      data: {
        privateSettlements: [
          { participant: people.Tereza.id, settledAt: new Date().toISOString() },
        ],
      },
      ...asUser(users.payer),
    })
    expect(updated.privateSettlements ?? []).toEqual([])
  })

  it('survives an innocent edit but resets when the debt changes', async () => {
    await markSettled(people.Tereza.id)
    const renamed = await payload.update({
      collection: 'expenses',
      id: privateExpense.id,
      depth: 0,
      data: { title: 'Dárek pro Katku (upřesněno)' },
      ...asUser(users.payer),
    })
    expect(renamed.privateSettlements).toHaveLength(1)

    const repriced = await payload.update({
      collection: 'expenses',
      id: privateExpense.id,
      depth: 0,
      data: { amount: 2500 },
      ...asUser(users.payer),
    })
    expect(repriced.privateSettlements ?? []).toEqual([])
  })

  it('declassifying wipes the marks and stays a one-way door', async () => {
    await markSettled(people.Tereza.id)
    const declassified = await payload.update({
      collection: 'expenses',
      id: privateExpense.id,
      depth: 0,
      data: { isPrivate: false },
      ...asUser(users.payer),
    })
    expect(declassified.isPrivate).toBe(false)
    expect(declassified.privateSettlements ?? []).toEqual([])
    await expect(
      payload.update({
        collection: 'expenses',
        id: privateExpense.id,
        depth: 0,
        data: { isPrivate: true },
        ...asUser(users.payer),
      }),
    ).rejects.toThrow(/soukrom/i)
  })
})
