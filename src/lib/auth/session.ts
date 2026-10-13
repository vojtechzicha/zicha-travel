import jwt from 'jsonwebtoken'
import type { NextResponse } from 'next/server'

// Session tokens for BOTH login flows (OAuth — Microsoft, Google or Apple —
// and magic link) are
// plain JWTs signed with PAYLOAD_SECRET and stored in the `payload-token`
// cookie. The always-registered `app-jwt` auth strategy on the Users
// collection (src/collections/Users.ts) verifies them, so the same session
// works for the admin panel and the frontend.

/** Origin as the visitor sees it (works for zicha.travel wildcard domains). */
export function requestOrigin(headers: Headers): string {
  const host = headers.get('host') || 'zicha.travel'
  const proto =
    headers.get('x-forwarded-proto') ||
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * Frontend users stay signed in for a year; admin sessions stay short.
 * A year (up from the original 30 days) because the site now installs as
 * an app on phones and trips are months apart — losing the login between
 * trips defeated the installed app. Combined with the rolling refresh
 * (POST /api/auth/refresh) any account that opens the app at least once a
 * year effectively never signs in again. Mirrored in the cookie table of
 * the published privacy policy — change both together.
 */
export function sessionDurationSeconds(role: string | null | undefined): number {
  return role === 'user' ? 365 * 24 * 60 * 60 : 2 * 60 * 60
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
 * One-shot marker for the analytics login funnel: the redirect after a
 * successful sign-in carries `zt_login_evt=<method>`; AnalyticsProvider
 * reads it, fires `login_completed` and clears it. Deliberately NOT
 * HttpOnly (the client must read it) and short-lived — it contains only
 * the method name, never who signed in.
 */
export function setLoginEventCookie(
  response: NextResponse,
  method: 'magic-link' | 'microsoft' | 'google' | 'apple',
): void {
  response.cookies.set('zt_login_evt', method, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax',
    maxAge: 120,
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
 *
 * Callers resolve the result against an origin (`new URL(path, origin)`),
 * and the WHATWG parser has two ways to escape that origin beyond a plain
 * leading "//": it reads "\" as "/" for http(s) URLs, and it STRIPS tabs
 * and newlines before parsing. So "/\evil.com" and "/<TAB>/evil.com" both
 * resolve to https://evil.com/ — reject those characters outright.
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || /[\\\t\n\r]/.test(value)) return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

/**
 * Hosts we are willing to redirect back to: the deployment's own host, plus
 * anything under SESSION_COOKIE_DOMAIN (`.zicha.travel` ⇒ the apex and every
 * chata subdomain). That is exactly the boundary the session cookie already
 * spans, so it grants no reach the sign-in didn't already have.
 */
function isTrustedRedirectHost(host: string, fallbackOrigin: string): boolean {
  const hostname = host.split(':')[0].toLowerCase()
  if (!hostname) return false
  try {
    if (hostname === new URL(fallbackOrigin).hostname.toLowerCase()) return true
  } catch {
    // fall through to the cookie-domain check
  }
  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN?.toLowerCase()
  if (!cookieDomain) return false
  const apex = cookieDomain.replace(/^\./, '')
  return hostname === apex || hostname.endsWith(`.${apex}`)
}

/**
 * Resolve a stored return target to an absolute URL.
 *
 * A sign-in may START on a chata subdomain (lipno.zicha.travel) but the
 * Microsoft callback always lands on the apex — AZURE_REDIRECT_URI is fixed
 * in the app registration. Carrying only the PATH through that hop dropped
 * people on the apex homepage, so the return target is stored absolute and
 * validated here. Non-absolute values (and untrusted hosts) keep the old
 * behaviour: the path, on the fallback origin.
 */
export function safeReturnUrl(
  value: string | null | undefined,
  fallbackOrigin: string,
): string {
  const home = (): string => new URL('/', fallbackOrigin).toString()
  if (!value) return home()

  let baseOrigin: string
  let path: string

  if (value.startsWith('/')) {
    baseOrigin = fallbackOrigin
    path = safeReturnTo(value)
  } else {
    let target: URL
    try {
      target = new URL(value)
    } catch {
      return home()
    }
    // No javascript:, data:, mailto: … — only real page loads
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return home()
    path = safeReturnTo(`${target.pathname}${target.search}`)
    baseOrigin = isTrustedRedirectHost(target.host, fallbackOrigin)
      ? target.origin
      : fallbackOrigin
  }

  // Belt and braces: rather than trusting the sanitized string, resolve it
  // and confirm we did not leave the origin we chose. Any parser trick that
  // slips past safeReturnTo dies here.
  try {
    const resolved = new URL(path, baseOrigin)
    if (resolved.origin !== new URL(baseOrigin).origin) return home()
    return resolved.toString()
  } catch {
    return home()
  }
}

/**
 * Where to send someone after signing OUT, derived from the Referer.
 *
 * Chata pages are public by design, so logout leaves you on the page you
 * were reading, re-rendered as an anonymous visitor (the Wikipedia model)
 * rather than bouncing you to the homepage. Same-origin navigations send
 * the full URL under the default referrer policy, so the footer link needs
 * no extra parameter.
 *
 * Stricter than safeReturnUrl: an untrusted host is dropped ENTIRELY rather
 * than having its path kept, because a foreign referer says nothing about
 * where this visitor wanted to be. Returns null when there is nothing
 * usable — callers fall back to "/".
 */
export function refererReturnUrl(
  referer: string | null | undefined,
  origin: string,
): string | null {
  if (!referer) return null
  let url: URL
  try {
    url = new URL(referer)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!isTrustedRedirectHost(url.host, origin)) return null
  // Never bounce back into the admin panel (its own session just ended) or
  // an API route — neither is a page anyone meant to be on
  if (/^\/(admin|api)(\/|$)/.test(url.pathname)) return null
  return safeReturnUrl(url.toString(), origin)
}
