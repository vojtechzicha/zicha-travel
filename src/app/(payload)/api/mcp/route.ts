import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { User } from '@/payload-types'
import { createMcpServer } from '@/lib/mcp/server'
import { getProtectedResourceMetadataUrl, getPublicOrigin, verifyAccessToken } from '@/lib/mcp/oauth'
import { CORS_HEADERS, jsonResponse, preflightResponse } from '@/lib/mcp/http'
import { mcpRuntime } from '@/lib/mcp/runtime'
import { checkRateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Remote MCP endpoint ("Propojení s Claude", docs/MCP.md): Streamable HTTP,
// stateless, JSON responses. Claude connectors authenticate with an OAuth
// bearer token from /api/mcp/oauth/token; every tool then runs as the
// account that approved the connection (src/lib/mcp/loopback.ts).
async function authenticate(request: Request) {
  const origin = getPublicOrigin(request.headers)
  const { payload, store } = await mcpRuntime()
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)
  const auth = match ? await verifyAccessToken(store, match[1].trim(), origin) : null
  const user = auth
    ? ((await payload
        .findByID({ collection: 'users', id: auth.userId, depth: 0, overrideAccess: true })
        .catch(() => null)) as User | null)
    : null
  if (auth && user) return { caller: { payload, auth, user, origin } }

  const challenge = [
    `Bearer resource_metadata="${getProtectedResourceMetadataUrl(origin)}"`,
    match ? `error="invalid_token"` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return {
    response: jsonResponse(
      {
        error: match ? 'invalid_token' : 'unauthorized',
        error_description: 'Sign in through the Claude connector.',
      },
      401,
      { 'WWW-Authenticate': challenge },
    ),
  }
}

export async function POST(request: Request) {
  const result = await authenticate(request)
  if (!result.caller) return result.response

  const limit = checkRateLimit(`mcp:${result.caller.auth.grantId}`, { limit: 300, windowMs: 60 * 1000 })
  if (!limit.allowed) {
    return jsonResponse({ error: 'rate_limited', error_description: 'Too many requests.' }, 429, {
      'Retry-After': String(limit.retryAfterSeconds),
    })
  }

  const server = createMcpServer(result.caller)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    const { auth } = result.caller
    const response = await transport.handleRequest(request, {
      authInfo: {
        token: auth.token,
        clientId: auth.clientId,
        scopes: auth.scopes,
        expiresAt: auth.expiresAt,
      },
    })
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } finally {
    await server.close()
  }
}

// Stateless: no server-initiated SSE stream and no sessions to end.
// Unauthenticated requests still get the 401 challenge so clients can
// discover the OAuth server.
async function methodNotAllowed(request: Request) {
  const result = await authenticate(request)
  if (!result.caller) return result.response
  return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' })
}

export const GET = methodNotAllowed
export const DELETE = methodNotAllowed

export function OPTIONS() {
  return preflightResponse()
}
