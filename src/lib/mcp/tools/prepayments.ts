import { z } from 'zod'
import { refId } from '@/lib/access'
import {
  MAX_PREPAYMENT_AMOUNT,
  isOutgoingType,
  signedPrepaymentAmount,
  type PrepaymentType,
} from '@/lib/prepayments'
import { callApi, type Caller } from '../loopback'
import { ToolError, audit, defineTool, expectOk } from '../tool-kit'
import {
  bankerOf,
  loadChata,
  payerLabel,
  resolveJointAccount,
  resolveParticipant,
  type ChataPayload,
} from '../chata'
import { dateToCreatedAt } from './expenses'

// Payments between people and the banker ("zálohy"): the Finance view's
// "Zapsat platbu" through the same REST calls (POST/PATCH/DELETE
// /api/prepayments). The Prepayments beforeChange hook decides who may write
// (the banker and chata admins) and keeps the sign matching the type.

const ref = z.union([z.string(), z.number()])
const idRef = z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number)
const typeInput = z
  .enum(['advance', 'supplement', 'refund', 'distribution'])
  .describe(
    'advance = záloha and supplement = doplatek (money a person sent TO the banker); ' +
      'refund = vratka (the banker sent an overpayment BACK); distribution = the banker paid ' +
      'out a surplus (rare, counts like refund).',
  )

/** The banker or a chata admin: the same circle the web shows the editor to. */
export function canManagePrepaymentsIn(data: ChataPayload): boolean {
  const banker = bankerOf(data)
  return (
    data.viewer.canViewAll ||
    (banker != null && data.viewer.linkedParticipantIds.map(String).includes(String(banker.id)))
  )
}

function requireManager(data: ChataPayload) {
  if (!canManagePrepaymentsIn(data)) {
    throw new ToolError(
      `Only the banker of ${data.ref.name} or a chata admin records payments. Ask them, or ` +
        'tell the user who the banker is (get_finances).',
    )
  }
}

function senderOf(
  data: ChataPayload,
  input: { from?: string | number; from_joint_account?: string | number },
): { relationTo: 'participants' | 'joint-accounts'; value: number } | null {
  if (input.from !== undefined && input.from_joint_account !== undefined) {
    throw new ToolError('Give from OR from_joint_account, not both.')
  }
  if (input.from_joint_account !== undefined) {
    return { relationTo: 'joint-accounts', value: resolveJointAccount(data, input.from_joint_account) }
  }
  if (input.from !== undefined) {
    return { relationTo: 'participants', value: resolveParticipant(data, input.from) }
  }
  return null
}

/** The person's open balance as the settlement lists show it (1 Kč rule). */
function openBalance(data: ChataPayload, participantId: number, type: PrepaymentType): number {
  const name = data.participants.find((p) => p.id === participantId)?.name
  const list = isOutgoingType(type) ? data.stats?.creditors : data.stats?.debtors
  const row = (Array.isArray(list) ? list : []).find((r: any) => r.name === name)
  if (!row) {
    throw new ToolError(
      isOutgoingType(type)
        ? `${name} is not owed anything right now; give the amount.`
        : `${name} owes nothing right now; give the amount.`,
    )
  }
  return Math.round(row.amount)
}

function summary(data: ChataPayload, doc: any) {
  if (!doc) return null
  return {
    id: doc.id,
    date: typeof doc.createdAt === 'string' ? doc.createdAt.slice(0, 10) : null,
    from: payerLabel(data, doc.from).name,
    from_id: payerLabel(data, doc.from).id,
    from_type: payerLabel(data, doc.from).type,
    type: doc.type,
    amount: Math.abs(doc.amount),
    stored_amount: doc.amount,
    note: doc.note ?? null,
  }
}

async function readPrepayment(caller: Caller, id: number) {
  return expectOk(
    await callApi<any>(caller, 'GET', `prepayments/${id}`, { query: { depth: 0 } }),
    `Reading payment ${id}`,
  )
}

const amountInput = z.number().positive().max(MAX_PREPAYMENT_AMOUNT)

