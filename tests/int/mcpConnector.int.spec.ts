import crypto from 'node:crypto'
import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Chata, Expense, Participant, User } from '@/payload-types'
import {
  MCP_SCOPES,
  authenticateClient,
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  registerClient,
  validateAuthorizeRequest,
  type McpAuth,
  type McpScope,
} from '@/lib/mcp/oauth'
import { payloadMcpStore } from '@/lib/mcp/store'
import { runTool } from '@/lib/mcp/tool-kit'
import { MCP_TOOLS } from '@/lib/mcp/server'
import type { Caller } from '@/lib/mcp/loopback'
import { POST as mcpPost } from '@/app/(payload)/api/mcp/route'
import { resetRateLimits } from '@/lib/rateLimit'

// The Claude connector end to end against the local database (docs/MCP.md):
// the OAuth flow on the Payload store, the /api/mcp route, and the tools
// acting as different accounts. The point of the suite is PARITY: through
// the connector an account sees and changes exactly what the web lets it.
//
// Needs the local docker-compose database (pnpm db).

let payload: Payload
const SLUG = 'vitest-mcp-connector'
const ORIGIN = 'http://localhost:3000'
let chata: Chata
const users: Record<string, User> = {}
const people: Record<string, Participant> = {}
let bobsPrivate: Expense

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
      data: { banker: null },
      depth: 0,
      context: { triggerAfterRead: false },
    })
    for (const collection of ['expenses', 'shopping-items', 'participants'] as const) {
      await payload.delete({ collection, where: { chata: { equals: found.id } }, depth: 0 })
    }
    await payload.delete({ collection: 'chatas', id: found.id, depth: 0 })
  }
  // the Users beforeDelete hook removes their connector rows
  await payload.delete({ collection: 'users', where: { email: { like: 'vitest-mcp-%' } }, depth: 0 })
}

const grants: Record<string, string> = {}

async function caller(key: string, scopes: McpScope[] = [MCP_SCOPES.READ, MCP_SCOPES.WRITE]): Promise<Caller> {
  const store = payloadMcpStore(payload)
  if (!grants[key]) {
    const grant = await store.createGrant({
      userId: users[key].id,
      clientId: (await store.createClient({
        clientName: 'Vitest',
        redirectUris: ['http://localhost/cb'],
        tokenEndpointAuthMethod: 'none',
        grantTypes: ['authorization_code'],
        clientSecretHash: null,
      })).id,
      clientName: 'Vitest',
      scopes,
    })
    grants[key] = grant.id
  }
  const auth: McpAuth = {
    token: 'test',
    clientId: '0',
    scopes,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    grantId: grants[key],
    clientName: 'Vitest',
    userId: users[key].id,
  }
  return { payload, auth, user: users[key], origin: ORIGIN }
}

async function call(key: string, tool: string, args: Record<string, unknown>, scopes?: McpScope[]) {
  const def = MCP_TOOLS.find((t) => t.name === tool)!
  const result = await runTool(def, args, await caller(key, scopes))
  const text = (result.content[0] as { text: string }).text
  return { isError: result.isError === true, text, data: result.isError ? null : JSON.parse(text) }
}

beforeAll(async () => {
  payload = await getPayload({ config: await config })
  resetRateLimits()
  await removeFixture()

  const mkUser = async (key: string, role: User['role'], extra: Partial<User> = {}) =>
    (users[key] = await payload.create({
      collection: 'users',
      depth: 0,
      data: { email: `vitest-mcp-${key}@example.com`, role, password: `vitest-${key}`, ...extra },
    }))
  await mkUser('alice', 'user', { name: 'Alice' })
  await mkUser('bob', 'user', { lastLoginAt: new Date().toISOString() })
  await mkUser('carol', 'user', { lastLoginAt: new Date().toISOString() })
  await mkUser('outsider', 'user')

  const inDays = (days: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + days)
    return `${d.toISOString().slice(0, 10)}T12:00:00.000Z`
  }
  chata = await payload.create({
    collection: 'chatas',
    depth: 0,
    context: { triggerAfterRead: false },
    data: {
      name: 'Vitest Konektor',
      shortName: 'Vitest',
      location: 'Testov',
      slug: SLUG,
      tripDateFrom: inDays(20),
      tripDateTo: inDays(23),
      shoppingListEnabled: true,
      privateInfo: [{ label: 'Wi-Fi', value: 'heslo123' }],
    },
  })
  const mk = async (name: string, account?: User) =>
    (people[name] = await payload.create({
      collection: 'participants',
      depth: 0,
      data: { name, chata: chata.id, ...(account ? { account: account.id } : {}) },
    }))
  await mk('Alice', users.alice)
  await mk('Bob', users.bob)
  await mk('Carol', users.carol)
  await mk('Dan')
  await payload.update({
    collection: 'chatas',
    id: chata.id,
    depth: 0,
    context: { triggerAfterRead: false },
    data: { banker: people.Alice.id },
  })

  await payload.create({
    collection: 'expenses',
    depth: 0,
    data: {
      chata: chata.id,
      title: 'Chata',
      amount: 8000,
      payer: { relationTo: 'participants', value: people.Alice.id },
      splitType: 'equal',
    },
  })
  bobsPrivate = await payload.create({
    collection: 'expenses',
    depth: 0,
    overrideAccess: false,
    user: { ...users.bob, collection: 'users' },
    data: {
      chata: chata.id,
      title: 'Dárek pro Alici',
      amount: 900,
      payer: { relationTo: 'participants', value: people.Bob.id },
      splitType: 'weighted',
      weights: [
        { participant: people.Bob.id, weight: 1 },
        { participant: people.Carol.id, weight: 1 },
      ],
      isPrivate: true,
    },
  })
})

