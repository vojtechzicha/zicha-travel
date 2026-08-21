import type { AppLocale } from '@/i18n/config'

// Bilingual copy for the magic-link login emails. Czech tyká (client-facing
// email, see CLAUDE.md); English is a natural translation of the same
// content. HTML structure and inline styling are identical per locale,
// only the copy differs.

export type EmailContent = {
  subject: string
  text: string
  html: string
}

/**
 * Notice sent instead of a login link when a superadmin requests one
 * (magic links are disabled for superadmins for security reasons).
 */
export function superadminNoticeEmail(locale: AppLocale): EmailContent {
  if (locale === 'en') {
    return {
      subject: 'Sign in to zicha.travel',
      text: 'This account is a superadmin, so login links are disabled for it. Please sign in with Microsoft at /login or /admin.',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #d97706;">zicha.travel</h2>
          <p>
            This account is a <strong>superadmin</strong>, so for security reasons login
            links are disabled for it.
          </p>
          <p>Please use the "Sign in with Microsoft" button instead.</p>
        </div>
      `,
    }
  }
  return {
    subject: 'Přihlášení k zicha.travel',
    text: 'Tento účet je superadmin, přihlašovací odkazy jsou pro něj vypnuté. Přihlas se prosím přes Microsoft na /login nebo /admin.',
    html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #d97706;">zicha.travel</h2>
          <p>
            Tento účet je <strong>superadmin</strong>, přihlašovací odkazy jsou pro něj z
            bezpečnostních důvodů vypnuté.
          </p>
          <p>Přihlas se prosím tlačítkem „Přihlásit se přes Microsoft“.</p>
        </div>
      `,
  }
}

/** The one-time login link email itself. */
export function magicLinkEmail(
  locale: AppLocale,
  { link, ttlMinutes }: { link: string; ttlMinutes: number },
): EmailContent {
  if (locale === 'en') {
    return {
      subject: 'Sign in to zicha.travel',
      text: `Sign in with one click: ${link}\n\nThe link is valid for ${ttlMinutes} minutes. If you did not request this, just ignore this email.`,
      html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #d97706;">zicha.travel</h2>
        <p>Sign in with one click:</p>
        <p style="margin: 24px 0;">
          <a href="${link}"
             style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Sign in
          </a>
        </p>
        <p style="color: #78716c; font-size: 13px;">
          The link is valid for ${ttlMinutes} minutes. If you did not request this sign-in, just ignore this email.
        </p>
      </div>
    `,
    }
  }
  return {
    subject: 'Přihlášení k zicha.travel',
    text: `Přihlas se jedním kliknutím: ${link}\n\nOdkaz platí ${ttlMinutes} minut. Pokud jsi o přihlášení nežádal/a, e-mail ignoruj.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #d97706;">zicha.travel</h2>
        <p>Přihlas se jedním kliknutím:</p>
        <p style="margin: 24px 0;">
          <a href="${link}"
             style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Přihlásit se
          </a>
        </p>
        <p style="color: #78716c; font-size: 13px;">
          Odkaz platí ${ttlMinutes} minut. Pokud jsi o přihlášení nežádal/a, tento e-mail ignoruj.
        </p>
      </div>
    `,
  }
}
