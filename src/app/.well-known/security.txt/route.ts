import { requestOrigin } from '@/lib/auth/session'
import { securityTxtBody } from '@/lib/wellKnown'

/**
 * GET /.well-known/security.txt — machine-readable vulnerability-report
 * contact (RFC 9116). Generated per request so the mandatory Expires field
 * rolls forward instead of going stale; see securityTxtBody for the rules.
 * Served identically on every host (apex + chata subdomains).
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return new Response(securityTxtBody(requestOrigin(request.headers), new Date()), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      // The body is stable within a UTC day (expiry truncated to midnight),
      // so a day of CDN caching never serves a different body than a
      // fresh render would.
      'cache-control': 'public, max-age=0, s-maxage=86400',
    },
  })
}
