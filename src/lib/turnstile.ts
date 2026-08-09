// Cloudflare Turnstile — bot protection for the public forms (magic-link
// login and the claim registration, which can CREATE accounts). One
// managed sitekey serves both: the login form runs it invisibly
// (appearance "interaction-only"), the claim dialog shows the full widget
// (appearance "always"). Server-side verification happens here.
//
// Configuration (both unset in local dev = captcha disabled entirely):
// - NEXT_PUBLIC_TURNSTILE_SITE_KEY — the widget sitekey (client, build-time)
// - TURNSTILE_SECRET_KEY — the siteverify secret (server)

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY)
}

/** First hop of x-forwarded-for — the visitor's IP as Vercel saw it. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  return forwarded ? forwarded.split(',')[0].trim() : null
}

/**
 * Verify a widget token with Cloudflare. Fail-closed: an invalid, missing
 * or unverifiable token is rejected whenever the secret is configured.
 * Without the secret (local dev) everything passes.
 */
export async function verifyTurnstileToken(
  token: unknown,
  ip?: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (typeof token !== 'string' || token.length === 0) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip) body.set('remoteip', ip)
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body })
    if (!res.ok) return false
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}
