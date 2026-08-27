// "Soukromý výdaj" (private expense) — the pure rules and maths of the
// private layer. A private expense is a gift or a surprise: it exists only
// for its payer and the participants in its split (plus superadmins), it
// never enters the common pot (calculateStats drops it), and its members
// settle it among themselves, directly to the payer's bank account. See
// docs/PRD-soukromy-vydaj.md for the full design and the decided edge cases.
//
// Everything here is pure and shape-tolerant: the same helpers run against
// depth-0 Payload data (hooks, endpoints) and the depth-1 documents the slug
// API ships to the frontend.

import { refId } from './access'

/** The polymorphic payer as it appears at any depth. */
type Payerish =
  | number
  | string
  | { relationTo?: string; value?: unknown; id?: number | string }
  | null
  | undefined

export interface PrivateExpenseLike {
  id: number | string
  title?: string | null
  amount: number
  payer?: Payerish
  splitType?: string | null
  weights?: Array<{ participant?: unknown; weight?: number | null }> | null
  invitations?: Array<unknown> | null
  attachments?: Array<unknown> | null
  isPlanned?: boolean | null
  isPrivate?: boolean | null
  privateSettlements?: Array<{ participant?: unknown; settledAt?: string | null }> | null
  payerAccount?: unknown
}

/**
 * The paying PARTICIPANT's id, or null when the payer is a joint account
 * (which a private expense refuses) or missing. Handles the `{ relationTo,
 * value }` wrapper at any population depth and bare ids.
 */
export function payerParticipantId(payer: Payerish): string | null {
  if (payer == null) return null
  if (typeof payer === 'number' || typeof payer === 'string') return refId(payer)
  if ('relationTo' in payer && payer.relationTo != null) {
    if (payer.relationTo !== 'participants') return null
    return payer.value != null ? refId(payer.value) : null
  }
  if ('id' in payer && payer.id != null) return refId(payer.id)
  return null
}

const weightRows = (expense: PrivateExpenseLike) =>
  (expense.weights || []).filter((w) => w?.participant != null)

/**
 * Who belongs to the expense: the payer participant plus everyone in the
 * weights. Only these people (and superadmins) may ever see it.
 */
export function privateExpenseMembers(expense: PrivateExpenseLike): string[] {
  const ids = new Set<string>()
  const payer = payerParticipantId(expense.payer)
  if (payer != null) ids.add(payer)
  for (const w of weightRows(expense)) ids.add(refId(w.participant))
  return [...ids]
}

/** Weights that sum to the amount (±1 Kč) are Kč amounts, not multipliers. */
export function weightsAreAmounts(expense: PrivateExpenseLike): boolean {
  const total = weightRows(expense).reduce((sum, w) => sum + (w.weight ?? 0), 0)
  return total > 0 && Math.abs(total - expense.amount) <= 1
}

/**
 * One member's share of a private expense. Always the normalized proportional
 * split (amount x weight / total weight) — the ±1 Kč "weights are amounts"
 * rule only changes how the UI labels the numbers, never the debt itself.
 */
export function privateShare(
  expense: PrivateExpenseLike,
  participantId: number | string,
): number {
  const rows = weightRows(expense)
  const total = rows.reduce((sum, w) => sum + (w.weight ?? 0), 0)
  if (total <= 0) return 0
  const me = refId(participantId)
  const mine = rows
    .filter((w) => refId(w.participant) === me)
    .reduce((sum, w) => sum + (w.weight ?? 0), 0)
  return (expense.amount * mine) / total
}

/** Has this member's direct payment to the payer been marked as done? */
export function isPrivatelySettled(
  expense: PrivateExpenseLike,
  participantId: number | string,
): boolean {
  const me = refId(participantId)
  return (expense.privateSettlements || []).some(
    (row) => row?.participant != null && refId(row.participant) === me,
  )
}

/** A row the viewer owes: their share on somebody else's private expense. */
export interface PrivateDebtRow {
  expenseId: string
  title: string
  amount: number
  weight: number
  weightIsAmount: boolean
  payerParticipantId: string | null
  isPlanned: boolean
  settled: boolean
}

/** One member's slice of an expense the viewer paid. */
export interface PrivateMemberState {
  participantId: string
  amount: number
  settled: boolean
}

/** An expense the viewer paid: total, own share, and who still owes. */
export interface PrivatePaidRow {
  expenseId: string
  title: string
  paidTotal: number
  ownShare: number
  /** what the others owe the payer (paidTotal minus the payer's own share) */
  net: number
  isPlanned: boolean
  members: PrivateMemberState[]
}

export interface PrivateLayer {
  debts: PrivateDebtRow[]
  paid: PrivatePaidRow[]
}

/**
 * The private layer for one participant: what they owe (debts) and what
 * others owe them (paid). Non-private expenses are ignored, so the whole
 * journal can be passed in. Zero shares never produce a row — a member with
 * weight 0 is in the circle but owes nothing.
 */
