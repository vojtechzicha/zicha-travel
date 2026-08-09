import type { Payload } from 'payload'
import type { Chata, ClaimRequest, Participant, User } from '../payload-types'
import { refId, isSuperadmin } from '../lib/access'
import { signDecideToken } from '../lib/claimRequests'
import { sendAppEmail } from '../lib/email'

// Server-side plumbing of the participant-claim flow ("claim účastníka"):
// admin notification emails with signed decide links, and the side effects
// of a decision (linking the participant, auto-rejecting rival claims,
// telling the requester). Pure rules live in src/lib/claimRequests.ts; the
// collection endpoints and hooks in src/collections/ClaimRequests.ts call
// into here. See docs/PRD-claim.md.

/** Base origin of a chata's public site (subdomain if it has one). */
export function chataOrigin(chata: Pick<Chata, 'domains'>): string {
  const domain = chata.domains?.[0]?.domain
  return domain ? `https://${domain}` : 'https://zicha.travel'
}

/** The chata's finance view — used in requester emails. */
export function chataFinanceUrl(chata: Pick<Chata, 'domains' | 'slug'>): string {
  const domain = chata.domains?.[0]?.domain
  const home = domain ? `https://${domain}` : `https://zicha.travel/${chata.slug}`
  return `${home}?view=finance`
}

