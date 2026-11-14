// OAuth 2.1 authorization server for the remote MCP endpoint (/api/mcp), so
// a Claude connector can act for ONE zicha.travel account. Clients register
// dynamically (RFC 7591), use PKCE (S256) and get opaque tokens stored only
// as SHA-256 hashes. Ported from zicha-study / toggl-track-quick-view; the
// difference is that this app has many accounts: the consent page approves
// for the signed-in account, the grant belongs to it, and every tool runs as
// that account with exactly its web rights (src/lib/mcp/loopback.ts).
//
// Storage goes through the McpStore interface (src/lib/mcp/store.ts): the
// Payload collections in production, an in-memory store in the unit tests.

import crypto from 'node:crypto'
import type { McpClientRow, McpGrantRow, McpStore } from './store'

export const MCP_SCOPES = {
  READ: 'travel:read',
  WRITE: 'travel:write',
} as const

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES]

export const MCP_SUPPORTED_SCOPES: McpScope[] = [MCP_SCOPES.READ, MCP_SCOPES.WRITE]

export const MCP_PATH = '/api/mcp'

export const OAUTH_PATHS = {
  authorize: '/oauth/authorize',
  token: '/api/mcp/oauth/token',
  register: '/api/mcp/oauth/register',
  revoke: '/api/mcp/oauth/revoke',
} as const

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60
export const AUTH_CODE_TTL_SECONDS = 5 * 60

const ACCESS_TOKEN_PREFIX = 'ztr_at_'
const REFRESH_TOKEN_PREFIX = 'ztr_rt_'
const AUTH_CODE_PREFIX = 'ztr_ac_'
const CLIENT_SECRET_PREFIX = 'ztr_cs_'

// Claude's OAuth callbacks (claude.ai and claude.com connectors).
export const CLAUDE_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
]

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export class OAuthError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'OAuthError'
    this.code = code
    this.status = status
  }
}

// ─── Origin and URLs ────────────────────────────────────────────────────────

interface HeaderReader {
  get(name: string): string | null
}

/**
 * Public origin of the request, e.g. https://zicha.travel. Every host the
 * deployment serves (apex, chata subdomains, previews, localhost) is its own
 * issuer, and tokens are bound to the origin that issued them, so a
 * production token never works on a preview deployment.
 */
export function getPublicOrigin(headers: HeaderReader): string {
  const host =
    headers.get('x-forwarded-host')?.split(',')[0].trim() || headers.get('host') || 'localhost:3000'
  const forwardedProto = headers.get('x-forwarded-proto')?.split(',')[0].trim()
  const isLoopback = LOOPBACK_HOSTS.has(host.replace(/:\d+$/, ''))
  const proto = forwardedProto || (isLoopback ? 'http' : 'https')
  return `${proto}://${host}`
}

export function getMcpResourceUrl(origin: string): string {
  return `${origin}${MCP_PATH}`
}