export function buildPrivateLayer(
  expenses: PrivateExpenseLike[],
  participantId: number | string,
): PrivateLayer {
  const me = refId(participantId)
  const debts: PrivateDebtRow[] = []
  const paid: PrivatePaidRow[] = []
  for (const expense of expenses) {
    if (expense.isPrivate !== true) continue
    const payerId = payerParticipantId(expense.payer)
    const rows = weightRows(expense)
    const totalWeight = rows.reduce((sum, w) => sum + (w.weight ?? 0), 0)
    if (payerId === me) {
      const ownShare = privateShare(expense, me)
      const members: PrivateMemberState[] = []
      const seen = new Set<string>()
      for (const w of rows) {
        const pid = refId(w.participant)
        if (pid === me || seen.has(pid)) continue
        seen.add(pid)
        const amount = totalWeight > 0 ? privateShare(expense, pid) : 0
        if (amount <= 0) continue
        members.push({ participantId: pid, amount, settled: isPrivatelySettled(expense, pid) })
      }
      paid.push({
        expenseId: refId(expense.id),
        title: expense.title ?? '',
        paidTotal: expense.amount,
        ownShare,
        net: expense.amount - ownShare,
        isPlanned: expense.isPlanned === true,
        members,
      })
      continue
    }
    const amount = privateShare(expense, me)
    if (amount <= 0) continue
    const mine = rows
      .filter((w) => refId(w.participant) === me)
      .reduce((sum, w) => sum + (w.weight ?? 0), 0)
    debts.push({
      expenseId: refId(expense.id),
      title: expense.title ?? '',
      amount,
      weight: mine,
      weightIsAmount: weightsAreAmounts(expense),
      payerParticipantId: payerId,
      isPlanned: expense.isPlanned === true,
      settled: isPrivatelySettled(expense, me),
    })
  }
  return { debts, paid }
}

/** One row reference for the settle endpoint. */
export interface PrivateSettleItem {
  expenseId: string
  participantId: string
}

/**
 * A mutual-debt hint between the viewer and one counterpart: both owe each
 * other across private expenses, so one transfer of the difference settles
 * everything. Informational only — `items` lists every constituent row, and
 * acting on the hint simply marks them all. Planned and already settled rows
 * never participate.
 */
export interface PrivateNettingHint {
  counterpartId: string
  /** what the viewer owes the counterpart */
  iOwe: number
  /** what the counterpart owes the viewer */
  theyOwe: number
  /** |iOwe - theyOwe| */
  difference: number
  direction: 'send' | 'receive' | 'even'
  items: PrivateSettleItem[]
}

/**
 * Mutual debts aggregated per counterpart, deterministic regardless of how
 * many expenses point each way. A hint exists only when BOTH directions have
 * an open (unsettled, non-planned) amount.
 */
export function nettingHints(
  expenses: PrivateExpenseLike[],
  participantId: number | string,
): PrivateNettingHint[] {
  const me = refId(participantId)
  const layer = buildPrivateLayer(expenses, me)
  const byCounterpart = new Map<
    string,
    { iOwe: number; theyOwe: number; items: PrivateSettleItem[] }
  >()
  const entry = (id: string) => {
    let found = byCounterpart.get(id)
    if (!found) {
      found = { iOwe: 0, theyOwe: 0, items: [] }
      byCounterpart.set(id, found)
    }
    return found
  }
  for (const debt of layer.debts) {
    if (debt.settled || debt.isPlanned || debt.payerParticipantId == null) continue
    const e = entry(debt.payerParticipantId)
    e.iOwe += debt.amount
    e.items.push({ expenseId: debt.expenseId, participantId: me })
  }
  for (const row of layer.paid) {
    if (row.isPlanned) continue
    for (const member of row.members) {
      if (member.settled) continue
      const e = entry(member.participantId)
      e.theyOwe += member.amount
      e.items.push({ expenseId: row.expenseId, participantId: member.participantId })
    }
  }
  const hints: PrivateNettingHint[] = []
  for (const [counterpartId, { iOwe, theyOwe, items }] of byCounterpart) {
    if (iOwe <= 0 || theyOwe <= 0) continue
    const difference = Math.abs(iOwe - theyOwe)
    hints.push({
      counterpartId,
      iOwe,
      theyOwe,
      difference,
      // the same 1 Kč tolerance the settlement threshold uses everywhere
      direction: difference <= 1 ? 'even' : iOwe > theyOwe ? 'send' : 'receive',
      items,
    })
  }
  return hints.sort((a, b) => a.counterpartId.localeCompare(b.counterpartId))
}

/**
 * "You can send it together": when a private transfer and a pot transfer run
 * between the same two people, one bank payment can carry both. Purely a
 * sentence in the UI — the pot itself never touches the private amount.
 * Sender-side only (the hint shows where the action is):
 * - the viewer is the banker and owes X privately, while the pot owes X a
 *   refund the banker will be sending anyway
 * - the viewer owes the banker privately, while also owing the pot a top-up
 */
export interface BankerCombineHint {
  counterpartId: string
  potTransfer: 'refund' | 'topup'
}

