import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MCP_SCOPES,
  OAuthError,
  authenticateClient,
  exchangeAuthorizationCode,
  getAuthorizationServerMetadata,
  getProtectedResourceMetadata,
  getPublicOrigin,
  isAllowedRedirectUri,
  issueAuthorizationCode,
  parseScopes,
  refreshAccessToken,
  registerClient,
  revokeToken,
  validateAuthorizeRequest,
  verifyAccessToken,
} from '@/lib/mcp/oauth'
import { memoryMcpStore } from '@/lib/mcp/store'

// The connector's OAuth 2.1 server (docs/MCP.md) against the in-memory store:
// registration, consent → code → tokens, PKCE, refresh rotation with reuse
// detection, revocation, and the binding of everything to one account.

const ORIGIN = 'https://zicha.travel'
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'

function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

async function connect(scope = 'travel:read travel:write', userId = 1) {
  const store = memoryMcpStore(new Set([1, 2]))
  const registered = await registerClient(store, {
    client_name: 'Claude',
    redirect_uris: [CALLBACK],
    token_endpoint_auth_method: 'none',
  })
  const { verifier, challenge } = pkce()
  const params = {
    client_id: registered.client_id,
    redirect_uri: CALLBACK,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope,
    state: 'xyz',
    resource: `${ORIGIN}/api/mcp`,
  }
  const validation = await validateAuthorizeRequest(store, params, ORIGIN)
  if (!validation.ok) throw new Error(validation.error)
  const code = await issueAuthorizationCode(store, validation.request, userId, validation.request.scopes)
  const client = await authenticateClient(store, new URLSearchParams({ client_id: registered.client_id }), null)
  const tokens = await exchangeAuthorizationCode(
    store,
    new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CALLBACK }),
    client,
    ORIGIN,
  )
  return { store, client, tokens, code, verifier, registered }
}

