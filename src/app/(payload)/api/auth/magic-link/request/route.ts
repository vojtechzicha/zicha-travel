import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { sendAppEmail } from '@/lib/email'
import { safeReturnTo } from '@/lib/auth/session'

const TOKEN_TTL_MINUTES = 15

/** Origin as the visitor sees it (works for zicha.travel wildcard domains). */
function requestOrigin(request: NextRequest): string {
  const host = request.headers.get('host') || request.nextUrl.host
  const proto =
    request.headers.get('x-forwarded-proto') ||
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * POST /api/auth/magic-link/request { email, returnTo? }
 *
 * Sends a one-time login link to an EXISTING account. Accounts are created
 * only in the admin panel (from a participant); this endpoint never creates
 * one and never reveals whether the email is known.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let email: unknown
  let returnTo: unknown
  try {
    const body = await request.json()
    email = body?.email
    returnTo = body?.returnTo
  } catch {
    // fall through to validation
  }

  if (typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
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

  // Superadmins must ALWAYS sign in with Microsoft — a magic link would let
  // anyone with brief mailbox access take over the whole system. Reply with
  // the same generic ok (no account probing) but email an explanation
  // instead of a login link.
  if (user.role === 'superadmin') {
    try {
      await sendAppEmail(payload, {
        to: user.email,
        subject: 'Přihlášení k zicha.travel',
        text: 'Tento účet je superadmin — přihlašovací odkazy jsou pro něj vypnuté. Přihlaste se prosím přes Microsoft na /login nebo /admin.',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #d97706;">zicha.travel</h2>
            <p>
              Tento účet je <strong>superadmin</strong> — přihlašovací odkazy jsou pro něj z
              bezpečnostních důvodů vypnuté.
            </p>
            <p>Přihlaste se prosím tlačítkem „Přihlásit se přes Microsoft".</p>
          </div>
        `,
      })
    } catch (err) {
      payload.logger.error({ err }, 'Failed to send superadmin magic-link notice')
    }
    return NextResponse.json({ ok: true })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      loginToken: tokenHash,
      loginTokenExpires: new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString(),
    },
    overrideAccess: true,
  })

  const params = new URLSearchParams({ token })
  const safePath = safeReturnTo(typeof returnTo === 'string' ? returnTo : null)
  if (safePath !== '/') params.set('returnTo', safePath)
  const link = `${requestOrigin(request)}/api/auth/magic-link/verify?${params.toString()}`

  try {
    await sendAppEmail(payload, {
      to: user.email,
      subject: 'Přihlášení k zicha.travel',
      text: `Přihlaste se jedním kliknutím: ${link}\n\nOdkaz platí ${TOKEN_TTL_MINUTES} minut. Pokud jste o přihlášení nežádali, e-mail ignorujte.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #d97706;">zicha.travel</h2>
          <p>Přihlaste se jedním kliknutím:</p>
          <p style="margin: 24px 0;">
            <a href="${link}"
               style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Přihlásit se
            </a>
          </p>
          <p style="color: #78716c; font-size: 13px;">
            Odkaz platí ${TOKEN_TTL_MINUTES} minut. Pokud jste o přihlášení nežádali, tento e-mail ignorujte.
          </p>
        </div>
      `,
    })
  } catch (err) {
    payload.logger.error({ err }, 'Failed to send magic link email')
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
