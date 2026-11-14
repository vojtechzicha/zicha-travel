// Storage for the connector's OAuth server (src/lib/mcp/oauth.ts): the
// Payload collections in src/collections/McpConnector.ts in production, an
// in-memory implementation for the unit tests. Every Payload call overrides
// access — the collections are closed to everybody through the API.

import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { refId } from '@/lib/access'
import type { McpScope } from './oauth'

export interface McpClientRow {
  id: string
  clientName: string
  redirectUris: string[]
  tokenEndpointAuthMethod: string
  grantTypes: string[]
  clientSecretHash: string | null
}

export type McpTokenKind = 'code' | 'access' | 'refresh'

export interface McpTokenRow {
  kind: McpTokenKind
  clientId: string
  userId: number | null
  grantId: string | null
  clientName: string | null
  scopes: McpScope[]
  resource: string | null
  redirectUri: string | null
  codeChallenge: string | null
  expiresAt: Date
  usedAt?: Date | null
}

export interface McpGrantRow {
  id: string
  userId: number
  clientId: string
  clientName: string
  scopes: McpScope[]
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

export interface McpStore {
  createClient(data: Omit<McpClientRow, 'id'>): Promise<McpClientRow>
  getClient(id: string): Promise<McpClientRow | null>
  insertToken(hash: string, row: Omit<McpTokenRow, 'usedAt'>): Promise<void>
  getToken(hash: string): Promise<McpTokenRow | null>
  /** Atomically marks an unused token of this kind as used and returns it; null when already used or missing. */
  consumeToken(hash: string, kind: McpTokenKind): Promise<McpTokenRow | null>
  deleteToken(hash: string): Promise<void>
  createGrant(data: {
    userId: number
    clientId: string
    clientName: string
    scopes: McpScope[]
  }): Promise<McpGrantRow>
  getGrant(id: string): Promise<McpGrantRow | null>
  listGrants(userId: number): Promise<McpGrantRow[]>
  touchGrant(id: string): Promise<void>
  revokeGrant(id: string): Promise<void>
  userExists(userId: number): Promise<boolean>
  stampUserActivity(userId: number): Promise<void>
}

const date = (value: unknown): Date | null => (value ? new Date(value as string) : null)
const idOrNull = (value: unknown): string | null => (value == null ? null : refId(value))

// ─── Payload (production) ───────────────────────────────────────────────────

type Doc = Record<string, unknown>

function toClient(doc: Doc): McpClientRow {
  return {
    id: String(doc.id),
    clientName: String(doc.clientName ?? ''),
    redirectUris: Array.isArray(doc.redirectUris) ? (doc.redirectUris as string[]) : [],
    tokenEndpointAuthMethod: String(doc.tokenEndpointAuthMethod ?? 'none'),
    grantTypes: Array.isArray(doc.grantTypes) ? (doc.grantTypes as string[]) : [],
    clientSecretHash: (doc.clientSecretHash as string | null | undefined) ?? null,
  }
}

function toToken(doc: Doc): McpTokenRow {
  return {
    kind: doc.kind as McpTokenKind,
    clientId: refId(doc.client),
    userId: doc.user == null ? null : Number(refId(doc.user)),
    grantId: idOrNull(doc.grant),
    clientName: (doc.clientName as string | null | undefined) ?? null,
    scopes: Array.isArray(doc.scopes) ? (doc.scopes as McpScope[]) : [],
    resource: (doc.resource as string | null | undefined) ?? null,
    redirectUri: (doc.redirectUri as string | null | undefined) ?? null,
    codeChallenge: (doc.codeChallenge as string | null | undefined) ?? null,
    expiresAt: new Date(doc.expiresAt as string),
    usedAt: date(doc.usedAt),
  }
}

function toGrant(doc: Doc): McpGrantRow {
  return {
    id: String(doc.id),
    userId: Number(refId(doc.user)),
    clientId: doc.client == null ? '' : refId(doc.client),
    clientName: String(doc.clientName ?? ''),
    scopes: Array.isArray(doc.scopes) ? (doc.scopes as McpScope[]) : [],
    createdAt: new Date(doc.createdAt as string),
    lastUsedAt: date(doc.lastUsedAt),
    revokedAt: date(doc.revokedAt),
  }
}

const numericId = (id: string): number | null => {
  const n = Number(id)
  return Number.isInteger(n) && n > 0 ? n : null
}

export function payloadMcpStore(payload: Payload): McpStore {
  const findTokenDoc = async (hash: string): Promise<Doc | null> => {
    const result = await payload.find({
      collection: 'mcp-tokens',
      where: { tokenHash: { equals: hash } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return (result.docs[0] as unknown as Doc | undefined) ?? null
  }

  return {
    async createClient(data) {
      const doc = await payload.create({
        collection: 'mcp-clients',
        data,
        depth: 0,
        overrideAccess: true,
      })
      return toClient(doc as unknown as Doc)
    },

    async getClient(id) {
      const n = numericId(id)
      if (n == null) return null
      const doc = await payload
        .findByID({ collection: 'mcp-clients', id: n, depth: 0, overrideAccess: true })
        .catch(() => null)
      return doc ? toClient(doc as unknown as Doc) : null
    },

    async insertToken(hash, row) {
      await payload.create({
        collection: 'mcp-tokens',
        data: {
          tokenHash: hash,
          kind: row.kind,
          client: Number(row.clientId),
          user: row.userId,
          grant: row.grantId == null ? null : Number(row.grantId),
          clientName: row.clientName,
          scopes: row.scopes,
          resource: row.resource,
          redirectUri: row.redirectUri,
          codeChallenge: row.codeChallenge,
          expiresAt: row.expiresAt.toISOString(),
        },
        depth: 0,
        overrideAccess: true,
      })
    },

    async getToken(hash) {
      const doc = await findTokenDoc(hash)
      return doc ? toToken(doc) : null
    },

    async consumeToken(hash, kind) {
      // One UPDATE … RETURNING, so two requests racing with the same code or
      // refresh token can never both win (Payload's update would read first)
      const drizzle = (payload.db as unknown as { drizzle?: { execute: (q: unknown) => Promise<unknown> } })
        .drizzle
      if (!drizzle) throw new Error('Database driver unavailable')
      const result = (await drizzle.execute(
        sql`UPDATE mcp_tokens SET used_at = now()
            WHERE token_hash = ${hash} AND kind = ${kind} AND used_at IS NULL
            RETURNING id`,
      )) as { rows?: Array<{ id: number }> } | Array<{ id: number }>
      const rows = Array.isArray(result) ? result : (result.rows ?? [])
      if (rows.length === 0) return null
      const doc = await payload
        .findByID({ collection: 'mcp-tokens', id: rows[0].id, depth: 0, overrideAccess: true })
        .catch(() => null)
      return doc ? toToken(doc as unknown as Doc) : null
    },

    async deleteToken(hash) {
      await payload.delete({
        collection: 'mcp-tokens',
        where: { tokenHash: { equals: hash } },
        depth: 0,
        overrideAccess: true,
      })
    },

    async createGrant(data) {
      const doc = await payload.create({
        collection: 'mcp-grants',
        data: {
          user: data.userId,
          client: Number(data.clientId),
          clientName: data.clientName,
          scopes: data.scopes,
          lastUsedAt: new Date().toISOString(),
        },
        depth: 0,
        overrideAccess: true,
      })
      return toGrant(doc as unknown as Doc)
    },

    async getGrant(id) {
      const n = numericId(id)
      if (n == null) return null
      const doc = await payload
        .findByID({ collection: 'mcp-grants', id: n, depth: 0, overrideAccess: true })
        .catch(() => null)
      return doc ? toGrant(doc as unknown as Doc) : null
    },

    async listGrants(userId) {
      const result = await payload.find({
        collection: 'mcp-grants',
        where: { and: [{ user: { equals: userId } }, { revokedAt: { exists: false } }] },
        sort: '-createdAt',
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      return result.docs.map((doc) => toGrant(doc as unknown as Doc))
    },

    async touchGrant(id) {
      await payload.update({
        collection: 'mcp-grants',
        id: Number(id),
        data: { lastUsedAt: new Date().toISOString() },
        depth: 0,
        overrideAccess: true,
      })
    },

    async revokeGrant(id) {
      const grantId = Number(id)
      await payload.update({
        collection: 'mcp-grants',
        id: grantId,
        data: { revokedAt: new Date().toISOString() },
        depth: 0,
        overrideAccess: true,
      })
      // Tokens of a revoked grant are dead anyway (usableGrant); dropping
      // them keeps the table small and leaves nothing to leak
      await payload.delete({
        collection: 'mcp-tokens',
        where: { grant: { equals: grantId } },
        depth: 0,
        overrideAccess: true,
      })
    },

    async userExists(userId) {
      const user = await payload
        .findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
        .catch(() => null)
      return user != null
    },

    async stampUserActivity(userId) {
      await payload
        .update({
          collection: 'users',
          id: userId,
          data: { lastLoginAt: new Date().toISOString() },
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => undefined)
    },
  }
}

// ─── In memory (tests) ──────────────────────────────────────────────────────

export function memoryMcpStore(users: Set<number> = new Set([1])): McpStore & {
  activity: number[]
  tokens: Map<string, McpTokenRow>
} {
  let nextId = 1
  const clients = new Map<string, McpClientRow>()
  const tokens = new Map<string, McpTokenRow>()
  const grants = new Map<string, McpGrantRow>()
  const activity: number[] = []

  return {
    activity,
    tokens,
    async createClient(data) {
      const row = { ...data, id: String(nextId++) }
      clients.set(row.id, row)
      return row
    },
    async getClient(id) {
      return clients.get(id) ?? null
    },
    async insertToken(hash, row) {
      tokens.set(hash, { ...row, usedAt: null })
    },
    async getToken(hash) {
      return tokens.get(hash) ?? null
    },
    async consumeToken(hash, kind) {
      const row = tokens.get(hash)
      if (!row || row.kind !== kind || row.usedAt) return null
      row.usedAt = new Date()
      return row
    },
    async deleteToken(hash) {
      tokens.delete(hash)
    },
    async createGrant(data) {
      const row: McpGrantRow = {
        ...data,
        id: String(nextId++),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        revokedAt: null,
      }
      grants.set(row.id, row)
      return row
    },
    async getGrant(id) {
      return grants.get(id) ?? null
    },
    async listGrants(userId) {
      return [...grants.values()].filter((g) => g.userId === userId && !g.revokedAt)
    },
    async touchGrant(id) {
      const row = grants.get(id)
      if (row) row.lastUsedAt = new Date()
    },
    async revokeGrant(id) {
      const row = grants.get(id)
      if (row) row.revokedAt = new Date()
      for (const [hash, token] of tokens) if (token.grantId === id) tokens.delete(hash)
    },
    async userExists(userId) {
      return users.has(userId)
    },
    async stampUserActivity(userId) {
      activity.push(userId)
    },
  }
}
