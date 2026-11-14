import {
  OAuthError,
  authenticateClient,
  exchangeAuthorizationCode,
  getPublicOrigin,
  refreshAccessToken,
} from '@/lib/mcp/oauth'
import {
  jsonResponse,
  oauthErrorResponse,
  preflightResponse,
  readFormParams,
  requestIp,
} from '@/lib/mcp/http'
import { mcpRuntime } from '@/lib/mcp/runtime'
import { checkRateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const limit = checkRateLimit(`mcp-token:${requestIp(request)}`, { limit: 60, windowMs: 60 * 1000 })
    if (!limit.allowed) throw new OAuthError('temporarily_unavailable', 'Too many requests.', 429)

    const params = await readFormParams(request)
    const { store } = await mcpRuntime()
    const client = await authenticateClient(store, params, request.headers.get('authorization'))

    switch (params.get('grant_type')) {
      case 'authorization_code':
        return jsonResponse(
          await exchangeAuthorizationCode(store, params, client, getPublicOrigin(request.headers)),
        )
      case 'refresh_token':
        return jsonResponse(await refreshAccessToken(store, params, client))
      default:
        throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token.')
    }
  } catch (err) {
    return oauthErrorResponse(err)
  }
}

export function OPTIONS() {
  return preflightResponse()
}
