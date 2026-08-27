import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { REST_POST } from '@payloadcms/next/routes'
import jwt from 'jsonwebtoken'
import { exportParticipantBundle } from '@/utils/participantRights'

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

// ── the real endpoint, through Payload's REST route ─────────────────────
// The settlement tests above write through the bypass context; these hit
// POST /api/expenses/private-settle the way the browser does, session
// cookie included, so authorization, anti-enumeration and the payable-row
// rules are exercised end to end.
const settlePost = REST_POST(config)

const sessionCookie = (user: User): string =>
  `payload-token=${jwt.sign(
    { id: user.id, email: user.email, collection: 'users' },
    process.env.PAYLOAD_SECRET!,
    { expiresIn: 600 },
  )}`

const callSettle = async (
  user: User | null,
  body: unknown,
): Promise<{ status: number; json: { error?: string; ok?: boolean } }> => {
  const request = new Request('http://localhost:3000/api/expenses/private-settle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Cookie: sessionCookie(user) } : {}),
    },
    body: JSON.stringify(body),
  })
  const response = await settlePost(request, {
    params: Promise.resolve({ slug: ['expenses', 'private-settle'] }),
  })
  return { status: response.status, json: await response.json() }
}

describe('POST /api/expenses/private-settle (real endpoint)', () => {
  // the shared privateExpense gets declassified by an earlier test, so this
  // block keeps its own gift
  let gift: Expense
  beforeAll(async () => {
    gift = await payload.create({
      collection: 'expenses',
      depth: 0,
      ...asUser(users.payer),
      data: {
        chata: chata.id,
        title: 'Endpointový dárek',
        amount: 1200,
        payer: { relationTo: 'participants', value: people.Martin.id },
        splitType: 'weighted',
        weights: [
          { participant: people.Martin.id, weight: 1 },
          { participant: people.Tereza.id, weight: 1 },
        ],
        isPrivate: true,
      },
    })
  })
  afterAll(async () => {
    await payload.delete({ collection: 'expenses', id: gift.id, depth: 0 })
  })

  it('lets a member mark and unmark their own row', async () => {
    const mark = await callSettle(users.member, {
      items: [{ expenseId: gift.id, participantId: people.Tereza.id }],
      settled: true,
    })
    expect(mark.status).toBe(200)
    expect(mark.json.ok).toBe(true)
    let fresh = await payload.findByID({ collection: 'expenses', id: gift.id, depth: 0 })
    expect(fresh.privateSettlements).toHaveLength(1)

    const unmark = await callSettle(users.member, {
      items: [{ expenseId: gift.id, participantId: people.Tereza.id }],
      settled: false,
    })
    expect(unmark.status).toBe(200)
    fresh = await payload.findByID({ collection: 'expenses', id: gift.id, depth: 0 })
    expect(fresh.privateSettlements ?? []).toEqual([])
  })

  it('answers the same not-found for public, nonexistent and out-of-circle probes', async () => {
    for (const [who, expenseId] of [
      [users.target, () => gift.id],
      [users.banker, () => gift.id],
      [users.chataAdmin, () => gift.id],
      [users.member, () => publicExpense.id],
      [users.member, () => 999999],
    ] as const) {
      const res = await callSettle(who, {
        items: [{ expenseId: expenseId(), participantId: people.Tereza.id }],
        settled: true,
      })
      expect(res.status, `${who.email} on expense ${expenseId()}`).toBe(404)
      expect(res.json.error).toBe('not-found')
    }
  })

  it('refuses anonymous callers and malformed bodies', async () => {
    const anon = await callSettle(null, {
      items: [{ expenseId: gift.id, participantId: people.Tereza.id }],
      settled: true,
    })
    expect(anon.status).toBe(401)
    const bad = await callSettle(users.member, { items: 'nope', settled: true })
    expect(bad.status).toBe(400)
  })

  it('refuses planned expenses and zero-share members', async () => {
    const planned = await payload.create({
      collection: 'expenses',
      depth: 0,
      ...asUser(users.payer),
      data: {
        chata: chata.id,
        title: 'Plánovaný dárek',
        amount: 900,
        payer: { relationTo: 'participants', value: people.Martin.id },
        splitType: 'weighted',
        weights: [{ participant: people.Tereza.id, weight: 1 }],
        isPlanned: true,
        isPrivate: true,
      },
    })
    const zeroShare = await payload.create({
      collection: 'expenses',
      depth: 0,
      ...asUser(users.payer),
      data: {
        chata: chata.id,
        title: 'Dárek s nulovým podílem',
        amount: 500,
        payer: { relationTo: 'participants', value: people.Martin.id },
        splitType: 'weighted',
        weights: [
          { participant: people.Tereza.id, weight: 0 },
          { participant: people.Ondra.id, weight: 1 },
        ],
        isPrivate: true,
      },
    })
    try {
      const onPlanned = await callSettle(users.payer, {
        items: [{ expenseId: planned.id, participantId: people.Tereza.id }],
        settled: true,
      })
      expect(onPlanned.status).toBe(404)
      const onZero = await callSettle(users.payer, {
        items: [{ expenseId: zeroShare.id, participantId: people.Tereza.id }],
        settled: true,
      })
      expect(onZero.status).toBe(404)
    } finally {
      await payload.delete({ collection: 'expenses', id: planned.id, depth: 0 })
      await payload.delete({ collection: 'expenses', id: zeroShare.id, depth: 0 })
    }
  })
})

