import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, afterEach, expect, vi } from 'vitest'
import type { PayloadRequest } from 'payload'
import { rohlikEndpoints } from '@/collections/ShoppingItems/rohlikEndpoints'
import { encryptToken } from '@/lib/rohlik/crypto'
import {
  ROHLIK_REDIRECT_URI,
  ROHLIK_STATE_COOKIE,
  signConnectState,
} from '@/lib/rohlik/oauth'
import { getAccessToken, rohlikConnectionStatus } from '@/utils/rohlikConnection'
import type { Chata, Participant, ShoppingItem, User } from '@/payload-types'

// The "Nákup" access matrix (src/collections/ShoppingItems.ts) against the
// real local API with its own fixture chata: participants add for
// themselves, edit only their own items; the banker and chata admins tidy
// everything; outsiders and anonymous visitors only read.
//
// Needs the local docker-compose database (pnpm db), like api.int.spec.ts.

let payload: Payload

const SLUG = 'vitest-shopping'

let chata: Chata
const users: Record<string, User> = {}
const people: Record<string, Participant> = {}
let authorItem: ShoppingItem

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
    for (const collection of ['shopping-items', 'participants'] as const) {
      await payload.delete({ collection, where: { chata: { equals: found.id } }, depth: 0 })
    }
    await payload.delete({ collection: 'chatas', id: found.id, depth: 0 })
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: 'vitest-shopping-%' } },
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
        email: `vitest-shopping-${key}@example.com`,
        role,
        password: `vitest-${key}-not-used`,
      },
    }))
  await mkUser('author', 'user')
  await mkUser('other', 'user')
  await mkUser('banker', 'user')
  await mkUser('outsider', 'user')
  await mkUser('chataAdmin', 'admin')

  chata = await payload.create({
    collection: 'chatas',
    depth: 0,
    context: { triggerAfterRead: false },
    data: {
      name: 'Vitest nákup',
      shortName: 'Nákup',
      location: 'Test',
      slug: SLUG,
      shoppingListEnabled: true,
    },
  })
  const mkPerson = async (key: string, account?: User) =>
    (people[key] = await payload.create({
      collection: 'participants',
      depth: 0,
      data: { name: `Vitest ${key}`, chata: chata.id, ...(account ? { account: account.id } : {}) },
    }))
  await mkPerson('author', users.author)
  await mkPerson('authorsChild', users.author)
  await mkPerson('other', users.other)
  await mkPerson('banker', users.banker)

  await payload.update({
    collection: 'chatas',
    id: chata.id,
    depth: 0,
    context: { triggerAfterRead: false },
    data: { banker: people.banker.id },
  })
  users.chataAdmin = await payload.update({
    collection: 'users',
    id: users.chataAdmin.id,
    depth: 0,
    data: { assignedChatas: [chata.id] },
  })

  authorItem = await payload.create({
    collection: 'shopping-items',
    depth: 0,
    data: { chata: chata.id, title: 'Mléko', quantity: 2 },
    ...asUser(users.author),
  })
}, 60_000)

afterAll(async () => {
  await removeFixture()
})