export const prepaymentTools = [
  defineTool({
    name: 'record_prepayment',
    title: 'Record a payment to or from the banker',
    description:
      'For the banker (and chata admins): records money that moved between a person and the ' +
      'banker, as "Zapsat platbu" in the Finance view does. A záloha or doplatek the person ' +
      'sent counts toward their balance; a vratka is money the banker sent back. The amount is ' +
      'always positive, the type gives the direction. Without amount, a supplement records ' +
      "the person's whole open debt and a refund the whole amount they are owed (the settlement " +
      'lists of get_finances). Use dry_run first.',
    access: 'write',
    input: {
      chata: ref.describe('The chata: id, slug or name.'),
      from: ref.optional().describe('The participant who sent or received it (id or name).'),
      from_joint_account: ref.optional().describe('Or the joint account that sent or received it.'),
      type: typeInput,
      amount: amountInput.optional().describe('In Kč, positive.'),
      date: z.string().optional().describe('YYYY-MM-DD, default today.'),
      note: z.string().trim().max(500).optional(),
      dry_run: z.boolean().optional(),
    },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      requireManager(data)
      const from = senderOf(data, args)
      if (!from) throw new ToolError('Name who sent or received the money (from).')
      let amount = args.amount
      if (amount === undefined) {
        if (from.relationTo !== 'participants' || !['supplement', 'refund'].includes(args.type)) {
          throw new ToolError('Give the amount (only a participant\'s supplement or refund can default to their balance).')
        }
        amount = openBalance(data, from.value, args.type)
      }
      const body = {
        chata: data.ref.id,
        from,
        type: args.type,
        amount: signedPrepaymentAmount(args.type, amount),
        note: args.note || null,
        createdAt: dateToCreatedAt(args.date),
      }
      if (args.dry_run) return { dry_run: true, would_create: summary(data, body) }
      const created = expectOk(
        await callApi<any>(caller, 'POST', 'prepayments', { body }),
        'Recording the payment',
      )
      const doc = created?.doc
      await audit(caller, {
        tool: 'record_prepayment',
        action: 'create',
        chata: data.ref.id,
        collection: 'prepayments',
        documentId: doc?.id,
        request: body,
        after: summary(data, doc),
      })
      return { created: summary(data, doc) }
    },
  }),

  defineTool({
    name: 'update_prepayment',
    title: 'Change a recorded payment',
    description:
      'For the banker (and chata admins): changes a payment recorded between a person and the ' +
      'banker. Only the fields you pass change; the amount stays positive and the type gives ' +
      'the direction. get_finances lists the payments with their ids. Use dry_run first.',
    access: 'write',
    input: {
      prepayment_id: idRef,
      from: ref.optional(),
      from_joint_account: ref.optional(),
      type: typeInput.optional(),
      amount: amountInput.optional(),
      date: z.string().optional().describe('YYYY-MM-DD'),
      note: z.string().trim().max(500).nullable().optional(),
      dry_run: z.boolean().optional(),
    },
    handler: async (args, caller) => {
      const before = await readPrepayment(caller, args.prepayment_id)
      const data = await loadChata(caller, refId(before.chata))
      requireManager(data)
      const patch: Record<string, unknown> = {}
      const from = senderOf(data, args)
      if (from) patch.from = from
      const type = (args.type ?? before.type) as PrepaymentType
      if (args.type !== undefined) patch.type = args.type
      if (args.amount !== undefined || args.type !== undefined) {
        patch.amount = signedPrepaymentAmount(type, args.amount ?? Math.abs(before.amount))
      }
      if (args.date !== undefined) patch.createdAt = dateToCreatedAt(args.date, before.createdAt)
      if (args.note !== undefined) patch.note = args.note || null
      if (Object.keys(patch).length === 0) throw new ToolError('Nothing to change.')
      if (args.dry_run) return { dry_run: true, before: summary(data, before), patch }
      const result = expectOk(
        await callApi<any>(caller, 'PATCH', `prepayments/${args.prepayment_id}`, { body: patch }),
        'Updating the payment',
      )
      const after = result?.doc
      await audit(caller, {
        tool: 'update_prepayment',
        action: 'update',
        chata: data.ref.id,
        collection: 'prepayments',
        documentId: args.prepayment_id,
        request: patch,
        before: summary(data, before),
        after: summary(data, after),
      })
      return { updated: summary(data, after) }
    },
  }),

  defineTool({
    name: 'delete_prepayment',
    title: 'Delete a recorded payment',
    description:
      'For the banker (and chata admins): deletes a payment recorded between a person and the ' +
      "banker. The person's balance changes back for everybody. Use dry_run to see what would " +
      'go; list_recent_changes keeps a copy.',
    access: 'delete',
    input: { prepayment_id: idRef, dry_run: z.boolean().optional() },
    handler: async ({ prepayment_id, dry_run }, caller) => {
      const before = await readPrepayment(caller, prepayment_id)
      const data = await loadChata(caller, refId(before.chata))
      requireManager(data)
      if (dry_run) return { dry_run: true, would_delete: summary(data, before) }
      expectOk(await callApi(caller, 'DELETE', `prepayments/${prepayment_id}`), 'Deleting the payment')
      await audit(caller, {
        tool: 'delete_prepayment',
        action: 'delete',
        chata: data.ref.id,
        collection: 'prepayments',
        documentId: prepayment_id,
        before: summary(data, before),
      })
      return { deleted: summary(data, before) }
    },
  }),
]