afterAll(async () => {
  await removeFixture()
})

describe('the /api/mcp route', () => {
  it('challenges an unauthenticated request with the resource metadata URL', async () => {
    const res = await mcpPost(
      new Request(`${ORIGIN}/api/mcp`, {
        method: 'POST',
        headers: { host: 'localhost:3000', 'content-type': 'application/json' },
        body: '{}',
      }),
    )
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`,
    )
  })

  it('runs the full OAuth flow and serves tools to the bearer, scope-filtered', async () => {
    const store = payloadMcpStore(payload)
    const listTools = async (scope: string) => {
      const registered = await registerClient(store, {
        client_name: 'Claude',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        token_endpoint_auth_method: 'none',
      })
      const verifier = crypto.randomBytes(32).toString('base64url')
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
      const validation = await validateAuthorizeRequest(
        store,
        {
          client_id: registered.client_id,
          response_type: 'code',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          scope,
        },
        ORIGIN,
      )
      if (!validation.ok) throw new Error(validation.error)
      const code = await issueAuthorizationCode(store, validation.request, users.alice.id, validation.request.scopes)
      const client = await authenticateClient(store, new URLSearchParams({ client_id: registered.client_id }), null)
      const tokens = await exchangeAuthorizationCode(
        store,
        new URLSearchParams({ code, code_verifier: verifier }),
        client,
        ORIGIN,
      )
      const rpc = async (method: string, params: unknown, id: number) => {
        const res = await mcpPost(
          new Request(`${ORIGIN}/api/mcp`, {
            method: 'POST',
            headers: {
              host: 'localhost:3000',
              authorization: `Bearer ${tokens.access_token}`,
              'content-type': 'application/json',
              accept: 'application/json, text/event-stream',
              'mcp-protocol-version': '2025-06-18',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          }),
        )
        expect(res.status).toBe(200)
        return (await res.json()) as { result: any }
      }
      await rpc(
        'initialize',
        { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vitest', version: '1' } },
        1,
      )
      const tools = await rpc('tools/list', {}, 2)
      const context = await rpc('tools/call', { name: 'get_context', arguments: {} }, 3)
      return {
        names: (tools.result.tools as Array<{ name: string }>).map((t) => t.name),
        context: JSON.parse(context.result.content[0].text),
      }
    }

    const full = await listTools('travel:read travel:write')
    expect(full.names).toContain('create_expense')
    expect(full.names).toContain('get_finances')
    expect(full.context.account.email).toBe(users.alice.email)
    expect(full.context.chatas.map((c: any) => c.slug)).toContain(SLUG)
    expect(full.context.chatas.find((c: any) => c.slug === SLUG).i_am_banker).toBe(true)

    const readOnly = await listTools('travel:read')
    expect(readOnly.names).toContain('list_expenses')
    expect(readOnly.names).not.toContain('create_expense')
    expect(readOnly.names).not.toContain('delete_expense')
  })
})

describe('reading through the connector = reading on the web', () => {
  it('shows keys and Wi-Fi to the signed-in account', async () => {
    const { data } = await call('outsider', 'get_chata', { chata: SLUG })
    expect(data.keys_and_wifi).toEqual([{ label: 'Wi-Fi', value: 'heslo123' }])
    expect(data.participants.find((p: any) => p.name === 'Alice').is_banker).toBe(true)
  })

  it('a private expense exists only for its circle', async () => {
    const alice = await call('alice', 'list_expenses', { chata: SLUG })
    expect(alice.data.expenses.map((e: any) => e.id)).not.toContain(bobsPrivate.id)
    const carol = await call('carol', 'list_expenses', { chata: SLUG, filter: 'private' })
    expect(carol.data.expenses.map((e: any) => e.id)).toEqual([bobsPrivate.id])
    const finances = await call('carol', 'get_finances', { chata: SLUG })
    expect(finances.data.breakdowns[0].private_expenses.i_owe[0]).toMatchObject({ amount: 450, pay_to: 'Bob' })
  })

  it("withholds the figures of people who keep theirs private, except one's own", async () => {
    const { data } = await call('alice', 'get_finances', { chata: SLUG })
    const names = data.people.map((p: any) => p.name)
    expect(names).toContain('Alice')
    expect(names).toContain('Dan')
    expect(names).not.toContain('Carol')
    expect(data.withheld_people).toContain('Carol')
    const own = await call('carol', 'get_finances', { chata: SLUG })
    expect(own.data.people.map((p: any) => p.name)).toContain('Carol')
  })
})

describe('writing through the connector = writing on the web', () => {
  it('adds an own expense, approved and logged', async () => {
    const { data, isError, text } = await call('alice', 'create_expense', {
      chata: SLUG,
      title: 'Nákup',
      amount: 1200,
    })
    expect(isError, text).toBe(false)
    expect(data.created.approval).toBe('approved')
    const log = await call('alice', 'list_recent_changes', { chata: SLUG })
    expect(log.data.changes[0]).toMatchObject({ tool: 'create_expense', action: 'create' })
  })

  it('a dry run writes nothing', async () => {
    const { data } = await call('alice', 'create_expense', {
      chata: SLUG,
      title: 'Jen zkouška',
      amount: 10,
      dry_run: true,
    })
    expect(data.dry_run).toBe(true)
    const list = await call('alice', 'list_expenses', { chata: SLUG, search: 'Jen zkouška' })
    expect(list.data.count).toBe(0)
  })

  it('an expense somebody else paid waits for them; only they (or the banker) decide', async () => {
    const created = await call('carol', 'create_expense', {
      chata: SLUG,
      title: 'Benzín',
      amount: 1500,
      payer: 'Bob',
    })
    expect(created.data.created.approval).toBe('pending')
    const id = created.data.created.id

    const outsider = await call('outsider', 'decide_expense', { expense_id: id, decision: 'approve' })
    expect(outsider.isError).toBe(true)

    const bob = await call('bob', 'decide_expense', { expense_id: id, decision: 'approve' })
    expect(bob.isError, bob.text).toBe(false)
    const after = await call('bob', 'list_expenses', { chata: SLUG, search: 'Benzín' })
    expect(after.data.expenses[0].approval).toBe('approved')
  })

  it("cannot change somebody else's expense", async () => {
    const mine = await call('alice', 'create_expense', { chata: SLUG, title: 'Pivo', amount: 300 })
    const attempt = await call('bob', 'update_expense', { expense_id: mine.data.created.id, amount: 1 })
    expect(attempt.isError).toBe(true)
  })

  it('refuses writes on a read-only connection', async () => {
    const result = await call('alice', 'create_expense', { chata: SLUG, title: 'X', amount: 1 }, [MCP_SCOPES.READ])
    expect(result.isError).toBe(true)
    expect(result.text).toContain('read-only')
  })

  it('a participant outside the chata cannot add to its shopping list; the banker tidies anything', async () => {
    const refused = await call('outsider', 'add_shopping_item', { chata: SLUG, title: 'Sýr' })
    expect(refused.isError).toBe(true)
    const added = await call('bob', 'add_shopping_item', { chata: SLUG, title: 'Chleba', quantity: 2 })
    expect(added.isError, added.text).toBe(false)
    const tidied = await call('alice', 'update_shopping_item', { item_id: added.data.created.id, quantity: 3 })
    expect(tidied.isError, tidied.text).toBe(false)
    const list = await call('carol', 'get_shopping_list', { chata: SLUG })
    expect(list.data.items.find((i: any) => i.title === 'Chleba').quantity).toBe(3)
  })
})

describe('account deletion', () => {
  it("removes the account's connections and logged changes", async () => {
    await call('outsider', 'get_context', {})
    const grantId = Number(grants.outsider)
    await payload.delete({ collection: 'users', id: users.outsider.id, depth: 0 })
    const left = await payload.count({ collection: 'mcp-grants', where: { id: { equals: grantId } }, overrideAccess: true })
    expect(left.totalDocs).toBe(0)
  })
})