export function bankerCombineHints(args: {
  viewerParticipantId: number | string
  bankerParticipantId: number | string | null
  debts: PrivateDebtRow[]
  /** participant ids of pot debtors (owe a top-up to the banker) */
  potDebtorIds: ReadonlyArray<number | string>
  /** participant ids of pot creditors (get a refund from the banker) */
  potCreditorIds: ReadonlyArray<number | string>
}): BankerCombineHint[] {
  const me = refId(args.viewerParticipantId)
  const banker = args.bankerParticipantId != null ? refId(args.bankerParticipantId) : null
  if (banker == null) return []
  const debtorIds = new Set(args.potDebtorIds.map(refId))
  const creditorIds = new Set(args.potCreditorIds.map(refId))
  const hints = new Map<string, BankerCombineHint>()
  for (const debt of args.debts) {
    if (debt.settled || debt.isPlanned || debt.payerParticipantId == null) continue
    const payee = debt.payerParticipantId
    if (me === banker && creditorIds.has(payee)) {
      hints.set(payee, { counterpartId: payee, potTransfer: 'refund' })
    } else if (payee === banker && debtorIds.has(me)) {
      hints.set(payee, { counterpartId: payee, potTransfer: 'topup' })
    }
  }
  return [...hints.values()]
}

/**
 * May this viewer see a private expense? Superadmins always; otherwise the
 * accounts speaking for the payer, and anyone whose linked participant is in
 * the circle. Chata admins and the banker get NOTHING extra here — the
 * surprise target could be either of them.
 */
export function canViewPrivateExpense(args: {
  isSuperadminUser: boolean
  userId: number | string | null | undefined
  /** accounts speaking for the payer (lib/expenseAuthoring payerAccountIds) */
  payerAccountIds: ReadonlyArray<string>
  /** the viewer's linked participants in this chata */
  linkedParticipantIds: ReadonlyArray<number | string>
  expense: PrivateExpenseLike
}): boolean {
  if (args.expense.isPrivate !== true) return true
  if (args.isSuperadminUser) return true
  if (args.userId == null) return false
  const me = String(args.userId)
  if (args.payerAccountIds.some((id) => String(id) === me)) return true
  const members = new Set(privateExpenseMembers(args.expense))
  return args.linkedParticipantIds.some((id) => members.has(refId(id)))
}

/**
 * Payers whose bank fields this viewer needs on top of the standard rule:
 * being in a private expense's split means paying that payer directly, so
 * the QR needs their account. Creating the private expense is the payer's
 * consent to that.
 */
export function visiblePrivatePayerIds(
  expenses: PrivateExpenseLike[],
  linkedParticipantIds: ReadonlyArray<number | string>,
): string[] {
  const linked = new Set(linkedParticipantIds.map(refId))
  if (linked.size === 0) return []
  const ids = new Set<string>()
  for (const expense of expenses) {
    if (expense.isPrivate !== true) continue
    const payerId = payerParticipantId(expense.payer)
    if (payerId == null || linked.has(payerId)) continue
    const inSplit = weightRows(expense).some((w) => linked.has(refId(w.participant)))
    if (inSplit) ids.add(payerId)
  }
  return [...ids]
}

export type PrivateExpenseProblem =
  | 'payer'
  | 'amount'
  | 'split'
  | 'weights-empty'
  | 'weights-duplicate'
  | 'weights-total'
  | 'invitations'
  | 'attachments'

/**
 * The structural rules a private expense must satisfy, in the order they are
 * reported: a participant payer (no joint accounts — a shared wallet has no
 * single confidant), a positive amount (a refund would reverse the flow and
 * need the members' bank details, which the privacy scrub refuses to serve),
 * an explicit weighted split (equal split means "everyone", the opposite of
 * a secret), each member at most once, a positive total weight, and neither
 * invitations nor receipts (attachment files are readable by any signed-in
 * account, which would leak).
 */
export function privateExpenseProblem(expense: PrivateExpenseLike): PrivateExpenseProblem | null {
  if (payerParticipantId(expense.payer) == null) return 'payer'
  if (typeof expense.amount !== 'number' || !(expense.amount > 0)) return 'amount'
  if (expense.splitType !== 'weighted') return 'split'
  const rows = weightRows(expense)
  if (rows.length === 0) return 'weights-empty'
  const ids = rows.map((w) => refId(w.participant))
  if (new Set(ids).size !== ids.length) return 'weights-duplicate'
  if (!(rows.reduce((sum, w) => sum + (w.weight ?? 0), 0) > 0)) return 'weights-total'
  if ((expense.invitations || []).length > 0) return 'invitations'
  if ((expense.attachments || []).length > 0) return 'attachments'
  return null
}

/**
 * A fingerprint of everything that defines WHO owes WHAT: amount, payer,
 * split and planned state. When it changes, every settlement mark on the
 * expense is stale — it settled a different debt — and gets cleared.
 */
export function privateDebtSignature(expense: PrivateExpenseLike): string {
  const payer = payerParticipantId(expense.payer)
  const weights = weightRows(expense)
    .map((w) => [refId(w.participant), w.weight ?? 0] as const)
    .sort((a, b) => a[0].localeCompare(b[0]))
  return JSON.stringify({
    amount: expense.amount,
    payer,
    splitType: expense.splitType ?? null,
    isPlanned: expense.isPlanned === true,
    weights,
  })
}
