// Cookie-consent state for analytics ("Měření návštěvnosti") — phase 1 of
// docs/PRD-analytika.md. Pure logic only: the ConsentBanner component owns
// the DOM side (document.cookie, the dialog), src/lib/analytics.ts (phase 2)
// will own what a granted/denied decision actually switches on.
//
// The consent record itself lives in the `zt_consent` cookie — storing it is
// strictly necessary (it IS the consent record), so no consent is needed for
// this cookie. Format: `<decision>.<decidedAt ms>`, e.g. `granted.1754828400000`.
// A decision older than 12 months is treated as absent → the banner re-asks.

export type ConsentDecision = 'granted' | 'denied'

export const CONSENT_COOKIE = 'zt_consent'

/** Re-prompt horizon: 12 months, also the cookie's Max-Age. */
export const CONSENT_TTL_SECONDS = 365 * 24 * 60 * 60

/**
 * Parse a raw `zt_consent` cookie value into the current decision.
 * Missing, malformed or expired (older than 12 months) values all mean
 * "no decision" → the banner shows again.
 */
export function resolveConsent(
  cookieValue: string | null | undefined,
  now: Date,
): ConsentDecision | null {
  if (!cookieValue) return null
  const dot = cookieValue.lastIndexOf('.')
  if (dot === -1) return null
  const decision = cookieValue.slice(0, dot)
  const decidedAt = Number(cookieValue.slice(dot + 1))
  if (decision !== 'granted' && decision !== 'denied') return null
  if (!Number.isFinite(decidedAt)) return null
  if (now.getTime() - decidedAt > CONSENT_TTL_SECONDS * 1000) return null
  return decision
}

/** The raw value to store: `granted.1754828400000`. */
export function serializeConsent(decision: ConsentDecision, now: Date): string {
  return `${decision}.${now.getTime()}`
}

/**
 * The string assigned to `document.cookie` when the visitor decides.
 * `domain` is SESSION_COOKIE_DOMAIN (`.zicha.travel` in production) so ONE
 * decision covers the apex and every chata subdomain — same variable, same
 * reasoning as the auth session cookie (src/lib/auth/session.ts). Unset =
 * host-only (local dev). Not HttpOnly by design: the client both writes and
 * reads it, and it contains nothing sensitive.
 */
export function consentCookieString(
  decision: ConsentDecision,
  now: Date,
  options: { domain?: string; secure?: boolean } = {},
): string {
  let cookie = `${CONSENT_COOKIE}=${serializeConsent(decision, now)}; Max-Age=${CONSENT_TTL_SECONDS}; Path=/; SameSite=Lax`
  if (options.domain) cookie += `; Domain=${options.domain}`
  if (options.secure) cookie += `; Secure`
  return cookie
}

/** Extract the raw `zt_consent` value from a Cookie header / document.cookie. */
export function readConsentCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === CONSENT_COOKIE) return part.slice(eq + 1).trim()
  }
  return null
}

/**
 * Whether analytics (and therefore the consent banner) is on at all. Gated
 * on NEXT_PUBLIC_POSTHOG_KEY exactly like RESEND_API_KEY / S3_ENDPOINT /
 * Turnstile gate their features — unset means the whole thing is inert and
 * local dev needs no setup. A cookie banner with no cookies behind it is
 * noise, so the banner follows the same switch.
 */
export function analyticsEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
}
