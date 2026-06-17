import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getProvider } from '@/lib/auth/providers'
import { getSessionFromHeaders } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

function callbackUri(request: NextRequest): string {
  const base = process.env.OAUTH_REDIRECT_BASE || request.nextUrl.origin
  return new URL('/api/auth/oauth/callback', base).toString()
}

function safeRedirect(raw: string | null): string {
  // Only allow same-site path redirects
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/'
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const providerName = searchParams.get('provider') || ''
  const mode = searchParams.get('mode') === 'link' ? 'link' : 'login'
  const redirect = safeRedirect(searchParams.get('redirect'))

  const provider = getProvider(providerName)
  if (!provider || !provider.isConfigured()) {
    return NextResponse.redirect(new URL(`${redirect}`, request.nextUrl.origin))
  }

  // Link mode requires an existing account session to attach the email to.
  if (mode === 'link') {
    const session = getSessionFromHeaders(request.headers)
    if (!session || session.collection !== 'accounts') {
      return NextResponse.redirect(new URL(redirect, request.nextUrl.origin))
    }
  }

  const state = crypto.randomBytes(16).toString('hex')
  const authUrl = provider.getAuthorizationUrl(state, callbackUri(request))

  const response = NextResponse.redirect(authUrl)
  response.cookies.set(
    'fe-oauth-state',
    JSON.stringify({ state, provider: provider.name, mode, redirect }),
    {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60,
    },
  )
  return response
}
