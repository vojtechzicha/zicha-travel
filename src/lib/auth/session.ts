import jwt from 'jsonwebtoken'
import type { NextResponse } from 'next/server'

// Session tokens for BOTH login flows (Microsoft OAuth and magic link) are
// plain JWTs signed with PAYLOAD_SECRET and stored in the `payload-token`
// cookie. The always-registered `app-jwt` auth strategy on the Users
// collection (src/collections/Users.ts) verifies them, so the same session
// works for the admin panel and the frontend.

/** Frontend users stay signed in for a month; admin sessions stay short. */
export function sessionDurationSeconds(role: string | null | undefined): number {
  return role === 'user' ? 30 * 24 * 60 * 60 : 2 * 60 * 60
}

/**
 * Cookie Domain attribute. Set SESSION_COOKIE_DOMAIN=.zicha.travel in
 * production so one session works across the apex and every chata
 * subdomain (and so the OAuth flow, whose callback always lands on the
 * apex, can read the state cookie set on a subdomain). Unset = host-only
 * cookies (local dev).
 */
export function sessionCookieDomain(): { domain: string } | Record<string, never> {
  return process.env.SESSION_COOKIE_DOMAIN ? { domain: process.env.SESSION_COOKIE_DOMAIN } : {}
}

export function signSessionToken(
  user: { id: number | string; email: string; role?: string | null },
): { token: string; maxAge: number } {
  const maxAge = sessionDurationSeconds(user.role)
  const token = jwt.sign(
    { id: user.id, email: user.email, collection: 'users' },
    process.env.PAYLOAD_SECRET!,
    { expiresIn: maxAge },
  )
  return { token, maxAge }
}

export function setSessionCookie(response: NextResponse, token: string, maxAge: number): void {
  response.cookies.set('payload-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax',
    maxAge,
    ...sessionCookieDomain(),
  })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set('payload-token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax',
    maxAge: 0,
    ...sessionCookieDomain(),
  })
}

/**
 * Only allow same-origin path redirects ("/", "/lipno?view=finance", ...) —
 * anything absolute or protocol-relative falls back to `/`.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}
