import crypto from 'crypto'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import type { AppLocale } from '@/i18n/config'
import { sendAppEmail } from '@/lib/email'
import { safeReturnTo } from '@/lib/auth/session'
import { magicLinkEmail, superadminNoticeEmail } from '@/lib/auth/magicLinkEmails'

// Magic-link login mechanics shared by the /api/auth/magic-link/request
// route and the claim-registration endpoint ("Jsem tu poprvé" — the
// verification link doubles as the first login).
//
// Locale: both senders take an AppLocale (default 'cs') and pick the email
// copy from magicLinkEmails.ts. The claim emails in src/utils/claimRequests.ts
// stay Czech-only by design — their audience is the Czech admin family.

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
export async function sendSuperadminNotice(
  payload: Payload,
  user: User,
  locale: AppLocale = 'cs',
): Promise<void> {
  try {
    await sendAppEmail(payload, {
      to: user.email,
      ...superadminNoticeEmail(locale),
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
  {
    origin,
    returnTo,
    locale = 'cs',
  }: { origin: string; returnTo?: string | null; locale?: AppLocale },
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
    ...magicLinkEmail(locale, { link, ttlMinutes: MAGIC_LINK_TTL_MINUTES }),
  })
}
