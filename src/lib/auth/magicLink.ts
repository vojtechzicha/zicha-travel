import crypto from 'crypto'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import { sendAppEmail } from '@/lib/email'
import { safeReturnTo } from '@/lib/auth/session'

// Magic-link login mechanics shared by the /api/auth/magic-link/request
// route and the claim-registration endpoint ("Jsem tu poprvé" — the
// verification link doubles as the first login).

export const MAGIC_LINK_TTL_MINUTES = 15

/** Origin as the visitor sees it (works for zicha.travel wildcard domains). */
export function requestOrigin(headers: Headers): string {
  const host = headers.get('host') || 'zicha.travel'
  const proto =
    headers.get('x-forwarded-proto') ||
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

/**
 * Superadmins must ALWAYS sign in with Microsoft — a magic link would let
 * anyone with brief mailbox access take over the whole system. Email an
 * explanation instead of a login link (the caller still reports generic
 * success, so the form cannot be used to probe for accounts).
 */
export async function sendSuperadminNotice(payload: Payload, user: User): Promise<void> {
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
}

/**
 * Store a fresh one-time login token on the user and email the link.
 * Never call for superadmins — use sendSuperadminNotice instead.
 */
export async function sendMagicLink(
  payload: Payload,
  user: User,
  { origin, returnTo }: { origin: string; returnTo?: string | null },
): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  await payload.update({
    collection: 'users',
    id: user.id,
    data: {
      loginToken: tokenHash,
      loginTokenExpires: new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000).toISOString(),
    },
    overrideAccess: true,
  })

  const params = new URLSearchParams({ token })
  const safePath = safeReturnTo(returnTo)
  if (safePath !== '/') params.set('returnTo', safePath)
  const link = `${origin}/api/auth/magic-link/verify?${params.toString()}`

  await sendAppEmail(payload, {
    to: user.email,
    subject: 'Přihlášení k zicha.travel',
    text: `Přihlaste se jedním kliknutím: ${link}\n\nOdkaz platí ${MAGIC_LINK_TTL_MINUTES} minut. Pokud jste o přihlášení nežádali, e-mail ignorujte.`,
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
          Odkaz platí ${MAGIC_LINK_TTL_MINUTES} minut. Pokud jste o přihlášení nežádali, tento e-mail ignorujte.
        </p>
      </div>
    `,
  })
}
