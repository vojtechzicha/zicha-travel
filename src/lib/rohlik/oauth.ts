import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'

// OAuth against Rohlík's identity server for the official MCP server
// (https://mcp.rohlik.cz/mcp — a resource server; its protected-resource
// metadata names https://identity.rohlik.cz as the authorization server).
// The banker connects their own Rohlík account once: dynamic client
// registration (public client, PKCE S256), the authorization code flow with
// `resource` set to the MCP URL, and refresh tokens afterwards. The network
// calls take an injectable fetch so the pure parts stay unit-testable
// (tests/int/rohlik.int.spec.ts).

export const ROHLIK_MCP_URL = 'https://mcp.rohlik.cz/mcp'
export const ROHLIK_ISSUER = 'https://identity.rohlik.cz'
export const ROHLIK_AUTHORIZE_URL = `${ROHLIK_ISSUER}/oauth2/authorize`
export const ROHLIK_TOKEN_URL = `${ROHLIK_ISSUER}/oauth2/token`
export const ROHLIK_REGISTER_URL = `${ROHLIK_ISSUER}/connect/register`
export const ROHLIK_SCOPE = 'openid email roles'

/** All Rohlík endpoints live under /api/shopping-items/rohlik/… */
export const ROHLIK_ENDPOINT_PATH = '/api/shopping-items/rohlik'
export const ROHLIK_STATE_COOKIE = 'rohlik-oauth-state'
export const ROHLIK_STATE_TTL_SECONDS = 10 * 60

type FetchLike = typeof fetch

export function callbackUrl(origin: string): string {
  return `${origin}${ROHLIK_ENDPOINT_PATH}/callback`
}

// ─── PKCE (RFC 7636) ────────────────────────────────────────────────────

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function createPkce(): { verifier: string; challenge: string } {
  // 32 random bytes → 43 base64url chars, the RFC's recommended length
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: pkceChallenge(verifier) }
}

// ─── signed state (rides an httpOnly cookie through the round trip) ──────

export interface RohlikConnectState {
  /** the account that started the connect — the callback must be the same one */
  userId: string
  chataId: string
  clientId: string
  redirectUri: string
  verifier: string
  /** random value echoed as the OAuth `state` parameter */
  nonce: string
  returnTo: string
}

export function signConnectState(state: RohlikConnectState, secret: string): string {
  return jwt.sign({ ...state, purpose: 'rohlik-connect' }, secret, {
    expiresIn: ROHLIK_STATE_TTL_SECONDS,
  })
}

export type ConnectStateResult =
  | { ok: true; state: RohlikConnectState }
  | { ok: false; code: 'expired' | 'invalid' | 'wrong-user' | 'nonce-mismatch' }

/** Verify the cookie AND that it belongs to this callback: same account, same nonce. */
export function verifyConnectState(
  token: string | null | undefined,
  secret: string,
  expected: { userId: number | string | null | undefined; nonce: string | null | undefined },
): ConnectStateResult {
  if (!token) return { ok: false, code: 'invalid' }
  let decoded: Record<string, unknown>
  try {
    decoded = jwt.verify(token, secret) as Record<string, unknown>
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, code: 'expired' }
    return { ok: false, code: 'invalid' }
  }
  if (decoded.purpose !== 'rohlik-connect') return { ok: false, code: 'invalid' }
  const fields = ['userId', 'chataId', 'clientId', 'redirectUri', 'verifier', 'nonce', 'returnTo']
  if (fields.some((field) => typeof decoded[field] !== 'string')) {
    return { ok: false, code: 'invalid' }
  }
  const state = decoded as unknown as RohlikConnectState
  if (expected.userId == null || state.userId !== String(expected.userId)) {
    return { ok: false, code: 'wrong-user' }
  }
  if (!expected.nonce || state.nonce !== expected.nonce) {
    return { ok: false, code: 'nonce-mismatch' }
  }
  return {
    ok: true,
    state: {
      userId: state.userId,
      chataId: state.chataId,
      clientId: state.clientId,
      redirectUri: state.redirectUri,
      verifier: state.verifier,
      nonce: state.nonce,
      returnTo: state.returnTo,
    },
  }
}

