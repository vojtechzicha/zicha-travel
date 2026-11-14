import { z } from 'zod'
import { refId } from '@/lib/access'
import { resolveBankAccount } from '@/utils/czechBankAccount'
import { buildPrivateLayer } from '@/lib/privateExpenses'
import { defineTool } from '../tool-kit'
import {
  bankerOf,
  isoDate,
  loadChata,
  ownParticipants,
  participantNames,
  payerLabel,
  resolveParticipant,
  type ChataPayload,
} from '../chata'

// The 1 Kč threshold (CLAUDE.md "Settlement Threshold"): within 1 Kč of zero
// is settled. Same numbers as the Finance view.
const statusOf = (balance: number) =>
  balance < -1 ? 'owes' : balance > 1 ? 'is_owed' : 'settled'

const round = (n: unknown) => (typeof n === 'number' ? Math.round(n * 100) / 100 : null)

const rows = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : [])

function expenseView(data: ChataPayload, expense: any, me: Set<string>, userId: number | null) {
  const names = participantNames(data)
  const payer = payerLabel(data, expense.payer)
  const weights = rows<any>(expense.weights).map((w) => ({
    participant: names.get(refId(w.participant)) ?? refId(w.participant),
    participant_id: Number(refId(w.participant)),
    weight: w.weight,
  }))
  const weightSum = weights.reduce((s, w) => s + (Number(w.weight) || 0), 0)
  const isAmounts =
    expense.splitType === 'weighted' && weights.length > 0 && Math.abs(weightSum - Math.abs(expense.amount)) <= 1
  const authored = expense.authoredBy != null && userId != null && refId(expense.authoredBy) === String(userId)
  const payerIsMine =
    expense.payerAccount != null && userId != null && refId(expense.payerAccount) === String(userId)
  return {
    id: expense.id,
    date: isoDate(expense.createdAt),
    title: expense.title,
    amount: expense.amount,
    refund: expense.amount < 0,
    note: expense.note ?? null,
    payer: payer.name,
    payer_type: payer.type,
    payer_id: payer.id,
    split:
      expense.splitType === 'equal'
        ? { mode: 'equal', among: 'everybody in the chata' }
        : { mode: isAmounts ? 'amounts' : 'shares', weights },
    invitations: rows<any>(expense.invitations).map((inv) => ({
      host: names.get(refId(inv.host)) ?? null,
      guest: names.get(refId(inv.guest)) ?? null,
      standing: inv.auto === true,
    })),
    planned: expense.isPlanned === true,
    private: expense.isPrivate === true,
    approval: expense.approvalStatus ?? 'approved',
    approval_note: expense.approvalNote ?? null,
    from_list: expense.sourceList ?? null,
    receipts: rows(expense.attachments).length,
    added_by_me: authored,
    i_paid: payerIsMine || (payer.type === 'participant' && me.has(String(payer.id))),
    // the same rule the web uses for the Upravit/Smazat footer: own
    // expenses, ones recorded for you, everything for chata admins
    can_edit: authored || payerIsMine || (data.viewer.canViewAll && expense.isPrivate !== true),
  }
}