export function getProtectedResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`
}

export function getAuthorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${OAUTH_PATHS.authorize}`,
    token_endpoint: `${origin}${OAUTH_PATHS.token}`,
    registration_endpoint: `${origin}${OAUTH_PATHS.register}`,
    revocation_endpoint: `${origin}${OAUTH_PATHS.revoke}`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: MCP_SUPPORTED_SCOPES,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/napoveda/claude`,
  }
}

export function getProtectedResourceMetadata(origin: string) {
  return {
    resource: getMcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: MCP_SUPPORTED_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'zicha.travel',
    resource_documentation: `${origin}/napoveda/claude`,
    resource_policy_uri: `${origin}/soukromi`,
    resource_tos_uri: `${origin}/podminky`,
  }
}

function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '')
}

// ─── Primitives ─────────────────────────────────────────────────────────────

export function hashSecret(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function randomSecret(prefix: string): string {
  return prefix + crypto.randomBytes(32).toString('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/
const PKCE_CHALLENGE = /^[A-Za-z0-9\-_]{43}$/

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!PKCE_VERIFIER.test(verifier)) return false
  const computed = crypto.createHash('sha256').update(verifier).digest('base64url')
  return safeEqual(computed, challenge)
}

/**
 * Only Claude's own callbacks and loopback addresses (Claude Code, the MCP
 * Inspector — RFC 8252 native clients) may receive codes. Nobody else can
 * register a client that turns a person's consent into a token elsewhere.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.hash) return false
  if (CLAUDE_REDIRECT_URIS.includes(uri)) return true
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
}

/** Space-separated scope string → known scopes. Empty means "everything". */
export function parseScopes(scope: string | null | undefined): McpScope[] {
  const requested = (scope || '')
    .split(' ')
    .map((s) => s.trim())
    .filter(Boolean)
  if (requested.length === 0) return [...MCP_SUPPORTED_SCOPES]
  const unknown = requested.filter((s) => !MCP_SUPPORTED_SCOPES.includes(s as McpScope))
  if (unknown.length > 0) {
    throw new OAuthError('invalid_scope', `Unknown scope: ${unknown.join(' ')}`)
  }
  // Write access is meaningless without read access.
  const scopes = new Set<McpScope>(requested as McpScope[])
  scopes.add(MCP_SCOPES.READ)
  return MCP_SUPPORTED_SCOPES.filter((s) => scopes.has(s))
}

// ─── Client registration (RFC 7591) ─────────────────────────────────────────

const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const
type AuthMethod = (typeof AUTH_METHODS)[number]
const GRANT_TYPES = ['authorization_code', 'refresh_token']

export async function registerClient(store: McpStore, metadata: Record<string, unknown>) {
  const redirectUris = metadata.redirect_uris
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris must list 1–10 URIs.')
  }
  for (const uri of redirectUris) {
    if (typeof uri !== 'string' || !isAllowedRedirectUri(uri)) {
      throw new OAuthError('invalid_redirect_uri', `Redirect URI not allowed: ${String(uri)}`)
    }
  }

  const authMethod = (metadata.token_endpoint_auth_method ?? 'client_secret_basic') as AuthMethod
  if (!AUTH_METHODS.includes(authMethod)) {
    throw new OAuthError(
      'invalid_client_metadata',
      `Unsupported token_endpoint_auth_method: ${String(authMethod)}`,
    )
  }

  const grantTypes = (metadata.grant_types ?? ['authorization_code', 'refresh_token']) as unknown[]
  if (
    !Array.isArray(grantTypes) ||
    grantTypes.some((g) => typeof g !== 'string' || !GRANT_TYPES.includes(g))
  ) {
    throw new OAuthError(
      'invalid_client_metadata',
      'Only authorization_code and refresh_token grants are supported.',
    )
  }

  const responseTypes = (metadata.response_types ?? ['code']) as unknown[]
  if (!Array.isArray(responseTypes) || responseTypes.some((r) => r !== 'code')) {
    throw new OAuthError('invalid_client_metadata', 'Only the code response type is supported.')
  }

  const rawName = typeof metadata.client_name === 'string' ? metadata.client_name.trim() : ''
  const clientName = rawName.slice(0, 100) || 'MCP client'
  const clientSecret = authMethod === 'none' ? null : randomSecret(CLIENT_SECRET_PREFIX)

  const client = await store.createClient({
    clientName,
    redirectUris: redirectUris as string[],
    tokenEndpointAuthMethod: authMethod,
    grantTypes: grantTypes as string[],
    clientSecretHash: clientSecret ? hashSecret(clientSecret) : null,
  })

  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: authMethod,
    grant_types: grantTypes,
    response_types: ['code'],
  }
}

/**
 * Authenticates the client at the token and revocation endpoints. Credentials
 * come from the HTTP Basic header or the form body (client_secret_post /
 * public clients).
 */
export async function authenticateClient(
  store: McpStore,
  params: URLSearchParams,
  authorization: string | null,
): Promise<McpClientRow> {
  let clientId = params.get('client_id')
  let clientSecret = params.get('client_secret')

  if (authorization?.toLowerCase().startsWith('basic ')) {
    const decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8')
    const separator = decoded.indexOf(':')
    if (separator === -1) throw new OAuthError('invalid_client', 'Malformed Basic credentials.', 401)
    clientId = decodeURIComponent(decoded.slice(0, separator))
    clientSecret = decodeURIComponent(decoded.slice(separator + 1))
  }

  if (!clientId) throw new OAuthError('invalid_client', 'Missing client_id.', 401)
  const client = await store.getClient(clientId)
  if (!client) throw new OAuthError('invalid_client', 'Unknown client.', 401)

  if (client.tokenEndpointAuthMethod !== 'none') {
    if (
      !clientSecret ||
      !client.clientSecretHash ||
      !safeEqual(hashSecret(clientSecret), client.clientSecretHash)
    ) {
      throw new OAuthError('invalid_client', 'Invalid client credentials.', 401)
    }
  }
  return client
}

// ─── Authorization request ──────────────────────────────────────────────────

export interface AuthorizeRequest {
  clientId: string
  clientName: string
  redirectUri: string
  state: string | null
  codeChallenge: string
  scopes: McpScope[]
  resource: string
}

export type AuthorizeValidation =
  | { ok: true; request: AuthorizeRequest }
  // redirectTo is set once the redirect URI is trusted; otherwise the error is shown on the page.
  | { ok: false; error: AuthorizeErrorCode; redirectTo: string | null }

/** Problems the consent page explains in the visitor's language. */
export type AuthorizeErrorCode =
  | 'missing-client'
  | 'unknown-client'
  | 'bad-redirect'
  | 'bad-request'

export function buildRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>,
): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

export async function validateAuthorizeRequest(
  store: McpStore,
  params: Record<string, string | undefined>,
  origin: string,
): Promise<AuthorizeValidation> {
  const clientId = params.client_id
  if (!clientId) return { ok: false, error: 'missing-client', redirectTo: null }
  const client = await store.getClient(clientId)
  if (!client) return { ok: false, error: 'unknown-client', redirectTo: null }

  const registered = client.redirectUris
  const redirectUri = params.redirect_uri || (registered.length === 1 ? registered[0] : undefined)
  if (!redirectUri || !registered.includes(redirectUri)) {
    return { ok: false, error: 'bad-redirect', redirectTo: null }
  }

  const state = params.state || null
  const fail = (error: string, description: string): AuthorizeValidation => ({
    ok: false,
    error: 'bad-request',
    redirectTo: buildRedirect(redirectUri, {
      error,
      error_description: description,
      state,
      iss: origin,
    }),
  })

  if (params.response_type !== 'code') {
    return fail('unsupported_response_type', 'Only response_type=code is supported.')
  }
  if (!params.code_challenge || !PKCE_CHALLENGE.test(params.code_challenge)) {
    return fail('invalid_request', 'A PKCE code_challenge is required.')
  }
  if (params.code_challenge_method !== 'S256') {
    return fail('invalid_request', 'code_challenge_method must be S256.')
  }

  let scopes: McpScope[]
  try {
    scopes = parseScopes(params.scope)
  } catch (err) {
    return fail('invalid_scope', (err as Error).message)
  }

  const resource = getMcpResourceUrl(origin)
  if (params.resource && !sameResource(params.resource, resource)) {
    return fail('invalid_target', 'Unknown resource.')
  }

  return {
    ok: true,
    request: {
      clientId,
      clientName: client.clientName || 'MCP client',
      redirectUri,
      state,
      codeChallenge: params.code_challenge,
      scopes,
      resource,
    },
  }
}

/**
 * The signed-in account approved: store a single-use code bound to it. The
 * grant itself is created when the code is exchanged, so abandoned flows
 * leave no connection behind.
 */
export async function issueAuthorizationCode(
  store: McpStore,
  request: AuthorizeRequest,
  userId: number,
  scopes: McpScope[],
): Promise<string> {
  const code = randomSecret(AUTH_CODE_PREFIX)
  await store.insertToken(hashSecret(code), {
    kind: 'code',
    clientId: request.clientId,
    userId,
    grantId: null,
    clientName: request.clientName,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    scopes,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
  })
  return code
}

// ─── Token endpoint ─────────────────────────────────────────────────────────

async function issueTokens(
  store: McpStore,
  grant: McpGrantRow,
  scopes: McpScope[],
  resource: string,
) {
  const accessToken = randomSecret(ACCESS_TOKEN_PREFIX)
  const refreshToken = randomSecret(REFRESH_TOKEN_PREFIX)
  const shared = {
    grantId: grant.id,
    clientId: grant.clientId,
    userId: grant.userId,
    clientName: grant.clientName,
    scopes,
    resource,
    redirectUri: null,
    codeChallenge: null,
  }

  await store.insertToken(hashSecret(accessToken), {
    ...shared,
    kind: 'access',
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
  })
  await store.insertToken(hashSecret(refreshToken), {
    ...shared,
    kind: 'refresh',
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  })

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
  }
}

/** The grant still stands: not revoked, and its account still exists. */
async function usableGrant(store: McpStore, grantId: string | null): Promise<McpGrantRow | null> {
  if (!grantId) return null
  const grant = await store.getGrant(grantId)
  if (!grant || grant.revokedAt) return null
  if (!(await store.userExists(grant.userId))) return null
  return grant
}

export async function exchangeAuthorizationCode(
  store: McpStore,
  params: URLSearchParams,
  client: McpClientRow,
  origin: string,
) {
  const code = params.get('code')
  const verifier = params.get('code_verifier')
  if (!code || !verifier) {
    throw new OAuthError('invalid_request', 'code and code_verifier are required.')
  }

  const stored = await store.consumeToken(hashSecret(code), 'code')
  if (!stored || stored.clientId !== client.id || stored.expiresAt.getTime() < Date.now()) {
    throw new OAuthError('invalid_grant', 'The authorization code is invalid or expired.')
  }
  if (params.get('redirect_uri') && params.get('redirect_uri') !== stored.redirectUri) {
    throw new OAuthError('invalid_grant', 'redirect_uri does not match.')
  }
  if (!stored.codeChallenge || !verifyPkce(verifier, stored.codeChallenge)) {
    throw new OAuthError('invalid_grant', 'PKCE verification failed.')
  }
  const resource = params.get('resource')
  if (resource && !sameResource(resource, stored.resource || getMcpResourceUrl(origin))) {
    throw new OAuthError('invalid_target', 'Unknown resource.')
  }
  if (stored.userId == null || !(await store.userExists(stored.userId))) {
    throw new OAuthError('invalid_grant', 'The account that approved this no longer exists.')
  }

  const grant = await store.createGrant({
    userId: stored.userId,
    clientId: stored.clientId,
    clientName: stored.clientName || client.clientName,
    scopes: stored.scopes,
  })
  return issueTokens(store, grant, stored.scopes, stored.resource || getMcpResourceUrl(origin))
}

export async function refreshAccessToken(
  store: McpStore,
  params: URLSearchParams,
  client: McpClientRow,
) {
  const refreshToken = params.get('refresh_token')
  if (!refreshToken) throw new OAuthError('invalid_request', 'refresh_token is required.')
  const hash = hashSecret(refreshToken)

  const stored = await store.consumeToken(hash, 'refresh')
  if (!stored) {
    // A used refresh token presented again means it leaked: cut off the whole grant.
    const previous = await store.getToken(hash)
    if (previous?.kind === 'refresh' && previous.usedAt && previous.grantId) {
      await store.revokeGrant(previous.grantId)
    }
    throw new OAuthError('invalid_grant', 'The refresh token is invalid.')
  }
  if (stored.clientId !== client.id || stored.expiresAt.getTime() < Date.now()) {
    throw new OAuthError('invalid_grant', 'The refresh token is invalid or expired.')
  }

  const grant = await usableGrant(store, stored.grantId)
  if (!grant) throw new OAuthError('invalid_grant', 'Access was revoked.')

  // A refresh may narrow the scopes, never widen them.
  let scopes: McpScope[] = stored.scopes
  if (params.get('scope')) {
    const requested = parseScopes(params.get('scope'))
    if (requested.some((s) => !stored.scopes.includes(s))) {
      throw new OAuthError('invalid_scope', 'A refresh cannot add scopes.')
    }
    scopes = requested
  }

  // A connector in use is an account in use: the dormant-account retention
  // rule (2 years without a login) must not delete somebody who works with
  // the site through Claude every week. Refreshes happen about hourly while
  // Claude is active, never when it is not.
  await store.stampUserActivity(grant.userId)

  return issueTokens(store, grant, scopes, stored.resource || '')
}

/** RFC 7009. Revoking a refresh token ends the whole grant; an access token only itself. */
export async function revokeToken(store: McpStore, params: URLSearchParams, client: McpClientRow) {
  const token = params.get('token')
  if (!token) return
  const hash = hashSecret(token)
  const stored = await store.getToken(hash)
  if (!stored || stored.clientId !== client.id) return
  if (stored.kind === 'refresh' && stored.grantId) {
    await store.revokeGrant(stored.grantId)
  } else {
    await store.deleteToken(hash)
  }
}

// ─── Resource server ────────────────────────────────────────────────────────

export interface McpAuth {
  token: string
  clientId: string
  scopes: McpScope[]
  expiresAt: number
  grantId: string
  clientName: string
  userId: number
}

const TOUCH_INTERVAL_MS = 5 * 60 * 1000

export async function verifyAccessToken(
  store: McpStore,
  token: string,
  origin: string,
): Promise<McpAuth | null> {
  if (!token.startsWith(ACCESS_TOKEN_PREFIX)) return null
  const stored = await store.getToken(hashSecret(token))
  if (!stored || stored.kind !== 'access') return null
  const expiresAt = stored.expiresAt.getTime()
  if (expiresAt < Date.now()) return null
  if (stored.resource && !sameResource(stored.resource, getMcpResourceUrl(origin))) return null

  const grant = await usableGrant(store, stored.grantId)
  if (!grant) return null

  const lastUsed = grant.lastUsedAt ? grant.lastUsedAt.getTime() : 0
  if (Date.now() - lastUsed > TOUCH_INTERVAL_MS) {
    await store.touchGrant(grant.id)
  }

  return {
    token,
    clientId: stored.clientId,
    scopes: stored.scopes,
    expiresAt: Math.floor(expiresAt / 1000),
    grantId: grant.id,
    clientName: grant.clientName || 'MCP client',
    userId: grant.userId,
  }
}
