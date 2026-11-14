import { getProtectedResourceMetadata, getPublicOrigin } from '@/lib/mcp/oauth'
import { jsonResponse, preflightResponse } from '@/lib/mcp/http'

export const dynamic = 'force-dynamic'

// RFC 9728 metadata for the MCP endpoint (docs/MCP.md). Clients ask for both
// /.well-known/oauth-protected-resource and
// /.well-known/oauth-protected-resource/api/mcp.
export function GET(request: Request) {
  return jsonResponse(getProtectedResourceMetadata(getPublicOrigin(request.headers)))
}

export function OPTIONS() {
  return preflightResponse()
}
