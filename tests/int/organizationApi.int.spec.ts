import { getPayload, Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Chata, Participant, User } from '@/payload-types'
import { organizationEndpoints } from '@/collections/Chatas/organizationEndpoints'

// POST /api/chatas/:id/organization against the real local API (advisory
// lock + transaction + Payload's own validation of the rewritten arrays),
// with its own fixture chata. Needs the local docker-compose database.

let payload: Payload
const SLUG = 'vitest-organization'
let chata: Chata
const users: Record<string, User> = {}
const people: Record<string, Participant> = {}

const handler = organizationEndpoints[0].handler

async function call(user: User | undefined, body: Record<string, unknown>) {
  const req = {
    user: user ? { ...user, collection: 'users' } : null,
    payload,
    routeParams: { id: String(chata.id) },
    json: async () => body,
  } as unknown as PayloadRequest
  const res = await handler(req)
  return { status: res.status, body: (await res.json()) as { ok?: boolean; error?: string } }
}

async function reload(): Promise<Chata> {
  return (await payload.findByID({
    collection: 'chatas',
    id: chata.id,
    depth: 0,
    context: { triggerAfterRead: false },
  })) as Chata
}

const roomPeople = (c: Chata, roomName: string) =>
  (c.rooms ?? [])
    .find((r) => r.name === roomName)!
    .beds!.flatMap((b) => b.occupants ?? [])
    .map((o) => String(typeof o.participant === 'object' ? o.participant.id : o.participant))

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
    await payload.update({
      collection: 'chatas',
      id: found.id,
      data: { rooms: [], sharedCars: [], banker: null },
      depth: 0,
      context: { triggerAfterRead: false },
    })
    await payload.delete({
      collection: 'participants',
      where: { chata: { equals: found.id } },
      depth: 0,
    })
    await payload.delete({ collection: 'chatas', id: found.id, depth: 0 })
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: 'vitest-org-%' } },
    depth: 0,
  })
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  await removeFixture()
  const mkUser = async (key: string) =>
    (users[key] = await payload.create({
      collection: 'users',
      depth: 0,
      data: { email: `vitest-org-${key}@example.com`, role: 'user', password: `vitest-${key}-x` },
    }))
  await mkUser('parent')
  await mkUser('other')
  await mkUser('banker')
  await mkUser('outsider')

  chata = (await payload.create({
    collection: 'chatas',
    depth: 0,
    context: { triggerAfterRead: false },
    data: {
      name: 'Vitest organizace',
      shortName: 'Org',
      location: 'Test',
      slug: SLUG,
      tripDateFrom: '2026-11-13T12:00:00.000Z',
      tripDateTo: '2026-11-15T12:00:00.000Z',
      bedroomOrganizationEnabled: true,
      sharedCarsEnabled: true,
    },
  })) as Chata
  const mk = async (key: string, account?: User) =>
    (people[key] = await payload.create({
      collection: 'participants',
      depth: 0,
      data: { name: `Org ${key}`, chata: chata.id, ...(account ? { account: account.id } : {}) },
    }))
  await mk('parent', users.parent)
  await mk('child', users.parent)
  await mk('other', users.other)
  await mk('banker', users.banker)

  chata = (await payload.update({
    collection: 'chatas',
    id: chata.id,
    depth: 0,
    context: { triggerAfterRead: false },
    data: {
      banker: people.banker.id,
      rooms: [
        { name: 'Velký', maxSleepingSpaces: 2, beds: [{ name: 'Manželská' }] },
        { name: 'Malý', maxSleepingSpaces: 1, beds: [{ name: 'Gauč' }] },
      ],
      sharedCars: [{ name: 'Auto pokladníka', seats: 3, driver: people.banker.id }],
    },
  })) as Chata
}, 60_000)

afterAll(async () => {
  await removeFixture()
})

const room = (name: string) => chata.rooms!.find((r) => r.name === name)!
const bedOf = (name: string) => room(name).beds![0]

