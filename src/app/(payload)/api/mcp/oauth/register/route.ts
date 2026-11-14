import { OAuthError, registerClient } from '@/lib/mcp/oauth'
import { jsonResponse, oauthErrorResponse, preflightResponse, requestIp } from '@/lib/mcp/http'
import { mcpRuntime } from '@/lib/mcp/runtime'
import { checkRateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

// Dynamic client registration (RFC 7591). Open by design: a registered
// client can do nothing until a signed-in person approves it on
// /oauth/authorize, and only Claude's and loopback callbacks are accepted.
// Clients nobody connected are pruned by the retention job.
export async function POST(request: Request) {
  try {
    const limit = checkRateLimit(`mcp-register:${requestIp(request)}`, {
      limit: 20,
      windowMs: 60 * 60 * 1000,
    })
    if (!limit.allowed) throw new OAuthError('temporarily_unavailable', 'Too many registrations.', 429)

    let metadata: Record<string, unknown>
    try {
      metadata = await request.json()
    } catch {
      throw new OAuthError('invalid_client_metadata', 'Body must be JSON.')
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new OAuthError('invalid_client_metadata', 'Body must be a JSON object.')
    }
    const { store } = await mcpRuntime()
    return jsonResponse(await registerClient(store, metadata), 201)
  } catch (err) {
    return oauthErrorResponse(err)
  }
}

export function OPTIONS() {
  return preflightResponse()
}