describe('the payer stays the writer (review P0)', () => {
  it("rejects a PATCH that names somebody else's participant as payer", async () => {
    const gift = await payload.create({
      collection: 'expenses',
      depth: 0,
      ...asUser(users.payer),
      data: {
        chata: chata.id,
        title: 'Dárek k přepsání',
        amount: 700,
        payer: { relationTo: 'participants', value: people.Martin.id },
        splitType: 'weighted',
        weights: [{ participant: people.Tereza.id, weight: 1 }],
        isPrivate: true,
      },
    })
    try {
      await expect(
        payload.update({
          collection: 'expenses',
          id: gift.id,
          depth: 0,
          data: { payer: { relationTo: 'participants', value: people.Katka.id } },
          ...asUser(users.payer),
        }),
      ).rejects.toThrow(/plátce/i)
      // and it never reached the approval queue (no email leak path)
      const fresh = await payload.findByID({ collection: 'expenses', id: gift.id, depth: 0 })
      expect(fresh.approvalStatus).toBe('approved')
      expect(refIdOf(fresh.payer)).toBe(String(people.Martin.id))
    } finally {
      await payload.delete({ collection: 'expenses', id: gift.id, depth: 0 })
    }
  })
})

describe('authorship grants no private access (review P1)', () => {
  it('an author whose payer link was cut loses REST access to the private row', async () => {
    const gift = await payload.create({
      collection: 'expenses',
      depth: 0,
      ...asUser(users.payer),
      data: {
        chata: chata.id,
        title: 'Dárek bez autora',
        amount: 600,
        payer: { relationTo: 'participants', value: people.Martin.id },
        splitType: 'weighted',
        weights: [{ participant: people.Tereza.id, weight: 1 }],
        isPrivate: true,
      },
    })
    // simulate an account relink: Martin's participant loses its account,
    // the Participants hook re-stamps payerAccount to null
    await payload.update({
      collection: 'participants',
      id: people.Martin.id,
      depth: 0,
      data: { account: null },
    })
    try {
      const ids = await findExpenseIds(users.payer)
      expect(ids).not.toContain(gift.id)
      await expect(
        payload.update({
          collection: 'expenses',
          id: gift.id,
          depth: 0,
          data: { title: 'stále moje?' },
          ...asUser(users.payer),
        }),
      ).rejects.toThrow()
    } finally {
      await payload.update({
        collection: 'participants',
        id: people.Martin.id,
        depth: 0,
        data: { account: users.payer.id },
      })
      await payload.delete({ collection: 'expenses', id: gift.id, depth: 0 })
    }
  })
})

describe('rights exports keep private expenses in the circle (review P4)', () => {
  it("a bundle of the same account's participant on ANOTHER trip carries no private titles", async () => {
    // Martin's account also owns a participant on a second chata; that
    // participant is neither payer nor member of the gift, so their bundle
    // must not mention it — not even through the account-wide authored list
    const otherChata = await payload.create({
      collection: 'chatas',
      depth: 0,
      context: { triggerAfterRead: false },
      data: {
        name: 'Vitest — druhá chata',
        shortName: 'Vitest 2',
        location: 'Testov',
        slug: `${SLUG}-2`,
      },
    })
    const otherMartin = await payload.create({
      collection: 'participants',
      depth: 0,
      data: { name: 'Martin', chata: otherChata.id, account: users.payer.id },
    })
    const gift = await payload.create({
      collection: 'expenses',
      depth: 0,
      ...asUser(users.payer),
      data: {
        chata: chata.id,
        title: 'Exportní překvapení',
        amount: 800,
        payer: { relationTo: 'participants', value: people.Martin.id },
        splitType: 'weighted',
        weights: [{ participant: people.Tereza.id, weight: 1 }],
        isPrivate: true,
      },
    })
    try {
      const bundle = await exportParticipantBundle(payload, otherMartin.id)
      expect(JSON.stringify(bundle)).not.toContain('Exportní překvapení')
      // the sanity half: HIS OWN bundle on the gift's chata still carries it
      const ownBundle = await exportParticipantBundle(payload, people.Martin.id)
      expect(JSON.stringify(ownBundle)).toContain('Exportní překvapení')
    } finally {
      await payload.delete({ collection: 'expenses', id: gift.id, depth: 0 })
      await payload.delete({ collection: 'participants', id: otherMartin.id, depth: 0 })
      await payload.delete({ collection: 'chatas', id: otherChata.id, depth: 0 })
    }
  })
})

const refIdOf = (ref: unknown): string | null => {
  if (ref == null) return null
  if (typeof ref === 'object' && 'value' in (ref as object)) {
    const value = (ref as { value: unknown }).value
    return value != null ? String(typeof value === 'object' ? (value as { id: unknown }).id : value) : null
  }
  return String(typeof ref === 'object' ? (ref as { id: unknown }).id : ref)
}
