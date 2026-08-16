import type { Metadata } from 'next'
import { getPayload } from 'payload'
import { getTranslations } from 'next-intl/server'
import config from '@/payload.config'
import { refId, canManageChata } from '@/lib/access'
import { canDecideExpense, normalizePayer } from '@/lib/expenseAuthoring'
import { verifyExpenseDecideToken } from '@/lib/expenseApproval'
import { bankerParticipant, expensePayerContext } from '@/utils/expenseApproval'
import { GlassCard } from '../../components/GlassCard'
import { DecideExpenseCard, type DecideExpenseDetails } from '../../components/DecideExpenseCard'
import '../../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth')
  return {
    title: t('expenseDecide.metaTitle'),
    description: t('expenseDecide.metaDescription'),
    // Signed-link page — never index (also disallowed in robots.txt)
    robots: { index: false, follow: false },
  }
}

// "Výdaj za jiného plátce" (docs/PRD-vydaj-za-jineho.md): the payer, the
// banker or a chata admin lands here from the approval email. The signed
// token in the URL is the credential (no session needed); the decision
// itself is a POST from the client card — a mutating GET would be triggered
// by mail-scanner link prefetches.
export default async function DecideExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const t = await getTranslations('auth')

  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
      <div className="relative z-10 max-w-app mx-auto px-5 py-10 flex items-center justify-center min-h-screen">
        {content}
      </div>
    </div>
  )

  const message = (title: string, body: string) =>
    shell(
      <GlassCard padding="large" className="w-full max-w-md text-center">
        <h1 className="font-serif text-2xl font-bold text-gray-900 mb-3">{title}</h1>
        <p className="text-gray-600">{body}</p>
      </GlassCard>
    )

  if (!token) {
    return message(t('expenseDecide.page.invalidTitle'), t('expenseDecide.page.missingSignature'))
  }

  const secret = process.env.PAYLOAD_SECRET
  const verified = secret
    ? verifyExpenseDecideToken(token, secret)
    : ({ ok: false, code: 'invalid' } as const)
  if (!verified.ok) {
    return verified.code === 'expired'
      ? message(t('expenseDecide.page.expiredTitle'), t('expenseDecide.page.expiredBody'))
      : message(t('expenseDecide.page.invalidTitle'), t('expenseDecide.page.badSignature'))
  }

  const payload = await getPayload({ config: await config })
  const [decider, expense] = await Promise.all([
    payload
      .findByID({ collection: 'users', id: verified.userId, depth: 0, overrideAccess: true })
      .catch(() => null),
    // depth 1 so "Podrobnosti" has real content: receipts with their URLs and
    // the weight rows with participant names, not bare ids
    payload
      .findByID({ collection: 'expenses', id: verified.expenseId, depth: 1, overrideAccess: true })
      .catch(() => null),
  ])

  if (!expense) {
    return message(t('expenseDecide.page.notFoundTitle'), t('expenseDecide.page.notFoundBody'))
  }

  const chata = await payload
    .findByID({
      collection: 'chatas',
      id: refId(expense.chata),
      depth: 0,
      overrideAccess: true,
      context: { triggerAfterRead: false },
    })
    .catch(() => null)
  const [payer, banker, author] = await Promise.all([
    expensePayerContext(payload, normalizePayer(expense.payer)),
    chata ? bankerParticipant(payload, chata) : null,
    expense.authoredBy != null
      ? payload
          .findByID({
            collection: 'users',
            id: refId(expense.authoredBy),
            depth: 0,
            overrideAccess: true,
          })
          .catch(() => null)
      : null,
  ])

  // The token names one recipient — but the CURRENT rules decide, so a
  // forwarded link cannot outlive a role change or a re-linked participant
  const allowed =
    decider != null &&
    canDecideExpense({
      userId: decider.id,
      managesChata: canManageChata({ ...decider, collection: 'users' }, refId(expense.chata)),
      payerAccountIds: payer?.accountIds,
      bankerAccountId: banker?.account != null ? refId(banker.account) : null,
    })
  if (!allowed) {
    return message(t('expenseDecide.page.forbiddenTitle'), t('expenseDecide.page.forbiddenBody'))
  }
  if (!payer || !author) {
    return message(t('expenseDecide.page.goneTitle'), t('expenseDecide.page.goneBody'))
  }

  if (expense.approvalStatus !== 'pending') {
    const statusText: Record<string, string> = {
      approved: t('expenseDecide.page.decidedApproved'),
      rejected: t('expenseDecide.page.decidedRejected'),
    }
    return message(
      t('expenseDecide.page.decidedTitle'),
      statusText[expense.approvalStatus ?? 'approved'] || t('expenseDecide.page.decidedClosed')
    )
  }

  // How the expense is split, in one line ("rovným dílem" or the headcount)
  const splitSummary =
    expense.splitType === 'equal'
      ? t('expenseDecide.page.splitEqual')
      : t('expenseDecide.page.splitWeighted', { count: expense.weights?.length ?? 0 })

  // Behind "Podrobnosti": an equal split needs the chata's headcount to say
  // what one share is; a weighted one already carries its own rows
  const weightRows = (expense.weights ?? []).flatMap((w) =>
    typeof w.participant === 'object' && w.participant !== null
      ? [{ name: w.participant.name, weight: w.weight }]
      : [],
  )
  let split: DecideExpenseDetails['split'] = null
  if (expense.splitType === 'equal') {
    const sharers = await payload
      .find({
        collection: 'participants',
        where: { chata: { equals: refId(expense.chata) } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)
    const names = (sharers?.docs ?? []).map((p) => p.name)
    if (names.length > 0) {
      split = { kind: 'equal', names, perPerson: expense.amount / names.length }
    }
  } else if (weightRows.length > 0) {
    // weights that add up to the total are exact amounts, not shares
    const sum = weightRows.reduce((total, row) => total + (row.weight ?? 0), 0)
    split = {
      kind: 'weighted',
      rows: weightRows,
      asAmounts: Math.abs(sum - expense.amount) <= 1,
    }
  }

  const details: DecideExpenseDetails = {
    isPlanned: expense.isPlanned ?? false,
    note: expense.note,
    split,
    attachments: (expense.attachments ?? []).flatMap((att) =>
      typeof att === 'object' && att !== null && att.url
        ? [
            {
              id: String(att.id),
              url: att.url,
              isImage: att.mimeType?.startsWith('image/') ?? false,
              label: att.filename || t('expenseDecide.page.receipt'),
            },
          ]
        : [],
    ),
  }

  return shell(
    <DecideExpenseCard
      token={token}
      title={expense.title}
      amount={expense.amount}
      payerName={payer.name}
      authorLabel={author.name ? `${author.name} (${author.email})` : author.email}
      chataName={chata?.name ?? ''}
      createdAt={expense.createdAt}
      splitSummary={splitSummary}
      payerIsJointAccount={payer.isJointAccount}
      decidingAsPayer={payer.accountIds.includes(String(decider!.id))}
      details={details}
    />
  )
}
