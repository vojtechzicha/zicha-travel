import type { Payload } from 'payload'
import type { Chata, Expense, Participant, User } from '../payload-types'
import { refId, isSuperadmin } from '../lib/access'
import { akuzativName } from '../lib/czechNames'
import { payerAccountIds, type PayerRefLike } from '../lib/expenseAuthoring'
import { signExpenseDecideToken } from '../lib/expenseApproval'
import { formatCurrency } from '../lib/formatCurrency'
import { sendAppEmail } from '../lib/email'
import { chataFinanceUrl, chataOrigin } from './claimRequests'

// Server-side plumbing of "výdaj za jiného plátce" (docs/PRD-vydaj-za-jineho.md):
// who may confirm a pending expense, the notification email with signed
// decide links, and the "schváleno / zamítnuto" email back to the author.
// Pure rules live in src/lib/expenseAuthoring.ts (approvalForPayer,
// canDecideExpense) and src/lib/expenseApproval.ts (tokens).
//
// Like the claim emails, these are Czech-only by design: they are a
// household-scale nudge inside one chata, and the recipient list is the
// Czech admin circle plus one named participant.

/** The account linked to a participant, if any (bare id, no fetch). */
const accountIdOf = (participant: { account?: unknown } | null | undefined): string | null =>
  participant?.account != null ? refId(participant.account) : null

/**
 * The payer of an expense as the approval flow needs it: a display name, the
 * accounts that may confirm on its behalf, and (for a participant) the
 * accusative form the Czech emails put after "za". A joint account speaks
 * through EVERY member with an account, a participant only through their own.
 */
export interface ExpensePayerContext {
  name: string
  /** accusative form for "výdaj za …" (plain name for a joint account) */
  accusative: string
  accountIds: string[]
  isJointAccount: boolean
}

