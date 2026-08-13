import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isOAuthConfigured } from '@/lib/auth/config'
import { getAuthorizationUrl } from '@/lib/auth/microsoft'
import { requestOrigin } from '@/lib/auth/magicLink'
import { safeReturnUrl, sessionCookieDomain } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.json({ error: 'OAuth not configured' }, { status: 404 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const authUrl = getAuthorizationUrl(state)

  const cookieOptions = {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60, // 10 minutes
    // Shared across subdomains: the callback always lands on the apex
    // domain, but the flow may start on a chata subdomain
    ...sessionCookieDomain(),
  }

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('oauth-state', state, cookieOptions)

  // Frontend sign-in passes ?returnTo=/...; its presence also tells the
  // callback to report errors on /login instead of /admin/login.
  // Stored ABSOLUTE against the host the sign-in started on: the callback
  // always lands on the apex, so a path alone would strand someone who
  // started on a chata subdomain (lipno.zicha.travel) on the apex homepage.
  const returnTo = request.nextUrl.searchParams.get('returnTo')
  if (returnTo) {
    const startedAt = requestOrigin(request.headers)
    response.cookies.set('oauth-return-to', safeReturnUrl(returnTo, startedAt), cookieOptions)
  } else {
    response.cookies.set('oauth-return-to', '', { ...cookieOptions, maxAge: 0 })
  }

  return response
}