// ─── authorize URL ───────────────────────────────────────────────────────

export function buildAuthorizeUrl(args: {
  clientId: string
  redirectUri: string
  challenge: string
  nonce: string
}): string {
  const url = new URL(ROHLIK_AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', args.clientId)
  url.searchParams.set('redirect_uri', args.redirectUri)
  url.searchParams.set('scope', ROHLIK_SCOPE)
  url.searchParams.set('state', args.nonce)
  url.searchParams.set('code_challenge', args.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', ROHLIK_MCP_URL)
  return url.toString()
}

// ─── network: registration, code exchange, refresh ───────────────────────

/**
 * Rohlík's own reason for a refused OAuth request ("invalid_request:
 * Redirect URI is not allowed…"), for the logs. Only the standard
 * error/error_description fields, trimmed; a refusal carries no tokens.
 */
export async function oauthErrorReason(res: { text: () => Promise<string> }): Promise<string> {
  try {
    const body = JSON.parse(await res.text()) as { error?: unknown; error_description?: unknown }
    const parts = [body.error, body.error_description].filter(
      (part): part is string => typeof part === 'string' && part.trim() !== '',
    )
    return parts.join(': ').slice(0, 300)
  } catch {
    return ''
  }
}

export class RohlikOAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'RohlikOAuthError'
  }
}

/** Dynamic client registration (RFC 7591) — one public client per connect. */
export async function registerClient(
  redirectUri: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const res = await fetchImpl(ROHLIK_REGISTER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_name: 'zicha.travel',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: ROHLIK_SCOPE,
    }),
  })
  if (!res.ok) {
    const reason = await oauthErrorReason(res)
    throw new RohlikOAuthError(
      `client registration failed${reason ? ` (${reason})` : ''}`,
      res.status,
    )
  }
  const body = (await res.json()) as { client_id?: unknown }
  if (typeof body.client_id !== 'string' || body.client_id === '') {
    throw new RohlikOAuthError('client registration returned no client_id')
  }
  return body.client_id
}

export interface RohlikTokens {
  accessToken: string
  /** null when the server issued none (then the connection lasts one access token) */
  refreshToken: string | null
  expiresAt: Date
}

/** Shape a token endpoint answer; `previousRefresh` survives a non-rotating refresh. */
export function parseTokenResponse(
  body: unknown,
  now: number = Date.now(),
  previousRefresh: string | null = null,
): RohlikTokens {
  const data = (body ?? {}) as Record<string, unknown>
  if (typeof data.access_token !== 'string' || data.access_token === '') {
    throw new RohlikOAuthError('token response without access_token')
  }
  const expiresIn =
    typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : 3600
  return {
    accessToken: data.access_token,
    refreshToken:
      typeof data.refresh_token === 'string' && data.refresh_token !== ''
        ? data.refresh_token
        : previousRefresh,
    expiresAt: new Date(now + expiresIn * 1000),
  }
}

async function tokenRequest(
  params: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const res = await fetchImpl(ROHLIK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({ ...params, resource: ROHLIK_MCP_URL }).toString(),
  })
  if (!res.ok) {
    const reason = await oauthErrorReason(res)
    throw new RohlikOAuthError(`token request failed${reason ? ` (${reason})` : ''}`, res.status)
  }
  return res.json()
}

export async function exchangeCode(
  args: { clientId: string; redirectUri: string; code: string; verifier: string },
  fetchImpl: FetchLike = fetch,
): Promise<RohlikTokens> {
  const body = await tokenRequest(
    {
      grant_type: 'authorization_code',
      client_id: args.clientId,
      redirect_uri: args.redirectUri,
      code: args.code,
      code_verifier: args.verifier,
    },
    fetchImpl,
  )
  return parseTokenResponse(body)
}

export async function refreshTokens(
  args: { clientId: string; refreshToken: string },
  fetchImpl: FetchLike = fetch,
): Promise<RohlikTokens> {
  const body = await tokenRequest(
    { grant_type: 'refresh_token', client_id: args.clientId, refresh_token: args.refreshToken },
    fetchImpl,
  )
  return parseTokenResponse(body, Date.now(), args.refreshToken)
}