export const financeTools = [
  defineTool({
    name: 'get_finances',
    title: 'Balances and settlement',
    description:
      'The Finance view of a chata: per person what they paid, prepaid and should pay (their ' +
      'fair share), the resulting balance (owes / is_owed / settled within 1 Kč), the settlement ' +
      'lists, the banker and their bank account, and the prepayments. With `participant` (or for ' +
      'your own participants by default) also the line-by-line fair-share breakdown and the ' +
      'private expenses you settle directly with their payer. Debtors send money to the banker; ' +
      'the banker pays the creditors. Figures of people who keep their finances private (their ' +
      'account has signed in) are withheld unless they are yours or you administer the chata.',
    access: 'read',
    input: {
      chata: z.union([z.string(), z.number()]).describe('The chata: id, slug or name.'),
      participant: z
        .union([z.string(), z.number()])
        .optional()
        .describe('Whose breakdown to include (id or name). Default: your own participants.'),
    },
    handler: async ({ chata: ref, participant }, caller) => {
      const data = await loadChata(caller, ref)
      const names = participantNames(data)
      const banker = bankerOf(data)
      const bankerAccount = banker
        ? resolveBankAccount(banker.accountNumber, banker.iban)
        : null
      const stats = data.stats ?? { participants: {} }
      const people = Object.entries(stats.participants ?? {}).map(([name, s]: [string, any]) => ({
        name,
        paid: round(s.paidExternal),
        paid_planned: round(s.plannedPaidExternal),
        prepaid_to_banker: round(s.prepaidInternal),
        fair_share: round(s.cost),
        fair_share_planned: round(s.plannedCost),
        balance: round(s.balance),
        status: statusOf(s.balance ?? 0),
      }))
      const withheld = data.participants
        .map((p) => p.name)
        .filter((name) => !(name in (stats.participants ?? {})))

      const focusIds =
        participant !== undefined
          ? [resolveParticipant(data, participant)]
          : ownParticipants(data).map((p) => p.id)
      const breakdowns = focusIds.map((id) => {
        const name = names.get(String(id)) ?? String(id)
        const s = stats.participants?.[name]
        const layer = buildPrivateLayer(data.expenses as never, id)
        return {
          participant: name,
          participant_id: id,
          withheld: s == null,
          fair_share_lines: s
            ? rows<any>(s.costBreakdown).map((line) => ({
                expense_id: line.expenseId ?? null,
                title: line.title,
                cost: round(line.cost),
                weight: line.weight,
                planned: line.isPlanned === true,
                covered_by: line.invitedBy ?? null,
                covering_for: line.invitedGuest ?? null,
              }))
            : null,
          private_expenses: {
            i_owe: layer.debts.map((d) => ({
              expense_id: Number(d.expenseId),
              title: d.title,
              amount: d.amount,
              pay_to: d.payerParticipantId ? (names.get(d.payerParticipantId) ?? null) : null,
              settled: d.settled,
              planned: d.isPlanned,
            })),
            owed_to_me: layer.paid.map((p) => ({
              expense_id: Number(p.expenseId),
              title: p.title,
              total: p.paidTotal,
              members: p.members.map((m) => ({
                participant: names.get(m.participantId) ?? m.participantId,
                participant_id: Number(m.participantId),
                amount: m.amount,
                settled: m.settled,
              })),
            })),
          },
        }
      })

      return {
        chata: { id: data.ref.id, slug: data.ref.slug, name: data.ref.name },
        total_expenses: round(stats.totalExpenses),
        total_prepayments: round(stats.totalPrepayments),
        banker: banker
          ? {
              name: banker.name,
              account_number: bankerAccount?.accountNumber ?? null,
              iban: bankerAccount?.iban ?? null,
            }
          : null,
        people,
        withheld_people: withheld,
        settlement: {
          rule: 'Debtors pay the banker; the banker pays creditors. Within 1 Kč counts as settled.',
          debtors: rows<any>(stats.debtors).map((d) => ({ name: d.name, amount: round(d.amount) })),
          creditors: rows<any>(stats.creditors).map((c) => ({ name: c.name, amount: round(c.amount) })),
        },
        prepayments: data.prepayments.map((p) => ({
          date: isoDate(p.createdAt),
          from: payerLabel(data, p.from).name,
          amount: p.amount,
          type: p.type,
          note: p.note ?? null,
        })),
        breakdowns,
      }
    },
  }),

  defineTool({
    name: 'list_expenses',
    title: 'Expense journal',
    description:
      'The expense journal of a chata as this account sees it: paid and planned expenses, ' +
      'expenses waiting for your confirmation (approval "pending"), rejected ones you were ' +
      'involved in, and private expenses you are part of. Each row says who paid, how it is ' +
      'split, invitations ("host covers guest"), and whether you can edit it. Ids are what ' +
      'update_expense, delete_expense and decide_expense take.',
    access: 'read',
    input: {
      chata: z.union([z.string(), z.number()]).describe('The chata: id, slug or name.'),
      filter: z
        .enum(['all', 'mine', 'pending', 'planned', 'private'])
        .optional()
        .describe(
          'mine = added by you or paid by your participants; pending = waiting for approval; ' +
            'planned = not paid yet; private = private expenses. Default all.',
        ),
      search: z.string().optional().describe('Only titles containing this text (case-insensitive).'),
      participant: z
        .union([z.string(), z.number()])
        .optional()
        .describe('Only expenses this participant paid or shares in (id or name).'),
    },
    handler: async ({ chata: ref, filter, search, participant }, caller) => {
      const data = await loadChata(caller, ref)
      const me = new Set(data.viewer.linkedParticipantIds.map(String))
      let list = data.expenses.map((e) => ({ raw: e, view: expenseView(data, e, me, caller.user.id) }))
      if (filter === 'mine') list = list.filter((e) => e.view.added_by_me || e.view.i_paid)
      if (filter === 'pending') list = list.filter((e) => e.view.approval === 'pending')
      if (filter === 'planned') list = list.filter((e) => e.view.planned)
      if (filter === 'private') list = list.filter((e) => e.view.private)
      if (search) {
        const needle = search.toLowerCase()
        list = list.filter((e) => String(e.view.title).toLowerCase().includes(needle))
      }
      if (participant !== undefined) {
        const pid = resolveParticipant(data, participant)
        list = list.filter(
          (e) =>
            (e.view.payer_type === 'participant' && e.view.payer_id === pid) ||
            e.raw.splitType === 'equal' ||
            rows<any>(e.raw.weights).some((w) => Number(refId(w.participant)) === pid),
        )
      }
      list.sort((a, b) => String(b.raw.createdAt).localeCompare(String(a.raw.createdAt)))
      return {
        chata: { id: data.ref.id, slug: data.ref.slug, name: data.ref.name },
        count: list.length,
        total: round(list.filter((e) => e.view.approval === 'approved' && !e.view.private).reduce((s, e) => s + e.raw.amount, 0)),
        expenses: list.map((e) => e.view),
      }
    },
  }),
]
