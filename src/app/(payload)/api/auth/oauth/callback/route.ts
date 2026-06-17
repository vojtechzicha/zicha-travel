import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getProvider } from '@/lib/auth/providers'
import {
  getSessionFromHeaders,
  signSessionToken,
  sessionCookieOptions,
  PAYLOAD_TOKEN_COOKIE,
} from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

function callbackUri(request: NextRequest): string {
  const base = process.env.OAUTH_REDIRECT_BASE || request.nextUrl.origin
  return new URL('/api/auth/oauth/callback', base).toString()
}

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>) {
  const url = new URL(path.startsWith('/') ? path : '/', request.nextUrl.origin)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const returnedState = searchParams.get('state')

  const stateCookie = request.cookies.get('fe-oauth-state')?.value
  let parsed: { state: string; provider: string; mode: string; redirect: string } | null = null
  try {
    parsed = stateCookie ? JSON.parse(stateCookie) : null
  } catch {
    parsed = null
  }

  const redirect = parsed?.redirect && parsed.redirect.startsWith('/') ? parsed.redirect : '/'

  const clearState = (res: NextResponse) => {
    res.cookies.set('fe-oauth-state', '', { path: '/', maxAge: 0 })
    return res
  }

  if (!code || !returnedState || !parsed || parsed.state !== returnedState) {
    return clearState(redirectTo(request, redirect, { login: 'error' }))
  }

  const provider = getProvider(parsed.provider)
  if (!provider) {
    return clearState(redirectTo(request, redirect, { login: 'error' }))
  }

  try {
    const info = await provider.exchangeCode(code, callbackUri(request))
    const email = info.email?.toLowerCase()
    if (!email) {
      return clearState(redirectTo(request, redirect, { login: 'no_email' }))
    }

    const payload = await getPayload({ config })

    // --- Link mode: attach this verified email to the current account ---
    if (parsed.mode === 'link') {
      const session = getSessionFromHeaders(request.headers)
      if (!session || session.collection !== 'accounts') {
        return clearState(redirectTo(request, redirect, { login: 'error' }))
      }

      // Reject if the email already belongs to a different account.
      const existing = await payload.find({
        collection: 'accounts',
        where: { 'emails.email': { equals: email } },
        limit: 1,
        depth: 0,
      })
      const owner = existing.docs[0]
      if (owner && String(owner.id) !== String(session.id)) {
        return clearState(redirectTo(request, redirect, { email: 'taken' }))
      }

      const account = await payload.findByID({ collection: 'accounts', id: session.id, depth: 0 })
      const emails = (account.emails || []) as { email: string }[]
      if (!emails.some((e) => e.email?.toLowerCase() === email)) {
        await payload.update({
          collection: 'accounts',
          id: session.id,
          data: { emails: [...emails, { email }] },
        })
      }
      return clearState(redirectTo(request, redirect, { email: 'added' }))
    }

    // --- Login mode: admin User takes precedence, then participant Account ---
    const users = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      depth: 0,
    })
    if (users.docs.length > 0) {
      const user = users.docs[0]
      const token = signSessionToken({ id: user.id, email: user.email, collection: 'users' })
      const res = redirectTo(request, redirect)
      res.cookies.set(PAYLOAD_TOKEN_COOKIE, token, sessionCookieOptions())
      return clearState(res)
    }

    const accounts = await payload.find({
      collection: 'accounts',
      where: { 'emails.email': { equals: email } },
      limit: 1,
      depth: 0,
    })
    if (accounts.docs.length > 0) {
      const account = accounts.docs[0]
      const token = signSessionToken({ id: account.id, email, collection: 'accounts' })
      const res = redirectTo(request, redirect)
      res.cookies.set(PAYLOAD_TOKEN_COOKIE, token, sessionCookieOptions())
      return clearState(res)
    }

    // No matching identity found.
    return clearState(redirectTo(request, redirect, { login: 'notfound' }))
  } catch (err) {
    console.error('OAuth callback error:', err)
    return clearState(redirectTo(request, redirect, { login: 'error' }))
  }
}
