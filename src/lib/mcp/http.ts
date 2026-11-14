// HTTP helpers for the MCP and OAuth endpoints (app/(payload)/api/mcp/*).

import { OAuthError } from './oauth'

// MCP and OAuth endpoints are called by Claude's servers and by browser-based
// MCP clients. They authenticate with bearer tokens, never cookies, so open
// CORS is safe.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store', ...headers },
  })
}

export function oauthErrorResponse(err: unknown) {
  if (err instanceof OAuthError) {
    return jsonResponse({ error: err.code, error_description: err.message }, err.status)
  }
  console.error('MCP OAuth error:', err)
  return jsonResponse({ error: 'server_error', error_description: 'Internal error.' }, 500)
}

export function preflightResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/** OAuth endpoints take application/x-www-form-urlencoded; JSON is accepted as a courtesy. */
export async function readFormParams(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type') || ''
  const text = await request.text()
  if (contentType.includes('application/json')) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>
      return new URLSearchParams(
        Object.entries(data)
          .filter(([, value]) => typeof value === 'string')
          .map(([key, value]) => [key, value as string]),
      )
    } catch {
      throw new OAuthError('invalid_request', 'Malformed JSON body.')
    }
  }
  return new URLSearchParams(text)
}

export function requestIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * The cookie-authenticated connector endpoints (consent decision, the
 * connection list on /claude) only take requests a page of this site sent.
 * The session cookie is SameSite=Lax, which already keeps it off cross-site
 * POSTs; the Origin check covers older browsers and same-site subdomains that
 * are not ours to trust.
 */
export function isSameOriginRequest(request: Request, publicOrigin: string): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin'
  return origin === publicOrigin
}
