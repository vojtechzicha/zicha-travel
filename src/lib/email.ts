import type { Payload } from 'payload'

// All outgoing mail goes through here. Two safety valves:
// - On Vercel PREVIEW deployments (VERCEL_ENV !== 'production') mail is
//   NEVER sent to the real recipient: it is redirected to EMAIL_PREVIEW_TO
//   (subject prefixed with the original recipient), or only logged when
//   that variable is unset.
// - Without a configured adapter (no RESEND_API_KEY — e.g. local dev)
//   Payload's default email handler just logs the message to the console.

export type EmailDelivery =
  | { mode: 'sent'; to: string }
  | { mode: 'redirected'; to: string; originalTo: string }
  | { mode: 'logged'; to: string }

function isPreviewDeployment(): boolean {
  return Boolean(process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production')
}

export async function sendAppEmail(
  payload: Payload,
  { to, subject, html, text }: { to: string; subject: string; html: string; text?: string },
): Promise<EmailDelivery> {
  if (isPreviewDeployment()) {
    const previewTo = process.env.EMAIL_PREVIEW_TO
    const previewSubject = `[preview → ${to}] ${subject}`
    if (!previewTo) {
      payload.logger.info(
        { to, subject },
        'Preview deployment without EMAIL_PREVIEW_TO — email suppressed (logged only)',
      )
      return { mode: 'logged', to }
    }
    await payload.sendEmail({ to: previewTo, subject: previewSubject, html, text })
    return { mode: 'redirected', to: previewTo, originalTo: to }
  }

  await payload.sendEmail({ to, subject, html, text })
  return { mode: 'sent', to }
}
