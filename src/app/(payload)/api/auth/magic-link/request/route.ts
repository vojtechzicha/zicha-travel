import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  MAGIC_LINK_TTL_MINUTES,
  requestOrigin,
  sendMagicLink,
  sendSuperadminNotice,
} from '@/lib/auth/magicLink'
import { clientIp, verifyTurnstileToken } from '@/lib/turnstile'
import {
  MAGIC_LINK_RESEND_COOLDOWN_SECONDS,
  RATE_LIMITS,
  checkRateLimit,
  rateLimitResponse,
} from '@/lib/rateLimit'
import { LOCALE_COOKIE, pickLocale } from '@/i18n/config'

/**
 * POST /api/auth/magic-link/request { email, returnTo? }
 *
 * Sends a one-time login link to an EXISTING account. Accounts are created
 * only in the admin panel (from a participant) or through the participant
 * claim flow; this endpoint never creates one and never reveals whether
 * the email is known.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let email: unknown
  let returnTo: unknown
  let turnstileToken: unknown
  try {
    const body = await request.json()
    email = body?.email
    returnTo = body?.returnTo
    turnstileToken = body?.turnstileToken
  } catch {
    // fall through to validation
  }

  if (typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  // Throttle before doing any work: per IP and per address (this endpoint
  // emails an address supplied by the caller, so it must not be usable to
  // mail-bomb somebody — compliance blocker 9)
  const ip = clientIp(request.headers)
  const normalizedEmail = email.trim().toLowerCase()
  const ipCheck = checkRateLimit(`magic-link:ip:${ip}`, RATE_LIMITS.magicLinkPerIp)
  if (!ipCheck.allowed) return rateLimitResponse(ipCheck) as NextResponse
  const emailCheck = checkRateLimit(
    `magic-link:email:${normalizedEmail}`,
    RATE_LIMITS.magicLinkPerEmail,
  )
  if (!emailCheck.allowed) return rateLimitResponse(emailCheck) as NextResponse

  // Bot gate (no-op where Turnstile is not configured — local dev)
  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return NextResponse.json({ error: 'captcha' }, { status: 403 })
  }

  const payload = await getPayload({ config })

  const users = await payload.find({
    collection: 'users',
    where: { email: { equals: normalizedEmail } },
    limit: 1,
  })

  // Always report success so the form cannot be used to probe for accounts.
  // (No log line — the submitted address is personal data and an unknown
  // address is not an operational event. Compliance blocker 4.)
  if (users.docs.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const user = users.docs[0]

  // Database-backed cooldown per address (survives serverless cold starts):
  // a valid token issued moments ago means a link is already on its way —
  // report success without sending another email.
  const tokenExpires = user.loginTokenExpires ? Date.parse(user.loginTokenExpires) : null
  if (tokenExpires != null && !Number.isNaN(tokenExpires)) {
    const issuedAt = tokenExpires - MAGIC_LINK_TTL_MINUTES * 60 * 1000
    if (Date.now() - issuedAt < MAGIC_LINK_RESEND_COOLDOWN_SECONDS * 1000) {
      return NextResponse.json({ ok: true })
    }
  }

  // The requester IS the recipient, so their UI locale picks the email copy.
  const locale = pickLocale(
    request.cookies.get(LOCALE_COOKIE)?.value,
    request.headers.get('accept-language'),
  )

  if (user.role === 'superadmin') {
    await sendSuperadminNotice(payload, user, locale)
    return NextResponse.json({ ok: true })
  }

  try {
    await sendMagicLink(payload, user, {
      origin: requestOrigin(request.headers),
      returnTo: typeof returnTo === 'string' ? returnTo : null,
      locale,
    })
  } catch (err) {
    payload.logger.error({ err }, 'Failed to send magic link email')
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
