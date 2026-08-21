import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { OAuthProvider } from './provider'
import {
  safeReturnUrl,
  sessionCookieDomain,
  setLoginEventCookie,
  setSessionCookie,
  signSessionToken,
} from './session'

// The callback side of every OAuth sign-in, shared by all three providers.
// Microsoft and Google arrive as a GET redirect; Apple POSTs (form_post), so
// the route hands the already-extracted params in. The rest — state check,
// code exchange, matching the email to an EXISTING account, session cookie —
// is identical.

export interface OAuthCallbackParams {
  code: string | null
  state: string | null
  error: string | null
  errorDescription: string | null
}

export async function handleOAuthCallback(
  provider: OAuthProvider,
  request: NextRequest,
  params: OAuthCallbackParams,
): Promise<NextResponse> {
  const origin = provider.redirectOrigin()

  // A frontend-initiated sign-in (footer/login page) carries a return URL;
  // report its errors on the frontend login page, not /admin/login — and on
  // the host the sign-in started from, which may be a chata subdomain even
  // though the provider always sends the callback to the apex
  const returnTo = request.cookies.get('oauth-return-to')?.value || null
  const returnUrl = returnTo ? safeReturnUrl(returnTo, origin) : null
  const errorPage = returnUrl ? new URL('/login', returnUrl).toString() : `${origin}/admin/login`

  // Every redirect here is 303 See Other, never Next's default 307: Apple's
  // callback arrives as a cross-site POST, and a 307 makes the browser
  // re-POST to the destination — a cross-site POST does not carry the
  // SameSite=Lax session cookie that was just set, so the page renders
  // anonymous until a manual refresh. 303 forces the follow-up to be a GET,
  // which top-level navigation attaches Lax cookies to. Harmless for the
  // GET-based providers.
  const fail = (code: string): NextResponse => {
    const response = NextResponse.redirect(`${errorPage}?error=${code}`, 303)
    clearOAuthCookies(response)
    return response
  }

  if (params.error) {
    const description = params.errorDescription || params.error
    console.error(`OAuth error from ${provider.id}:`, description)
    return fail('oauth')
  }

  if (!params.code || !params.state) {
    return fail('missing_params')
  }

  const storedState = request.cookies.get('oauth-state')?.value
  if (!storedState || storedState !== params.state) {
    return fail('invalid_state')
  }

  try {
    const userInfo = await provider.exchangeCode(params.code)

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
      user.role === 'user' ? (returnUrl ?? `${origin}/`) : (returnUrl ?? `${origin}/admin`)

    const { token, maxAge } = signSessionToken(user)
    const response = NextResponse.redirect(destination, 303)
    setSessionCookie(response, token, maxAge)
    setLoginEventCookie(response, provider.id)
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
