import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getAuthConfig } from '@/lib/auth/config'
import { exchangeCodeForTokens, decodeIdToken } from '@/lib/auth/microsoft'
import {
  safeReturnUrl,
  sessionCookieDomain,
  setLoginEventCookie,
  setSessionCookie,
  signSessionToken,
} from '@/lib/auth/session'

function buildRedirect(location: string): NextResponse {
  return NextResponse.redirect(location)
}

export async function GET(request: NextRequest) {
  const authConfig = getAuthConfig()
  const origin = authConfig.azureRedirectOrigin
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // A frontend-initiated sign-in (footer/login page) carries a return URL;
  // report its errors on the frontend login page, not /admin/login — and on
  // the host the sign-in started from, which may be a chata subdomain even
  // though Microsoft always sends the callback to the apex
  const returnTo = request.cookies.get('oauth-return-to')?.value || null
  const returnUrl = returnTo ? safeReturnUrl(returnTo, origin) : null
  const errorPage = returnUrl
    ? new URL('/login', returnUrl).toString()
    : `${origin}/admin/login`

  const fail = (code: string): NextResponse => {
    const response = buildRedirect(`${errorPage}?error=${code}`)
    clearOAuthCookies(response)
    return response
  }

  if (error) {
    const description = searchParams.get('error_description') || error
    console.error('OAuth error from Microsoft:', description)
    return fail('oauth')
  }

  if (!code || !state) {
    return fail('missing_params')
  }

  const storedState = request.cookies.get('oauth-state')?.value
  if (!storedState || storedState !== state) {
    return fail('invalid_state')
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    const userInfo = tokens.id_token ? decodeIdToken(tokens.id_token) : {}

    if (!userInfo.email) {
      return fail('no_email')
    }

    const payload = await getPayload({ config })

    const users = await payload.find({
      collection: 'users',
      where: { email: { equals: userInfo.email.toLowerCase() } },
      limit: 1,
    })

    if (users.docs.length === 0) {
      return fail('unauthorized')
    }

    const user = users.docs[0]

    // Activate the account (lastLoginAt) — this also locks the linked
    // participants away from anonymous visitors
    try {
      await payload.update({
        collection: 'users',
        id: user.id,
        data: { lastLoginAt: new Date().toISOString() },
        overrideAccess: true,
        depth: 0,
      })
    } catch (err) {
      console.error('Failed to stamp lastLoginAt:', err)
    }

    // Frontend accounts always land on the frontend; admin roles go back to
    // where they started (frontend when returnTo is set, /admin otherwise)
    const destination =
      user.role === 'user'
        ? (returnUrl ?? `${origin}/`)
        : (returnUrl ?? `${origin}/admin`)

    const { token, maxAge } = signSessionToken(user)
    const response = buildRedirect(destination)
    setSessionCookie(response, token, maxAge)
    setLoginEventCookie(response, 'microsoft')
    clearOAuthCookies(response)

    return response
  } catch (err) {
    console.error('OAuth callback error:', err)
    return fail('callback_failed')
  }
}

function clearOAuthCookies(response: NextResponse): void {
  const cookieOptions = {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    ...sessionCookieDomain(),
  }
  response.cookies.set('oauth-state', '', cookieOptions)
  response.cookies.set('oauth-return-to', '', cookieOptions)
}
