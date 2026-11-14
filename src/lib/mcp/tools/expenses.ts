import { z } from 'zod'
import { refId } from '@/lib/access'
import { callApi, type Caller } from '../loopback'
import { ToolError, audit, defineTool, expectOk } from '../tool-kit'
import {
  loadChata,
  ownParticipants,
  resolveJointAccount,
  resolveParticipant,
  type ChataPayload,
} from '../chata'

// Expense authoring through the connector = the web composer's REST calls
// (POST/PATCH/DELETE /api/expenses). The Expenses beforeChange hooks decide
// everything that matters: whether the account may write here, whether the
// expense waits for the payer's confirmation ("výdaj za jiného plátce"), the
// private-expense invariants, auto invitations. Receipts stay on the web
// (photos need the camera and the upload flow).

const personRef = z.union([z.string(), z.number()])
const idRef = z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number)

const splitInput = {
  split: z
    .enum(['equal', 'shares', 'amounts'])
    .optional()
    .describe(
      'equal = everybody in the chata pays the same (no weights); shares = weights are ratios ' +
        '(2 = double share); amounts = weights are exact Kč that must add up to the amount.',
    ),
  weights: z
    .array(z.object({ participant: personRef, weight: z.number().min(0) }))
    .max(200)
    .optional()
    .describe('Who shares in it, for shares/amounts. Participants only, not joint accounts.'),
  invitations: z
    .array(z.object({ host: personRef, guest: personRef }))
    .max(100)
    .optional()
    .describe(
      'One-off "pozvání": the host covers the guest\'s share of this expense. Standing ' +
        'arrangements (a parent paying for a child) are added automatically and kept.',
    ),
}

const rows = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : [])

/** The noon of a local date, so the stored day never slips across midnight. */
function dateToCreatedAt(date: string | undefined, fallback?: string): string | undefined {
  if (!date) return fallback
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolError('date must be YYYY-MM-DD.')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date())
  if (!fallback && date === today) return new Date().toISOString()
  return `${date}T11:00:00.000Z`
}

function buildSplit(
  data: ChataPayload,
  input: { split?: string; weights?: Array<{ participant: string | number; weight: number }> },
  amount: number,
): { splitType: 'equal' | 'weighted'; weights: Array<{ participant: number; weight: number }> } | null {
  if (input.split === undefined && input.weights === undefined) return null
  const mode = input.split ?? (input.weights ? 'shares' : 'equal')
  if (mode === 'equal') {
    if (input.weights?.length) throw new ToolError('An equal split takes no weights.')
    return { splitType: 'equal', weights: [] }
  }
  const weights = (input.weights ?? []).map((w) => ({
    participant: resolveParticipant(data, w.participant),
    weight: w.weight,
  }))
  if (weights.length === 0) throw new ToolError(`A ${mode} split needs weights.`)
  if (new Set(weights.map((w) => w.participant)).size !== weights.length) {
    throw new ToolError('Each participant may appear in the weights only once.')
  }
  if (mode === 'amounts') {
    const sum = weights.reduce((s, w) => s + w.weight, 0)
    if (Math.abs(sum - Math.abs(amount)) > 1) {
      throw new ToolError(`The amounts add up to ${sum} Kč, not ${Math.abs(amount)} Kč.`)
    }
  }
  return { splitType: 'weighted', weights }
}

function buildInvitations(data: ChataPayload, input?: Array<{ host: string | number; guest: string | number }>) {
  if (input === undefined) return undefined
  const result = input.map((inv) => ({
    host: resolveParticipant(data, inv.host),
    guest: resolveParticipant(data, inv.guest),
    auto: false,
  }))
  for (const inv of result) {
    if (inv.host === inv.guest) throw new ToolError('A host cannot invite themselves.')
  }
  if (new Set(result.map((r) => r.guest)).size !== result.length) {
    throw new ToolError('Each guest may be invited only once per expense.')
  }
  return result
}

