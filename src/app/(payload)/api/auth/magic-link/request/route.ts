import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  requestOrigin,
  sendMagicLink,
  sendSuperadminNotice,
} from '@/lib/auth/magicLink'
import { clientIp, verifyTurnstileToken } from '@/lib/turnstile'
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

  // Bot gate (no-op where Turnstile is not configured — local dev)
  if (!(await verifyTurnstileToken(turnstileToken, clientIp(request.headers)))) {
    return NextResponse.json({ error: 'captcha' }, { status: 403 })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const payload = await getPayload({ config })

  const users = await payload.find({
    collection: 'users',
    where: { email: { equals: normalizedEmail } },
    limit: 1,
  })

  // Always report success so the form cannot be used to probe for accounts
  if (users.docs.length === 0) {
    payload.logger.info({ email: normalizedEmail }, 'Magic link requested for unknown email')
    return NextResponse.json({ ok: true })
  }

  const user = users.docs[0]

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