describe('beds', () => {
  it('refuses anonymous and outsider writes', async () => {
    expect(
      (await call(undefined, { action: 'bed.leave', participantId: people.parent.id })).status,
    ).toBe(401)
    expect(
      (await call(users.outsider, { action: 'bed.leave', participantId: people.parent.id })).status,
    ).toBe(403)
  })

  it('places a participant and their child', async () => {
    const big = room('Velký')
    for (const who of [people.parent, people.child]) {
      const res = await call(users.parent, {
        action: 'bed.place',
        roomId: big.id,
        bedId: bedOf('Velký').id,
        participantId: who.id,
      })
      expect(res).toEqual({ status: 200, body: { ok: true } })
    }
    expect(roomPeople(await reload(), 'Velký').sort()).toEqual(
      [String(people.parent.id), String(people.child.id)].sort(),
    )
  })

  it('refuses a full room and moving somebody else', async () => {
    const big = room('Velký')
    expect(
      await call(users.other, {
        action: 'bed.place',
        roomId: big.id,
        bedId: bedOf('Velký').id,
        participantId: people.other.id,
      }),
    ).toEqual({ status: 409, body: { error: 'room-full' } })
    expect(
      (
        await call(users.other, {
          action: 'bed.place',
          roomId: room('Malý').id,
          bedId: bedOf('Malý').id,
          participantId: people.parent.id,
        })
      ).status,
    ).toBe(403)
  })

  it('lets the banker move anybody', async () => {
    const res = await call(users.banker, {
      action: 'bed.place',
      roomId: room('Malý').id,
      bedId: bedOf('Malý').id,
      participantId: people.child.id,
    })
    expect(res.status).toBe(200)
    const now = await reload()
    expect(roomPeople(now, 'Malý')).toEqual([String(people.child.id)])
    expect(roomPeople(now, 'Velký')).toEqual([String(people.parent.id)])
  })

  it('lets a participant leave their bed', async () => {
    expect(
      (await call(users.parent, { action: 'bed.leave', participantId: people.parent.id })).status,
    ).toBe(200)
    expect(roomPeople(await reload(), 'Velký')).toEqual([])
  })
})

describe('the last free place', () => {
  it('goes to exactly one of two simultaneous requests', async () => {
    // empty the one-place room, then race for it
    await call(users.banker, { action: 'bed.leave', participantId: people.child.id })
    const target = { action: 'bed.place', roomId: room('Malý').id, bedId: bedOf('Malý').id }
    const results = await Promise.all([
      call(users.parent, { ...target, participantId: people.parent.id }),
      call(users.other, { ...target, participantId: people.other.id }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(roomPeople(await reload(), 'Malý')).toHaveLength(1)
  })
})

describe('cars', () => {
  const bankerCar = () => chata.sharedCars!.find((c) => c.name === 'Auto pokladníka')!

  it('lets a participant offer their car and others ride along', async () => {
    expect(
      await call(users.other, {
        action: 'car.offer',
        driverId: people.other.id,
        car: { name: 'Fabia', seats: 2, equipment: ['Kytara'] },
      }),
    ).toEqual({ status: 200, body: { ok: true } })
    const now = await reload()
    const fabia = now.sharedCars!.find((c) => c.name === 'Fabia')!
    expect(String(fabia.driver)).toBe(String(people.other.id))
    expect(fabia.equipment?.map((e) => e.name)).toEqual(['Kytara'])

    expect(
      (
        await call(users.parent, {
          action: 'car.seat',
          carId: fabia.id,
          participantId: people.parent.id,
          seat: 'front',
        })
      ).status,
    ).toBe(200)
    expect(
      await call(users.parent, {
        action: 'car.seat',
        carId: fabia.id,
        participantId: people.child.id,
        seat: 'back',
      }),
    ).toEqual({ status: 409, body: { error: 'car-full' } })
  })

  it('keeps a driver out of other cars and other people out of their car settings', async () => {
    expect(
      await call(users.other, {
        action: 'car.seat',
        carId: bankerCar().id,
        participantId: people.other.id,
        seat: 'back',
      }),
    ).toEqual({ status: 409, body: { error: 'is-driver' } })
    expect((await call(users.parent, { action: 'car.remove', carId: bankerCar().id })).status).toBe(
      403,
    )
  })

  it('lets the driver edit their car but not below its riders', async () => {
    const fabia = (await reload()).sharedCars!.find((c) => c.name === 'Fabia')!
    expect(
      await call(users.other, {
        action: 'car.update',
        carId: fabia.id,
        car: { name: 'Fabia', seats: 1 },
      }),
    ).toEqual({ status: 409, body: { error: 'seats-too-few' } })
    expect(
      (
        await call(users.other, {
          action: 'car.update',
          carId: fabia.id,
          car: { name: 'Fabia combi', seats: 5 },
        })
      ).status,
    ).toBe(200)
  })

  it('lets an organizer withdraw anybody’s car', async () => {
    const fabia = (await reload()).sharedCars!.find((c) => c.name === 'Fabia combi')!
    expect((await call(users.banker, { action: 'car.remove', carId: fabia.id })).status).toBe(200)
    expect((await reload()).sharedCars!.map((c) => c.name)).toEqual(['Auto pokladníka'])
  })

  it('rejects unknown actions and participants from elsewhere', async () => {
    expect((await call(users.parent, { action: 'nope' })).body).toEqual({ error: 'invalid' })
    expect(
      (await call(users.banker, { action: 'bed.leave', participantId: 99999999 })).body,
    ).toEqual({
      error: 'invalid',
    })
  })
})