function payerOf(
  data: ChataPayload,
  input: { payer?: string | number; payer_joint_account?: string | number },
): { relationTo: 'participants' | 'joint-accounts'; value: number } | null {
  if (input.payer !== undefined && input.payer_joint_account !== undefined) {
    throw new ToolError('Give payer OR payer_joint_account, not both.')
  }
  if (input.payer_joint_account !== undefined) {
    return { relationTo: 'joint-accounts', value: resolveJointAccount(data, input.payer_joint_account) }
  }
  if (input.payer !== undefined) {
    return { relationTo: 'participants', value: resolveParticipant(data, input.payer) }
  }
  return null
}

async function readExpense(caller: Caller, id: number) {
  return expectOk(
    await callApi<any>(caller, 'GET', `expenses/${id}`, { query: { depth: 0 } }),
    `Reading expense ${id}`,
  )
}

function summary(doc: any) {
  if (!doc) return null
  return {
    id: doc.id,
    title: doc.title,
    amount: doc.amount,
    date: typeof doc.createdAt === 'string' ? doc.createdAt.slice(0, 10) : null,
    payer: doc.payer,
    split: doc.splitType,
    weights: rows<any>(doc.weights).map((w) => ({ participant: refId(w.participant), weight: w.weight })),
    invitations: rows<any>(doc.invitations).map((i) => ({
      host: refId(i.host),
      guest: refId(i.guest),
      standing: i.auto === true,
    })),
    planned: doc.isPlanned === true,
    private: doc.isPrivate === true,
    approval: doc.approvalStatus ?? 'approved',
    note: doc.note ?? null,
  }
}

const approvalHint = (doc: any) =>
  doc?.approvalStatus === 'pending'
    ? 'Waiting for confirmation: somebody else paid, so the payer (or the banker or a chata ' +
      'admin) must confirm it. Until then it is hidden from the journal and the balances. They ' +
      'got an email.'
    : undefined