/** Superadmins + admins with this chata assigned — the decision makers. */
export async function claimDecisionMakers(payload: Payload, chataId: unknown): Promise<User[]> {
  const admins = await payload.find({
    collection: 'users',
    where: { role: { in: ['superadmin', 'admin'] } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const target = refId(chataId)
  return admins.docs.filter(
    (u) =>
      isSuperadmin(u) ||
      ((u.assignedChatas as unknown[]) || []).some((c) => refId(c) === target),
  )
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface NotifyArgs {
  claim: Pick<ClaimRequest, 'id' | 'createdAt'>
  participant: Participant
  chata: Chata
  requester: User
  /** origin the decide links should live on (request origin or chataOrigin) */
  origin: string
  reminder?: boolean
}

/**
 * "Někdo říká, že je Katka" — email to every decision maker with signed
 * approve/reject links (7-day tokens bound to the recipient). Failures are
 * logged, never thrown: a lost email must not lose the claim itself (the
 * queue stays visible in the admin panel).
 */
export async function notifyClaimDecisionMakers(payload: Payload, args: NotifyArgs): Promise<void> {
  const { claim, participant, chata, requester, origin, reminder } = args
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) {
    payload.logger.error('PAYLOAD_SECRET missing — cannot sign claim decide links')
    return
  }

  let recipients: User[] = []
  let otherPending = 0
  let requesterLinkedElsewhere = 0
  try {
    recipients = await claimDecisionMakers(payload, chata.id)
    const [others, linked] = await Promise.all([
      payload.find({
        collection: 'claim-requests',
        where: {
          and: [
            { participant: { equals: participant.id } },
            { status: { equals: 'pending' } },
            { id: { not_equals: claim.id } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'participants',
        where: { account: { equals: requester.id } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      }),
    ])
    otherPending = others.totalDocs
    requesterLinkedElsewhere = linked.totalDocs
  } catch (err) {
    payload.logger.error({ err }, 'Failed to gather claim notification context')
  }

  const requestedAt = new Date(claim.createdAt).toLocaleString('cs-CZ', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Prague',
  })
  const accountNote =
    requesterLinkedElsewhere > 0
      ? 'účet už má propojené účastníky na jiných chatách'
      : 'účet nový — zatím bez propojených účastníků'
  const othersNote =
    otherPending > 0
      ? `pozor, o účastníka žádá ještě ${otherPending} další žádost(i)`
      : 'žádná další žádost nečeká'
  const subject = reminder
    ? `Připomínka: žádost o propojení s účastníkem ${participant.name} stále čeká`
    : `Někdo říká, že je ${participant.name}`

  for (const admin of recipients) {
    if (!admin.email) continue
    try {
      const token = signDecideToken({ claimId: claim.id, adminId: admin.id }, secret)
      const decideUrl = `${origin}/claims/decide?token=${encodeURIComponent(token)}`
      await sendAppEmail(payload, {
        to: admin.email,
        subject,
        text:
          `Na chatě ${chata.name} se k účastníkovi ${participant.name} hlásí účet ` +
          `${requester.email} (${accountNote}). Žádost z ${requestedAt} • ${othersNote}.\n\n` +
          `Schválit nebo zamítnout: ${decideUrl}\n\n` +
          `Odkaz platí 7 dní a je určen jen vám. Žádosti najdete i v administraci pod „Claim Requests".`,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color: #d97706;">zicha.travel</h2>
            <h3 style="margin: 0 0 10px;">${reminder ? 'Připomínka: žádost stále čeká' : `Někdo říká, že je ${escapeHtml(participant.name)}`}</h3>
            <p style="line-height: 1.6;">
              Na chatě <strong>${escapeHtml(chata.name)}</strong> se k účastníkovi
              <strong>${escapeHtml(participant.name)}</strong> hlásí účet
              <strong>${escapeHtml(requester.email)}</strong> (e-mail ověřený, ${accountNote}). Sedí to?
            </p>
            <p style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #4b5563;">
              žádost z ${requestedAt} &bull; ${othersNote}
            </p>
            <p style="margin: 24px 0;">
              <a href="${decideUrl}"
                 style="background: #16a34a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Rozhodnout (schválit / zamítnout)
              </a>
            </p>
            <p style="color: #78716c; font-size: 13px;">
              Odkaz platí 7 dní a je určen jen vám. Žádosti najdete i v administraci pod „Claim Requests".
            </p>
          </div>
        `,
      })
    } catch (err) {
      payload.logger.error({ err, admin: admin.email }, 'Failed to send claim notification')
    }
  }
}

/**
 * Side effects of a pending → approved/rejected transition. Runs from the
 * claim-requests afterChange hook, so the SAME logic covers the decide
 * endpoint, the admin panel and auto-approval:
 * - approved: link the participant to the account, auto-reject every rival
 *   pending claim (each rejection re-enters the hook and emails its own
 *   requester), email the requester (unless auto-approved — they are
 *   looking at the confirmation screen right now)
 * - rejected: email the requester with the reason
 */
export async function runClaimDecisionSideEffects(
  payload: Payload,
  doc: ClaimRequest,
): Promise<void> {
  const participantId = doc.participant != null ? refId(doc.participant) : null
  const userId = doc.user != null ? refId(doc.user) : null

  const [participant, chata, requester] = await Promise.all([
    participantId
      ? payload
          .findByID({ collection: 'participants', id: participantId, depth: 0 })
          .catch(() => null)
      : null,
    doc.chata != null
      ? payload
          .findByID({
            collection: 'chatas',
            id: refId(doc.chata),
            depth: 0,
            context: { triggerAfterRead: false },
          })
          .catch(() => null)
      : null,
    userId
      ? payload
          .findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })
          .catch(() => null)
      : null,
  ])

  if (doc.status === 'approved' && participant && userId) {
    // Link the participant to the claimant's account (idempotent; the
    // beforeChange hook already blocked conflicting links)
    if (participant.account == null || refId(participant.account) !== userId) {
      await payload.update({
        collection: 'participants',
        id: participant.id,
        data: { account: Number(userId) },
        overrideAccess: true,
        depth: 0,
      })
    }

    // First come, first served: approving one claim rejects the others
    // (each update re-enters the hook and emails that requester)
    const rivals = await payload.find({
      collection: 'claim-requests',
      where: {
        and: [
          { participant: { equals: participant.id } },
          { status: { equals: 'pending' } },
          { id: { not_equals: doc.id } },
        ],
      },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    for (const rival of rivals.docs) {
      try {
        await payload.update({
          collection: 'claim-requests',
          id: rival.id,
          data: {
            status: 'rejected',
            reason: 'Správce propojil účastníka s jiným účtem.',
            decidedBy: doc.decidedBy ?? null,
            decidedAt: new Date().toISOString(),
          },
          overrideAccess: true,
          depth: 0,
        })
      } catch (err) {
        payload.logger.error({ err, rival: rival.id }, 'Failed to auto-reject rival claim')
      }
    }
  }

  // Tell the requester how it went (skip for auto-approvals — the person is
  // looking at the "Propojeno!" screen right now)
  if (!requester?.email || !participant || doc.autoApproved) return
  try {
    if (doc.status === 'approved') {
      const financeUrl = chata ? chataFinanceUrl(chata) : 'https://zicha.travel'
      await sendAppEmail(payload, {
        to: requester.email,
        subject: `Propojení schváleno — ${participant.name} je teď tvoje`,
        text:
          `Správce chaty ${chata?.name ?? ''} potvrdil, že účastník ${participant.name} jsi ty. ` +
          `Po přihlášení uvidíš svoje výdaje a vyrovnání: ${financeUrl}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #d97706;">zicha.travel</h2>
            <h3 style="margin: 0 0 10px;">Propojení schváleno</h3>
            <p style="line-height: 1.6;">
              Správce chaty <strong>${escapeHtml(chata?.name ?? '')}</strong> potvrdil, že účastník
              <strong>${escapeHtml(participant.name)}</strong> jsi ty.
            </p>
            <p style="margin: 24px 0;">
              <a href="${financeUrl}"
                 style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Otevřít moje finance
              </a>
            </p>
          </div>
        `,
      })
    } else if (doc.status === 'rejected') {
      await sendAppEmail(payload, {
        to: requester.email,
        subject: `Tohle bohužel nevyšlo — propojení s účastníkem ${participant.name}`,
        text:
          `Správce chaty ${chata?.name ?? ''} nepotvrdil propojení s účastníkem ${participant.name}.` +
          (doc.reason ? ` Napsal k tomu: „${doc.reason}"` : '') +
          `\n\nPokud jde o nedorozumění, ozvěte se správci chaty nebo požádejte znovu.`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #d97706;">zicha.travel</h2>
            <h3 style="margin: 0 0 10px;">Tohle bohužel nevyšlo</h3>
            <p style="line-height: 1.6;">
              Správce chaty <strong>${escapeHtml(chata?.name ?? '')}</strong> nepotvrdil propojení s účastníkem
              <strong>${escapeHtml(participant.name)}</strong>.
              ${doc.reason ? `Napsal k tomu: <em>„${escapeHtml(doc.reason)}"</em>` : ''}
            </p>
            <p style="color: #78716c; font-size: 13px;">
              Pokud jde o nedorozumění, ozvěte se správci chaty nebo požádejte znovu.
            </p>
          </div>
        `,
      })
    }
  } catch (err) {
    payload.logger.error({ err, claim: doc.id }, 'Failed to send claim decision email')
  }
}
