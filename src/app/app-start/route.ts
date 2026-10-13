import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { apexOriginFromCookieDomain } from '@/lib/pwa'

/**
 * GET /app-start — launch bridge for apps installed from a chata
 * subdomain. An install is always bound to the origin it starts on
 * (cross-origin start_url is ignored by spec), so the subdomain manifest
 * starts here and this route hands the launched app over to the apex —
 * derived from SESSION_COOKIE_DOMAIN, the boundary the session cookie
 * already spans, so the sign-in travels along. Where no apex is
 * configured (local dev, host-only-cookie previews) or we already are on
 * it, the bridge just lands on the homepage. See src/lib/pwa.ts.
 *
 * Listed in the middleware SITE_PATHS allowlist — single-chata mode would
 * otherwise swallow the path with its slug redirect.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? ''
  const apex = apexOriginFromCookieDomain(process.env.SESSION_COOKIE_DOMAIN)
  const target =
    apex && host && new URL(apex).hostname !== host ? `${apex}/` : new URL('/', request.url)
  return NextResponse.redirect(target, {
    status: 307,
    // The launcher must re-resolve on every open — never pin the redirect.
    headers: { 'cache-control': 'no-store' },
  })
}