export const expenseTools = [
  defineTool({
    name: 'create_expense',
    title: 'Add an expense',
    description:
      'Adds an expense to a chata, as the web composer does. The payer defaults to your own ' +
      'participant when you have exactly one there. Recording an expense somebody else paid is ' +
      'allowed: it then waits for their confirmation and does not count until confirmed. ' +
      '`planned` = not paid yet (an estimate). `private` = a gift or surprise visible only to ' +
      'you (the payer) and the people sharing it; it must be split by shares or amounts and ' +
      'settles directly between you. Receipts are added on the web. Use dry_run to check first.',
    access: 'write',
    input: {
      chata: personRef.describe('The chata: id, slug or name.'),
      title: z.string().trim().min(1).max(200),
      amount: z.number().positive().describe('In Kč, positive. Use refund for money returned.'),
      refund: z.boolean().optional().describe('Money that came back (stored as a negative amount).'),
      payer: personRef.optional().describe('Participant who paid (id or name).'),
      payer_joint_account: personRef.optional().describe('Or the joint account that paid.'),
      date: z.string().optional().describe('YYYY-MM-DD, default today.'),
      note: z.string().max(2000).optional(),
      planned: z.boolean().optional(),
      private: z.boolean().optional(),
      ...splitInput,
      dry_run: z.boolean().optional(),
    },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      const amount = args.refund ? -args.amount : args.amount
      let payer = payerOf(data, args)
      if (!payer) {
        const own = ownParticipants(data)
        if (own.length !== 1) {
          throw new ToolError(
            own.length === 0
              ? 'Name the payer: this account has no participant in the chata.'
              : `Name the payer: you have several participants here (${own.map((p) => p.name).join(', ')}).`,
          )
        }
        payer = { relationTo: 'participants', value: own[0].id }
      }
      const split = buildSplit(data, args, amount) ?? { splitType: 'equal' as const, weights: [] }
      if (args.private && split.splitType === 'equal') {
        throw new ToolError('A private expense must be split by shares or amounts, naming who is in.')
      }
      const invitations = buildInvitations(data, args.invitations) ?? []
      if (args.private && invitations.length > 0) {
        throw new ToolError('A private expense cannot have invitations.')
      }
      const body = {
        chata: data.ref.id,
        title: args.title,
        amount,
        payer,
        splitType: split.splitType,
        weights: split.weights,
        invitations,
        note: args.note ?? null,
        createdAt: dateToCreatedAt(args.date),
        isPlanned: args.planned === true,
        isPrivate: args.private === true,
      }
      if (args.dry_run) return { dry_run: true, would_create: body }
      const created = expectOk(await callApi<any>(caller, 'POST', 'expenses', { body }), 'Creating the expense')
      const doc = created?.doc
      await audit(caller, {
        tool: 'create_expense',
        action: 'create',
        chata: data.ref.id,
        collection: 'expenses',
        documentId: doc?.id,
        request: body,
        after: summary(doc),
      })
      return { created: summary(doc), note: approvalHint(doc) }
    },
  }),

  defineTool({
    name: 'update_expense',
    title: 'Change an expense',
    description:
      'Changes an expense you may edit (added by you, paid by your participant, or any ' +
      'expense of a chata you administer). Only the fields you pass change. A paid expense ' +
      'cannot go back to planned; `planned: false` marks a planned one as paid (set the real ' +
      'amount and date with it). `private: false` makes a private expense public; a public ' +
      'one cannot become private. Changing an expense somebody else paid puts it back in their ' +
      'confirmation queue. `invitations` replaces the one-off invitations and keeps standing ' +
      'ones. Use dry_run to see the change first.',
    access: 'write',
    input: {
      expense_id: idRef,
      title: z.string().trim().min(1).max(200).optional(),
      amount: z.number().positive().optional(),
      refund: z.boolean().optional(),
      payer: personRef.optional(),
      payer_joint_account: personRef.optional(),
      date: z.string().optional().describe('YYYY-MM-DD'),
      note: z.string().max(2000).nullable().optional(),
      planned: z.boolean().optional(),
      private: z.literal(false).optional().describe('false makes a private expense public.'),
      ...splitInput,
      dry_run: z.boolean().optional(),
    },
    handler: async (args, caller) => {
      const before = await readExpense(caller, args.expense_id)
      const data = await loadChata(caller, refId(before.chata))
      const patch: Record<string, unknown> = {}
      if (args.title !== undefined) patch.title = args.title
      const sign = (args.refund ?? before.amount < 0) ? -1 : 1
      if (args.amount !== undefined || args.refund !== undefined) {
        patch.amount = sign * (args.amount ?? Math.abs(before.amount))
      }
      const payer = payerOf(data, args)
      if (payer) patch.payer = payer
      if (args.date !== undefined) patch.createdAt = dateToCreatedAt(args.date, before.createdAt)
      if (args.note !== undefined) patch.note = args.note
      if (args.planned !== undefined) {
        if (args.planned && before.isPlanned !== true) {
          throw new ToolError('A paid expense cannot become planned again (delete and re-add it instead).')
        }
        if (before.isPlanned === true) patch.isPlanned = args.planned
      }
      if (args.private === false) {
        if (before.isPrivate !== true) throw new ToolError('This expense is not private.')
        patch.isPrivate = false
      }
      const amount = (patch.amount as number | undefined) ?? before.amount
      const split = buildSplit(data, args, amount)
      if (split) {
        patch.splitType = split.splitType
        patch.weights = split.weights
      }
      const manual = buildInvitations(data, args.invitations)
      if (manual) {
        const standing = rows<any>(before.invitations)
          .filter((i) => i.auto === true)
          .map((i) => ({ host: Number(refId(i.host)), guest: Number(refId(i.guest)), auto: true }))
        const guests = new Set(manual.map((m) => m.guest))
        patch.invitations = [...standing.filter((s) => !guests.has(s.guest)), ...manual]
      }
      if (Object.keys(patch).length === 0) throw new ToolError('Nothing to change.')
      if (args.dry_run) return { dry_run: true, before: summary(before), patch }
      const result = expectOk(
        await callApi<any>(caller, 'PATCH', `expenses/${args.expense_id}`, { body: patch }),
        'Updating the expense',
      )
      const after = result?.doc
      await audit(caller, {
        tool: 'update_expense',
        action: 'update',
        chata: data.ref.id,
        collection: 'expenses',
        documentId: args.expense_id,
        request: patch,
        before: summary(before),
        after: summary(after),
      })
      return { updated: summary(after), note: approvalHint(after) }
    },
  }),

  defineTool({
    name: 'delete_expense',
    title: 'Delete an expense',
    description:
      'Deletes an expense you may edit. It disappears from the journal and the balances for ' +
      'everybody. Use dry_run to see what would go; list_recent_changes keeps a copy.',
    access: 'delete',
    input: { expense_id: idRef, dry_run: z.boolean().optional() },
    handler: async ({ expense_id, dry_run }, caller) => {
      const before = await readExpense(caller, expense_id)
      if (dry_run) return { dry_run: true, would_delete: summary(before) }
      expectOk(await callApi(caller, 'DELETE', `expenses/${expense_id}`), 'Deleting the expense')
      await audit(caller, {
        tool: 'delete_expense',
        action: 'delete',
        chata: Number(refId(before.chata)),
        collection: 'expenses',
        documentId: expense_id,
        before: summary(before),
      })
      return { deleted: summary(before) }
    },
  }),

  defineTool({
    name: 'decide_expense',
    title: 'Confirm or reject an expense',
    description:
      'Confirms ("Sedí to") or rejects an expense somebody recorded as paid by you, by your ' +
      'joint account, or (for the banker and chata admins) by anyone in the chata. Rejecting ' +
      'needs a reason; the author gets it by email. Only expenses with approval "pending" ' +
      '(list_expenses filter pending) can be decided.',
    access: 'write',
    input: {
      expense_id: idRef,
      decision: z.enum(['approve', 'reject']),
      reason: z.string().trim().max(500).optional().describe('Required for reject.'),
    },
    handler: async ({ expense_id, decision, reason }, caller) => {
      if (decision === 'reject' && !reason) throw new ToolError('Say why when rejecting (reason).')
      const body = { expenseId: expense_id, action: decision, reason }
      expectOk(await callApi(caller, 'POST', 'expenses/decide', { body }), 'Deciding the expense')
      await audit(caller, {
        tool: 'decide_expense',
        action: decision,
        collection: 'expenses',
        documentId: expense_id,
        request: body,
      })
      return {
        ok: true,
        decision,
        note:
          decision === 'approve'
            ? 'Confirmed: the expense now counts in the balances.'
            : 'Rejected: it stays out of the balances; the author was told why.',
      }
    },
  }),

  defineTool({
    name: 'mark_private_payment',
    title: 'Mark a private-expense payment',
    description:
      'Private expenses settle directly between a member and the payer, outside the pot. Marks ' +
      '(settled: true) or unmarks a member\'s payment on one or more private expenses, as the ' +
      'buttons under "Soukromé výdaje" do. The payer marks what members paid them; a member ' +
      'marks their own payment. get_finances lists the open rows.',
    access: 'write',
    input: {
      chata: personRef.describe('The chata, to resolve participant names.'),
      items: z
        .array(z.object({ expense_id: idRef, participant: personRef }))
        .min(1)
        .max(20),
      settled: z.boolean(),
    },
    handler: async ({ chata, items, settled }, caller) => {
      const data = await loadChata(caller, chata)
      const body = {
        settled,
        items: items.map((i) => ({
          expenseId: i.expense_id,
          participantId: resolveParticipant(data, i.participant),
        })),
      }
      expectOk(await callApi(caller, 'POST', 'expenses/private-settle', { body }), 'Marking the payment')
      await audit(caller, {
        tool: 'mark_private_payment',
        action: settled ? 'settle' : 'unsettle',
        chata: data.ref.id,
        collection: 'expenses',
        request: body,
      })
      return { ok: true, settled, items: body.items }
    },
  }),
]