describe('discovery', () => {
  it('derives the issuer from the request host', () => {
    expect(getPublicOrigin(new Headers({ host: 'pratele.zicha.travel' }))).toBe('https://pratele.zicha.travel')
    expect(getPublicOrigin(new Headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000')
    expect(getPublicOrigin(new Headers({ host: 'x', 'x-forwarded-host': 'zicha.travel', 'x-forwarded-proto': 'https' }))).toBe(
      'https://zicha.travel',
    )
  })

  it('publishes metadata that points at the policy, terms and help', () => {
    const as = getAuthorizationServerMetadata(ORIGIN)
    expect(as.issuer).toBe(ORIGIN)
    expect(as.code_challenge_methods_supported).toEqual(['S256'])
    const pr = getProtectedResourceMetadata(ORIGIN)
    expect(pr.resource).toBe(`${ORIGIN}/api/mcp`)
    expect(pr.resource_policy_uri).toBe(`${ORIGIN}/soukromi`)
    expect(pr.resource_tos_uri).toBe(`${ORIGIN}/podminky`)
  })
})

describe('registration', () => {
  it('accepts only Claude callbacks and loopback addresses', () => {
    expect(isAllowedRedirectUri(CALLBACK)).toBe(true)
    expect(isAllowedRedirectUri('https://claude.com/api/mcp/auth_callback')).toBe(true)
    expect(isAllowedRedirectUri('http://localhost:54321/callback')).toBe(true)
    expect(isAllowedRedirectUri('http://127.0.0.1:6274/oauth/callback')).toBe(true)
    expect(isAllowedRedirectUri('https://evil.example/callback')).toBe(false)
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback#x')).toBe(false)
    expect(isAllowedRedirectUri('https://localhost/callback')).toBe(false)
  })

  it('refuses a foreign redirect URI', async () => {
    const store = memoryMcpStore()
    await expect(registerClient(store, { redirect_uris: ['https://evil.example/cb'] })).rejects.toBeInstanceOf(OAuthError)
  })

  it('issues a secret only to confidential clients and checks it', async () => {
    const store = memoryMcpStore()
    const confidential = await registerClient(store, { redirect_uris: [CALLBACK] })
    expect(confidential.client_secret).toMatch(/^ztr_cs_/)
    await expect(
      authenticateClient(store, new URLSearchParams({ client_id: confidential.client_id, client_secret: 'wrong' }), null),
    ).rejects.toMatchObject({ code: 'invalid_client' })
    const ok = await authenticateClient(
      store,
      new URLSearchParams({ client_id: confidential.client_id, client_secret: confidential.client_secret! }),
      null,
    )
    expect(ok.id).toBe(confidential.client_id)
  })
})

describe('scopes', () => {
  it('always includes read; empty means everything', () => {
    expect(parseScopes('')).toEqual([MCP_SCOPES.READ, MCP_SCOPES.WRITE])
    expect(parseScopes('travel:write')).toEqual([MCP_SCOPES.READ, MCP_SCOPES.WRITE])
    expect(parseScopes('travel:read')).toEqual([MCP_SCOPES.READ])
    expect(() => parseScopes('travel:admin')).toThrow(OAuthError)
  })
})

describe('authorization code flow', () => {
  it('binds the grant and tokens to the approving account', async () => {
    const { store, tokens } = await connect('travel:read travel:write', 2)
    expect(tokens.access_token).toMatch(/^ztr_at_/)
    expect(tokens.scope).toBe('travel:read travel:write')
    const auth = await verifyAccessToken(store, tokens.access_token, ORIGIN)
    expect(auth?.userId).toBe(2)
    expect(auth?.clientName).toBe('Claude')
  })

  it('a code works once', async () => {
    const { store, client, code, verifier } = await connect()
    await expect(
      exchangeAuthorizationCode(
        store,
        new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier }),
        client,
        ORIGIN,
      ),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('rejects a wrong PKCE verifier', async () => {
    const store = memoryMcpStore()
    const registered = await registerClient(store, { redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none' })
    const { challenge } = pkce()
    const validation = await validateAuthorizeRequest(
      store,
      { client_id: registered.client_id, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256' },
      ORIGIN,
    )
    if (!validation.ok) throw new Error('invalid')
    const code = await issueAuthorizationCode(store, validation.request, 1, [MCP_SCOPES.READ])
    const client = await authenticateClient(store, new URLSearchParams({ client_id: registered.client_id }), null)
    await expect(
      exchangeAuthorizationCode(
        store,
        new URLSearchParams({ code, code_verifier: pkce().verifier }),
        client,
        ORIGIN,
      ),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('explains bad requests on the page, or back at the client once the redirect is trusted', async () => {
    const store = memoryMcpStore()
    expect(await validateAuthorizeRequest(store, {}, ORIGIN)).toMatchObject({ ok: false, error: 'missing-client' })
    expect(await validateAuthorizeRequest(store, { client_id: '99' }, ORIGIN)).toMatchObject({
      ok: false,
      error: 'unknown-client',
    })
    const registered = await registerClient(store, { redirect_uris: [CALLBACK] })
    expect(
      await validateAuthorizeRequest(store, { client_id: registered.client_id, redirect_uri: 'https://evil.example' }, ORIGIN),
    ).toMatchObject({ ok: false, error: 'bad-redirect', redirectTo: null })
    const noPkce = await validateAuthorizeRequest(store, { client_id: registered.client_id, response_type: 'code' }, ORIGIN)
    expect(noPkce.ok).toBe(false)
    if (!noPkce.ok) expect(noPkce.redirectTo).toContain('error=invalid_request')
  })

  it('a token from one origin does not work on another (production vs preview)', async () => {
    const { store, tokens } = await connect()
    expect(await verifyAccessToken(store, tokens.access_token, 'https://preview.zicha.travel')).toBeNull()
  })

  it('a deleted account takes its connections with it', async () => {
    const { store, tokens } = await connect('travel:read', 1)
    const users = memoryMcpStore(new Set())
    // same rows, but the account is gone
    Object.assign(store, { userExists: users.userExists })
    expect(await verifyAccessToken(store, tokens.access_token, ORIGIN)).toBeNull()
  })
})

describe('refresh tokens', () => {
  it('rotate, stamp account activity, and a reused one revokes the whole connection', async () => {
    const { store, client, tokens } = await connect()
    const next = await refreshAccessToken(
      store,
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }),
      client,
    )
    expect(next.refresh_token).not.toBe(tokens.refresh_token)
    expect(store.activity).toEqual([1])

    await expect(
      refreshAccessToken(store, new URLSearchParams({ refresh_token: tokens.refresh_token }), client),
    ).rejects.toMatchObject({ code: 'invalid_grant' })
    expect(await verifyAccessToken(store, next.access_token, ORIGIN)).toBeNull()
  })

  it('may narrow scopes but never widen them', async () => {
    const { store, client, tokens } = await connect('travel:read')
    await expect(
      refreshAccessToken(store, new URLSearchParams({ refresh_token: tokens.refresh_token, scope: 'travel:write' }), client),
    ).rejects.toMatchObject({ code: 'invalid_scope' })
  })

  it('revoking the refresh token disconnects the app', async () => {
    const { store, client, tokens } = await connect()
    await revokeToken(store, new URLSearchParams({ token: tokens.refresh_token }), client)
    expect(await verifyAccessToken(store, tokens.access_token, ORIGIN)).toBeNull()
  })
})