describe('shopping-items create', () => {
  it('stamps the author and defaults to their first participant', () => {
    expect(String(authorItem.authoredBy)).toBe(String(users.author.id))
    expect(String(authorItem.participant)).toBe(String(people.author.id))
  })

  it('lets a parent add for their own child', async () => {
    const item = await payload.create({
      collection: 'shopping-items',
      depth: 0,
      data: { chata: chata.id, title: 'Džus', quantity: 1, participant: people.authorsChild.id },
      ...asUser(users.author),
    })
    expect(String(item.participant)).toBe(String(people.authorsChild.id))
  })

  it('refuses adding on behalf of somebody else', async () => {
    await expect(
      payload.create({
        collection: 'shopping-items',
        depth: 0,
        data: { chata: chata.id, title: 'Pivo', quantity: 1, participant: people.other.id },
        ...asUser(users.author),
      }),
    ).rejects.toThrow()
  })

  it('refuses an account without a participant in the chata', async () => {
    await expect(
      payload.create({
        collection: 'shopping-items',
        depth: 0,
        data: { chata: chata.id, title: 'Chipsy', quantity: 1 },
        ...asUser(users.outsider),
      }),
    ).rejects.toThrow()
  })

  it('refuses anonymous writes', async () => {
    await expect(
      payload.create({
        collection: 'shopping-items',
        depth: 0,
        data: { chata: chata.id, title: 'Chipsy', quantity: 1 },
        ...asUser(undefined),
      }),
    ).rejects.toThrow()
  })

  it('never trusts product fields from the body: an unverifiable product becomes free text', async () => {
    // the fixture banker has no Rohlík connection, so nothing can be verified
    const item = await payload.create({
      collection: 'shopping-items',
      depth: 0,
      data: {
        chata: chata.id,
        title: 'Rohlíky',
        quantity: 10,
        rohlik: {
          productId: '1234',
          name: 'Rohlík',
          price: 1,
          url: 'javascript:alert(1)',
          imageUrl: 'https://cdn.example.com/rohlik.jpg',
        },
        sentToCartAt: new Date().toISOString(),
        sentQuantity: 10,
      },
      ...asUser(users.author),
    })
    expect(item.rohlik?.productId ?? null).toBeNull()
    expect(item.rohlik?.price ?? null).toBeNull()
    expect(item.rohlik?.url ?? null).toBeNull()
    expect(item.rohlik?.imageUrl ?? null).toBeNull()
    expect(item.title).toBe('Rohlíky')
    expect(item.sentToCartAt ?? null).toBeNull()
    expect(item.sentQuantity ?? null).toBeNull()
  })

  it('keeps a stored product when the body repeats its id with other details', async () => {
    // a verified product as the trusted path stores it (no user = server)
    const stored = await payload.create({
      collection: 'shopping-items',
      depth: 0,
      data: {
        chata: chata.id,
        title: 'Pivo Braník',
        quantity: 2,
        participant: people.author.id,
        authoredBy: users.author.id,
        rohlik: {
          productId: '1290309',
          name: 'Pivo Braník',
          price: 50.9,
          amount: '2 l',
          imageUrl: 'https://cdn.rohlik.cz/images/grocery/products/1290309/1.jpg',
          url: 'https://www.rohlik.cz/1290309',
        },
      },
    })
    const same = await payload.update({
      collection: 'shopping-items',
      id: stored.id,
      depth: 0,
      data: { title: 'Rohlíky', rohlik: { productId: '1290309', name: 'Rohlíky', price: 1 } },
      ...asUser(users.author),
    })
    expect(same.rohlik?.name).toBe('Pivo Braník')
    expect(same.rohlik?.price).toBe(50.9)
    expect(same.title).toBe('Pivo Braník')

    // a different id must verify on Rohlík; without a connection it can't
    const swapped = await payload.update({
      collection: 'shopping-items',
      id: stored.id,
      depth: 0,
      data: { rohlik: { productId: '9999999', name: 'Pivo Braník', price: 50.9 } },
      ...asUser(users.author),
    })
    expect(swapped.rohlik?.productId ?? null).toBeNull()
  })
})

