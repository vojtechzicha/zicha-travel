import { NextRequest, NextResponse } from 'next/server'
import {
  clearSessionCookie,
  refererReturnUrl,
  requestOrigin,
  safeReturnUrl,
} from '@/lib/auth/session'

/**
 * GET /api/auth/logout?returnTo=/...
 *
 * Clears the session cookie (works for both Microsoft OAuth and magic-link
 * sessions) and sends the visitor back to the frontend.
 *
 * Without an explicit returnTo, they stay on the page they signed out from
 * (via the Referer) instead of being dumped on the homepage — chata pages
 * are public, so the same page simply re-renders as an anonymous visitor.
 * The footer link therefore needs no parameter.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = requestOrigin(request.headers)
  const explicit = request.nextUrl.searchParams.get('returnTo')
  const destination = explicit
    ? safeReturnUrl(explicit, origin)
    : (refererReturnUrl(request.headers.get('referer'), origin) ??
      new URL('/', origin).toString())

  const response = NextResponse.redirect(destination)
  clearSessionCookie(response, request.headers.get('host'))
  return response
}
