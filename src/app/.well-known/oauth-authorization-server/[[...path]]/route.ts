import { getAuthorizationServerMetadata, getPublicOrigin } from '@/lib/mcp/oauth'
import { jsonResponse, preflightResponse } from '@/lib/mcp/http'

export const dynamic = 'force-dynamic'

// RFC 8414 metadata of the connector's authorization server (docs/MCP.md).
export function GET(request: Request) {
  return jsonResponse(getAuthorizationServerMetadata(getPublicOrigin(request.headers)))
}

export function OPTIONS() {
  return preflightResponse()
}