describe('shopping-items update and delete', () => {
  it('lets the author change their own item', async () => {
    const updated = await payload.update({
      collection: 'shopping-items',
      id: authorItem.id,
      depth: 0,
      data: { quantity: 3 },
      ...asUser(users.author),
    })
    expect(updated.quantity).toBe(3)
  })

  it('refuses another participant', async () => {
    await expect(
      payload.update({
        collection: 'shopping-items',
        id: authorItem.id,
        depth: 0,
        data: { quantity: 99 },
        ...asUser(users.other),
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({ collection: 'shopping-items', id: authorItem.id, ...asUser(users.other) }),
    ).rejects.toThrow()
  })

  it('lets the banker tidy any item without changing whose it is', async () => {
    const updated = await payload.update({
      collection: 'shopping-items',
      id: authorItem.id,
      depth: 0,
      data: { quantity: 4 },
      ...asUser(users.banker),
    })
    expect(updated.quantity).toBe(4)
    expect(String(updated.participant)).toBe(String(people.author.id))
    expect(String(updated.authoredBy)).toBe(String(users.author.id))
  })

  it('never moves an item to another chata', async () => {
    await expect(
      payload.update({
        collection: 'shopping-items',
        id: authorItem.id,
        depth: 0,
        data: { chata: chata.id + 100000 },
        ...asUser(users.author),
      }),
    ).rejects.toThrow()
  })

  it('reads publicly', async () => {
    const found = await payload.find({
      collection: 'shopping-items',
      where: { chata: { equals: chata.id } },
      depth: 0,
      ...asUser(undefined),
    })
    expect(found.docs.length).toBeGreaterThan(0)
  })

  it('lets a chata admin delete any item', async () => {
    await payload.delete({
      collection: 'shopping-items',
      id: authorItem.id,
      ...asUser(users.chataAdmin),
    })
    const gone = await payload.find({
      collection: 'shopping-items',
      where: { id: { equals: authorItem.id } },
      depth: 0,
    })
    expect(gone.docs).toHaveLength(0)
  })
})

describe('a closed shopping list', () => {
  it('takes no changes from participants until it reopens', async () => {
    const setClosed = (closedAt: string | null) =>
      payload.update({
        collection: 'chatas',
        id: chata.id,
        depth: 0,
        context: { triggerAfterRead: false },
        data: { shoppingClosedAt: closedAt },
      })
    await setClosed(new Date().toISOString())
    await expect(
      payload.create({
        collection: 'shopping-items',
        depth: 0,
        data: { chata: chata.id, title: 'Pozdě', quantity: 1 },
        ...asUser(users.author),
      }),
    ).rejects.toThrow()
    await setClosed(null)
    const item = await payload.create({
      collection: 'shopping-items',
      depth: 0,
      data: { chata: chata.id, title: 'Včas', quantity: 1 },
      ...asUser(users.author),
    })
    expect(item.title).toBe('Včas')
  })
})

describe('connecting Rohlík by pasting the redirect', () => {
  const endpoint = (path: string) => rohlikEndpoints.find((e) => e.path === path)!
  const complete = (user: User | undefined, url: unknown, cookie?: string) =>
    endpoint('/rohlik/complete').handler({
      payload,
      user: user ? { ...user, collection: 'users' } : null,
      headers: new Headers(cookie ? { cookie: `${ROHLIK_STATE_COOKIE}=${cookie}` } : {}),
      json: async () => ({ chata: chata.id, url }),
    } as unknown as PayloadRequest)
  const stateFor = (overrides: { chataId?: string; nonce?: string } = {}) =>
    signConnectState(
      {
        userId: String(users.banker.id),
        chataId: overrides.chataId ?? String(chata.id),
        clientId: 'client-test',
        redirectUri: ROHLIK_REDIRECT_URI,
        verifier: 'verifier',
        nonce: overrides.nonce ?? 'nonce-1',
      },
      process.env.PAYLOAD_SECRET!,
    )
  const pastedUrl = `${ROHLIK_REDIRECT_URI}?code=abc&state=nonce-1`
  const errorOf = async (res: Response) => ((await res.json()) as { error?: string }).error

  it('lets only the banker start or finish', async () => {
    for (const user of [users.author, users.chataAdmin, undefined]) {
      const started = await endpoint('/rohlik/connect').handler({
        payload,
        user: user ? { ...user, collection: 'users' } : null,
        json: async () => ({ chata: chata.id }),
      } as unknown as PayloadRequest)
      expect(started.status).toBe(403)
      expect((await complete(user, pastedUrl, stateFor())).status).toBe(403)
    }
  })

  it('refuses a paste that is not the redirect, and says so', async () => {
    const res = await complete(users.banker, 'https://www.rohlik.cz/', stateFor())
    expect(res.status).toBe(400)
    expect(await errorOf(res)).toBe('invalid-url')
    const denied = await complete(
      users.banker,
      `${ROHLIK_REDIRECT_URI}?error=access_denied&state=nonce-1`,
      stateFor(),
    )
    expect(await errorOf(denied)).toBe('denied')
  })

  it('needs the state cookie of this very attempt, for this chata', async () => {
    for (const cookie of [
      undefined,
      stateFor({ nonce: 'an-older-attempt' }),
      stateFor({ chataId: String(chata.id + 100_000) }),
    ]) {
      const res = await complete(users.banker, pastedUrl, cookie)
      expect(res.status).toBe(400)
      expect(await errorOf(res)).toBe('expired')
    }
  })
})

describe('refreshing the banker\'s Rohlík token', () => {
  const secret = () => process.env.PAYLOAD_SECRET!
  const seal = (value: string) => encryptToken(value, secret())

  afterEach(async () => {
    vi.unstubAllGlobals()
    await payload.delete({
      collection: 'rohlik-connections',
      where: { user: { equals: users.banker.id } },
      overrideAccess: true,
    })
  })

  const expiredConnection = () =>
    payload.create({
      collection: 'rohlik-connections',
      overrideAccess: true,
      data: {
        user: users.banker.id,
        clientId: 'client-test',
        redirectUri: ROHLIK_REDIRECT_URI,
        accessToken: seal('old-access'),
        refreshToken: seal('old-refresh'),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        connectedAt: new Date().toISOString(),
      },
    })

  const refusal = () =>
    new Response(JSON.stringify({ error: 'invalid_grant' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })

  it('keeps the connection when a parallel request refreshed first', async () => {
    const row = await expiredConnection()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // the other request wins the race and rotates the pair
        await payload.update({
          collection: 'rohlik-connections',
          id: row.id,
          overrideAccess: true,
          data: {
            accessToken: seal('fresh-access'),
            refreshToken: seal('fresh-refresh'),
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        })
        return refusal()
      }),
    )
    expect(await getAccessToken(payload, users.banker.id)).toBe('fresh-access')
    expect((await rohlikConnectionStatus(payload, users.banker.id)).connected).toBe(true)
  })

  it('drops the connection when Rohlík refuses it for good', async () => {
    await expiredConnection()
    vi.stubGlobal('fetch', vi.fn(async () => refusal()))
    expect(await getAccessToken(payload, users.banker.id)).toBeNull()
    expect((await rohlikConnectionStatus(payload, users.banker.id)).connected).toBe(false)
  })

  it('keeps the connection through a Rohlík outage', async () => {
    await expiredConnection()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    expect(await getAccessToken(payload, users.banker.id)).toBeNull()
    expect((await rohlikConnectionStatus(payload, users.banker.id)).connected).toBe(true)
  })
})
