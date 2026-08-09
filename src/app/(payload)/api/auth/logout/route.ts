import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie, safeReturnTo } from '@/lib/auth/session'

/**
 * GET /api/auth/logout?returnTo=/...
 *
 * Clears the session cookie (works for both Microsoft OAuth and magic-link
 * sessions) and sends the visitor back to the frontend.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'))
  const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin))
  clearSessionCookie(response, request.headers.get('host'))
  return response
}
