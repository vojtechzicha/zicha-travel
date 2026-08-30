import type { AppLocale } from '@/i18n/config'
import type { EmailContent } from '@/lib/auth/magicLinkEmails'

// "Potvrď svůj hlas" — the email an anonymous voter gets instead of a bare
// login link (docs/PRD-planovani.md, "Nepotvrzené hlasy"). The vote itself
// is in the subject line and the body, so the person can see what they
// are confirming and the mail stays findable. Czech tyká (client-facing),
// English is a natural translation; structure identical per locale.

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface VoteConfirmEmailArgs {
  link: string
  chataName: string
  voterName: string
  dates: string[]
  places: string[]
  ttlDays: number
}

export function voteConfirmEmail(locale: AppLocale, args: VoteConfirmEmailArgs): EmailContent {
  const { link, chataName, voterName, dates, places, ttlDays } = args
  const list = (items: string[]) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')

  if (locale === 'en') {
    const placesText = places.length > 0 ? places.join(', ') : 'no preference'
    return {
      subject: `Confirm your vote: ${chataName}`,
      text:
        `You voted on ${chataName} as ${voterName}.\n\n` +
        `Dates that work: ${dates.join(', ')}\n` +
        `Places you like: ${placesText}\n\n` +
        `Confirm the vote with one click: ${link}\n\n` +
        `The link is valid for ${ttlDays} days. The vote is also saved the moment you sign in ` +
        `to zicha.travel any other way (Google, Apple, Microsoft or email). ` +
        `If this wasn't you, just ignore this email.`,
      html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #d97706;">zicha.travel</h2>
        <p>You voted on <strong>${escapeHtml(chataName)}</strong> as <strong>${escapeHtml(voterName)}</strong>.</p>
        <p style="margin: 0;">Dates that work:</p>
        <ul style="margin: 4px 0 12px;">${list(dates)}</ul>
        <p style="margin: 0;">Places you like:</p>
        ${places.length > 0 ? `<ul style="margin: 4px 0 12px;">${list(places)}</ul>` : `<p style="margin: 4px 0 12px; color: #78716c;">no preference</p>`}
        <p style="margin: 24px 0;">
          <a href="${link}"
             style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Confirm my vote
          </a>
        </p>
        <p style="color: #78716c; font-size: 13px;">
          The link is valid for ${ttlDays} days. The vote is also saved the moment you sign in to
          zicha.travel any other way (Google, Apple, Microsoft or email).
          If this wasn't you, just ignore this email.
        </p>
      </div>
    `,
    }
  }

  const placesText = places.length > 0 ? places.join(', ') : 'bez preference'
  return {
    subject: `Potvrď svůj hlas: ${chataName}`,
    text:
      `Hlasoval(a) jsi na chatě ${chataName} jako ${voterName}.\n\n` +
      `Vyhovující termíny: ${dates.join(', ')}\n` +
      `Líbí se ti: ${placesText}\n\n` +
      `Hlas potvrdíš jedním kliknutím: ${link}\n\n` +
      `Odkaz platí ${ttlDays} dní. Hlas se uloží i tím, že se na zicha.travel přihlásíš ` +
      `jakkoli jinak (Google, Apple, Microsoft nebo e-mailem). ` +
      `Pokud jsi nehlasoval(a), e-mail ignoruj.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #d97706;">zicha.travel</h2>
        <p>Hlasoval(a) jsi na chatě <strong>${escapeHtml(chataName)}</strong> jako <strong>${escapeHtml(voterName)}</strong>.</p>
        <p style="margin: 0;">Vyhovující termíny:</p>
        <ul style="margin: 4px 0 12px;">${list(dates)}</ul>
        <p style="margin: 0;">Líbí se ti:</p>
        ${places.length > 0 ? `<ul style="margin: 4px 0 12px;">${list(places)}</ul>` : `<p style="margin: 4px 0 12px; color: #78716c;">bez preference</p>`}
        <p style="margin: 24px 0;">
          <a href="${link}"
             style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Potvrdit hlas
          </a>
        </p>
        <p style="color: #78716c; font-size: 13px;">
          Odkaz platí ${ttlDays} dní. Hlas se uloží i tím, že se na zicha.travel přihlásíš
          jakkoli jinak (Google, Apple, Microsoft nebo e-mailem).
          Pokud jsi nehlasoval(a), e-mail ignoruj.
        </p>
      </div>
    `,
  }
}
