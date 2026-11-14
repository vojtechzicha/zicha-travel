import { authenticateClient, revokeToken } from '@/lib/mcp/oauth'
import { oauthErrorResponse, preflightResponse, readFormParams, CORS_HEADERS } from '@/lib/mcp/http'
import { mcpRuntime } from '@/lib/mcp/runtime'

export const dynamic = 'force-dynamic'

// RFC 7009: answers 200 for unknown tokens too, so it reveals nothing.
export async function POST(request: Request) {
  try {
    const params = await readFormParams(request)
    const { store } = await mcpRuntime()
    const client = await authenticateClient(store, params, request.headers.get('authorization'))
    await revokeToken(store, params, client)
    return new Response(null, { status: 200, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } })
  } catch (err) {
    return oauthErrorResponse(err)
  }
}

export function OPTIONS() {
  return preflightResponse()
}
