import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { resolveProvider } from '@/lib/auth/providers'
import { requestOrigin } from '@/lib/auth/magicLink'
import { safeReturnUrl, sessionCookieDomain } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  // ?provider=microsoft|google|apple — missing or unknown falls back to the
  // first configured provider, so pre-existing /api/auth/login links keep
  // working as Microsoft.
  const provider = resolveProvider(request.nextUrl.searchParams.get('provider'))
  if (!provider) {
    return NextResponse.json({ error: 'OAuth not configured' }, { status: 404 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const authUrl = provider.authorizationUrl(state)

  const cookieOptions = {
    httpOnly: true,
    path: '/',
    // Apple returns the callback as a cross-site POST (form_post), which a
    // Lax cookie would not accompany — its flow needs SameSite=None, and
    // None requires Secure (Apple only allows https callbacks anyway).
    sameSite: provider.usesFormPost ? ('none' as const) : ('lax' as const),
    secure: provider.usesFormPost || process.env.NODE_ENV === 'production',
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
