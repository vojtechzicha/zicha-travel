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

/**
 * Cookie Domain values whose `payload-token` could be visible on this
 * host. The session cookie may exist host-only (no SESSION_COOKIE_DOMAIN)
 * or domain-wide — and a PREVIEW deployment on preview.zicha.travel
 * receives the production `.zicha.travel` cookie even though its own env
 * has no SESSION_COOKIE_DOMAIN. Logout must clear every variant, so we
 * also derive the apex domain from the request host. Hosts on public
 * suffixes (*.vercel.app), localhost and IPs yield nothing extra — the
 * browser ignores those clears, which is harmless.
 */
export function cookieDomainsToClear(requestHost?: string | null): string[] {
  const domains = new Set<string>()
  if (process.env.SESSION_COOKIE_DOMAIN) domains.add(process.env.SESSION_COOKIE_DOMAIN)
  const hostname = (requestHost || '').split(':')[0].toLowerCase()
  const labels = hostname.split('.')
  const isIp = /^[0-9.]+$/.test(hostname)
  if (labels.length >= 2 && !isIp && hostname !== 'localhost') {
    domains.add(`.${labels.slice(-2).join('.')}`)
  }
  return [...domains]
}

export function clearSessionCookie(response: NextResponse, requestHost?: string | null): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  const base = `payload-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${secure}`
  // NextResponse.cookies dedupes by name, so append raw Set-Cookie headers
  // to clear the host-only cookie AND every domain variant in one response
  response.headers.append('Set-Cookie', base)
  for (const domain of cookieDomainsToClear(requestHost)) {
    response.headers.append('Set-Cookie', `${base}; Domain=${domain}`)
  }
}

/**
 * Only allow same-origin path redirects ("/", "/lipno?view=finance", ...) —
 * anything absolute or protocol-relative falls back to `/`.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}