export async function expensePayerContext(
  payload: Payload,
  payer: PayerRefLike | null,
): Promise<ExpensePayerContext | null> {
  if (!payer) return null
  if (payer.relationTo === 'participants') {
    const participant = await payload
      .findByID({
        collection: 'participants',
        id: refId(payer.value),
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    if (!participant) return null
    return {
      name: participant.name,
      accusative: akuzativName(participant),
      accountIds: payerAccountIds(payer, [participant]),
      isJointAccount: false,
    }
  }
  const jointAccount = await payload
    .findByID({
      collection: 'joint-accounts',
      id: refId(payer.value),
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!jointAccount) return null
  const memberIds = (jointAccount.members || []).map((m) => refId(m))
  const members =
    memberIds.length > 0
      ? (
          await payload.find({
            collection: 'participants',
            where: { id: { in: memberIds } },
            limit: 100,
            depth: 0,
            overrideAccess: true,
          })
        ).docs
      : []
  return {
    name: jointAccount.name,
    accusative: jointAccount.name,
    accountIds: payerAccountIds(payer, members, [jointAccount]),
    isJointAccount: true,
  }
}

/**
 * Everyone who may decide this expense: superadmins, admins with this chata
 * assigned, the accounts speaking for the payer and the banker's account.
 * Deduplicated by id; the author is filtered out by the caller.
 */
export async function expenseDecisionMakers(
  payload: Payload,
  args: {
    chataId: unknown
    payerAccountIds?: ReadonlyArray<number | string | null | undefined>
    bankerAccountId?: number | string | null
  },
): Promise<User[]> {
  const target = refId(args.chataId)
  const admins = await payload.find({
    collection: 'users',
    where: { role: { in: ['superadmin', 'admin'] } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const recipients = admins.docs.filter(
    (u) =>
      isSuperadmin(u) || ((u.assignedChatas as unknown[]) || []).some((c) => refId(c) === target),
  )

  const extraIds = [...(args.payerAccountIds || []), args.bankerAccountId]
    .filter((id) => id != null)
    .map((id) => refId(id))
    .filter((id) => !recipients.some((u) => String(u.id) === id))
  if (extraIds.length > 0) {
    const extras = await payload.find({
      collection: 'users',
      where: { id: { in: [...new Set(extraIds)] } },
      limit: 10,
      depth: 0,
      overrideAccess: true,
    })
    recipients.push(...extras.docs)
  }

  const seen = new Set<string>()
  return recipients.filter((u) => {
    const key = String(u.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The banker participant of a chata (depth-0 safe), or null. */
export async function bankerParticipant(
  payload: Payload,
  chata: Pick<Chata, 'banker'>,
): Promise<Participant | null> {
  if (chata.banker == null) return null
  return payload
    .findByID({ collection: 'participants', id: refId(chata.banker), depth: 0, overrideAccess: true })
    .catch(() => null)
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const personLabel = (user: Pick<User, 'name' | 'email'>): string =>
  user.name ? `${user.name} (${user.email})` : user.email

interface NotifyArgs {
  expense: Pick<Expense, 'id' | 'title' | 'amount' | 'createdAt' | 'isPlanned'>
  chata: Chata
  payer: ExpensePayerContext
  author: User
  /** origin the decide links should live on (request origin or chataOrigin) */
  origin: string
}

/**
 * "Zaplatil jsi tohle?" — one email per decision maker with a signed
 * approve/reject link (14-day token bound to the recipient). Failures are
 * logged, never thrown: a lost email must not lose the expense, which stays
 * visible to its author and in the admin panel either way.
 */
export async function notifyExpenseApprovers(payload: Payload, args: NotifyArgs): Promise<void> {
  const { expense, chata, payer, author, origin } = args
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) {
    payload.logger.error('PAYLOAD_SECRET missing – cannot sign expense decide links')
    return
  }

  const banker = await bankerParticipant(payload, chata)
  const recipients = await expenseDecisionMakers(payload, {
    chataId: chata.id,
    payerAccountIds: payer.accountIds,
    bankerAccountId: accountIdOf(banker),
  })

  const amount = formatCurrency(expense.amount)
  // "za" needs the accusative ("výdaj za Katku") — Participant.akuzativ for a
  // person, the plain name for a joint account
  const subject = `Sedí to? ${author.name || author.email} zapsal(a) výdaj za ${payer.accusative}`
  // A joint account is paid FROM, a person pays
  const paidPhrase = payer.isJointAccount
    ? `že ho zaplatili ze společného účtu ${payer.name}`
    : `že ho zaplatil(a) ${payer.name}`
  const intro =
    `Na chatě ${chata.name} zapsal(a) ${personLabel(author)} výdaj „${expense.title}“ ` +
    `za ${amount} s tím, ${paidPhrase}.`
  const rules =
    'Dokud to někdo nepotvrdí, výdaj nikde nesvítí a do vyrovnání se nepočítá.'

  for (const recipient of recipients) {
    if (!recipient.email) continue
    // The author never approves their own entry
    if (String(recipient.id) === String(author.id)) continue
    try {
      const token = signExpenseDecideToken(
        { expenseId: expense.id, userId: recipient.id },
        secret,
      )
      const decideUrl = `${origin}/expenses/decide?token=${encodeURIComponent(token)}`
      await sendAppEmail(payload, {
        to: recipient.email,
        subject,
        text:
          `${intro}\n\n${rules}\n\n` +
          `Potvrdit nebo zamítnout: ${decideUrl}\n\n` +
          `Odkaz platí 14 dní a je určen jen tobě. Výdaj najdeš i v administraci pod „Výdaje“.`,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color: #d97706;">zicha.travel</h2>
            <h3 style="margin: 0 0 10px;">Sedí to?</h3>
            <p style="line-height: 1.6;">
              Na chatě <strong>${escapeHtml(chata.name)}</strong> zapsal(a)
              <strong>${escapeHtml(personLabel(author))}</strong> výdaj
              <strong>${escapeHtml(expense.title)}</strong> za <strong>${escapeHtml(amount)}</strong>
              s tím, ${payer.isJointAccount ? 'že ho zaplatili ze společného účtu' : 'že ho zaplatil(a)'}
              <strong>${escapeHtml(payer.name)}</strong>.
            </p>
            <p style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #4b5563;">
              ${rules}
            </p>
            <p style="margin: 24px 0;">
              <a href="${decideUrl}"
                 style="background: #16a34a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Rozhodnout (potvrdit / zamítnout)
              </a>
            </p>
            <p style="color: #78716c; font-size: 13px;">
              Odkaz platí 14 dní a je určen jen tobě. Výdaj najdeš i v administraci pod „Výdaje“.
            </p>
          </div>
        `,
      })
    } catch (err) {
      payload.logger.error(
        { err, recipient: recipient.email, expense: expense.id },
        'Failed to send expense approval notification',
      )
    }
  }
}

interface DecisionArgs {
  expense: Pick<Expense, 'id' | 'title' | 'amount' | 'approvalStatus' | 'approvalNote'>
  chata: Chata | null
  payerName: string
  author: User
  decidedBy: User | null
}

/** Tell the author how it went. Rejections carry the reason, if one was given. */
export async function notifyExpenseAuthor(payload: Payload, args: DecisionArgs): Promise<void> {
  const { expense, chata, payerName, author, decidedBy } = args
  if (!author.email) return
  const approved = expense.approvalStatus === 'approved'
  const amount = formatCurrency(expense.amount)
  const who = decidedBy?.name || decidedBy?.email || 'Správce chaty'
  const financeUrl = chata ? chataFinanceUrl(chata) : 'https://zicha.travel'
  const reason = expense.approvalNote?.trim()

  try {
    await sendAppEmail(payload, {
      to: author.email,
      subject: approved
        ? `Výdaj „${expense.title}“ je potvrzený`
        : `Výdaj „${expense.title}“ neprošel`,
      text: approved
        ? `${who} potvrdil(a), že výdaj „${expense.title}“ za ${amount} zaplatil(a) ${payerName}. ` +
          `Od teď se počítá do vyrovnání: ${financeUrl}`
        : `${who} nepotvrdil(a) výdaj „${expense.title}“ za ${amount} (plátce ${payerName}).` +
          (reason ? ` Napsal(a) k tomu: „${reason}“` : '') +
          `\n\nVýdaj se nikde nezobrazuje a do vyrovnání se nepočítá. Můžeš ho zapsat znovu na sebe, nebo se domluvit s pokladníkem.`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #d97706;">zicha.travel</h2>
          <h3 style="margin: 0 0 10px;">${approved ? 'Výdaj je potvrzený' : 'Výdaj neprošel'}</h3>
          <p style="line-height: 1.6;">
            <strong>${escapeHtml(who)}</strong> ${approved ? 'potvrdil(a)' : 'nepotvrdil(a)'} výdaj
            <strong>${escapeHtml(expense.title)}</strong> za <strong>${escapeHtml(amount)}</strong>
            (plátce <strong>${escapeHtml(payerName)}</strong>)${
              chata ? ` na chatě <strong>${escapeHtml(chata.name)}</strong>` : ''
            }.
            ${!approved && reason ? `Napsal(a) k tomu: <em>„${escapeHtml(reason)}“</em>` : ''}
          </p>
          ${
            approved
              ? `<p style="margin: 24px 0;">
                   <a href="${financeUrl}"
                      style="background: #d97706; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                     Otevřít finance
                   </a>
                 </p>`
              : `<p style="color: #78716c; font-size: 13px;">
                   Výdaj se nikde nezobrazuje a do vyrovnání se nepočítá. Můžeš ho zapsat znovu na
                   sebe, nebo se domluvit s pokladníkem.
                 </p>`
          }
        </div>
      `,
    })
  } catch (err) {
    payload.logger.error({ err, expense: expense.id }, 'Failed to send expense decision email')
  }
}

/** Base origin for links in expense emails (chata subdomain when it has one). */
export { chataOrigin }
