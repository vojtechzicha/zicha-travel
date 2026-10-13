import { NextRequest, NextResponse } from 'next/server'
import { getPayload, parseCookies } from 'payload'
import jwt from 'jsonwebtoken'
import config from '@payload-config'
import { setSessionCookie, signSessionToken } from '@/lib/auth/session'
import { shouldRefreshSessionToken } from '@/lib/auth/sessionRefresh'

/**
 * POST /api/auth/refresh — rolling session refresh.
 *
 * Verifies the payload-token cookie and, when the token is old enough
 * (src/lib/auth/sessionRefresh.ts), re-signs it for the full role-based
 * duration — so anyone who opens the app now and then stays signed in
 * indefinitely, which is what an installed app on a phone is expected to
 * do. Called by PwaProvider on page load, throttled client-side.
 *
 * POST on purpose: it sets a cookie, and SameSite=Lax keeps cross-site
 * POSTs cookie-less, so a foreign page cannot even trigger a refresh.
 * The account is re-read from the database first — a deleted or demoted
 * account never gets its session extended.
 */

export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = parseCookies(request.headers).get('payload-token')
  if (!token) {
    return NextResponse.json({ refreshed: false }, { status: 401, headers: NO_STORE })
  }

  let decoded: { id: number | string; collection?: string; iat?: number; exp?: number }
  try {
    decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as typeof decoded
  } catch {
    return NextResponse.json({ refreshed: false }, { status: 401, headers: NO_STORE })
  }
  if (decoded.collection !== 'users') {
    return NextResponse.json({ refreshed: false }, { status: 401, headers: NO_STORE })
  }

  if (!shouldRefreshSessionToken(decoded, Date.now())) {
    return NextResponse.json({ refreshed: false }, { headers: NO_STORE })
  }

  const payload = await getPayload({ config })
  // depth 0 for the same reason as the app-jwt strategy: populating
  // assignedChatas would run the expensive Chatas stats hook.
  const user = await payload
    .findByID({ collection: 'users', id: decoded.id, depth: 0 })
    .catch(() => null)
  if (!user) {
    return NextResponse.json({ refreshed: false }, { status: 401, headers: NO_STORE })
  }

  const { token: fresh, maxAge } = signSessionToken(user)
  const response = NextResponse.json({ refreshed: true }, { headers: NO_STORE })
  setSessionCookie(response, fresh, maxAge)
  return response
}
