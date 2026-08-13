// Frontend expense authoring ("výdaje od účastníků") — pure rules shared by
// the Expenses collection hook (server-side enforcement) and the composer UI
// (building the payer options). A signed-in frontend account may:
// - create expenses in a chata where it owns at least one participant
// - pay as one of its own participants, or as a joint account
//   ("společný účet") one of its participants is a member of
// - pay as SOMEBODY ELSE's participant of the same chata ("výdaj za jiného
//   plátce") — that expense is stored but stays invisible and out of the
//   maths until it is approved (see approvalForPayer below)
// - update/delete expenses it authored (Expense.authoredBy) and expenses
//   paid by one of its own participants (Expense.payerAccount)
//
// Admin roles are exempt — they keep the chata-scoped admin-panel rules.

import { refId } from './access'

interface ParticipantLike {
  id: number | string
  account?: number | string | { id: number | string } | null
}

interface JointAccountLike {
  id: number | string
  members?: (number | string | { id: number | string })[] | null
}

/** IDs of the participants (of one chata) linked to this user account. */
export function linkedParticipantIds(
  userId: number | string,
  participants: ParticipantLike[],
): string[] {
  return participants
    .filter((p) => p.account != null && refId(p.account) === String(userId))
    .map((p) => String(p.id))
}

/** Polymorphic payer value as stored/submitted ({ relationTo, value }). */
export interface PayerRefLike {
  relationTo: 'participants' | 'joint-accounts'
  value: number | string | { id: number | string }
}

export function normalizePayer(payer: unknown): PayerRefLike | null {
  if (typeof payer !== 'object' || payer === null) return null
  const ref = payer as { relationTo?: unknown; value?: unknown }
  if (ref.relationTo !== 'participants' && ref.relationTo !== 'joint-accounts') return null
  if (ref.value == null) return null
  return ref as PayerRefLike
}

/**
 * May a frontend user pay as `payer`? Own participant, or a joint account
 * that has at least one of their participants among its members.
 */
export function isAllowedPayer(
  payer: PayerRefLike,
  ownParticipantIds: string[],
  jointAccounts: JointAccountLike[],
): boolean {
  const id = refId(payer.value)
  if (payer.relationTo === 'participants') {
    return ownParticipantIds.includes(id)
  }
  const account = jointAccounts.find((ja) => String(ja.id) === id)
  if (!account) return false
  return (account.members || []).some((m) => ownParticipantIds.includes(refId(m)))
}

/** Same payer target? (used to leave an unchanged payer alone on update) */
export function samePayer(a: PayerRefLike | null, b: PayerRefLike | null): boolean {
  if (!a || !b) return a === b
  return a.relationTo === b.relationTo && refId(a.value) === refId(b.value)
}

/** Joint accounts the user may pay with (one of their participants is a member). */
export function ownJointAccounts<T extends JointAccountLike>(
  ownParticipantIds: string[],
  jointAccounts: T[],
): T[] {
  return jointAccounts.filter((ja) =>
    (ja.members || []).some((m) => ownParticipantIds.includes(refId(m))),
  )
}

// ---------------------------------------------------------------------------
// "Výdaj za jiného plátce" — recording an expense somebody ELSE paid.
//
// Not the usual case, so the UI keeps it subtle, and nothing is taken on
// trust: the expense is stored with approvalStatus 'pending', which hides it
// from the journal and keeps it out of every balance until an approver
// confirms it. Who may confirm depends on whether the payer has an account:
// - 'linked'   — the payer can speak for themselves: they OR the banker
//                ("pokladník") / a chata admin approve
// - 'unlinked' — nobody can confirm on the payer's behalf, so only the
//                banker / chata admins do
// See docs/PRD-vydaj-za-jineho.md.

export type ApprovalStatus = 'approved' | 'pending' | 'rejected'
export type AlternatePayerKind = 'linked' | 'unlinked'

export type ApprovalRequirement =
  | { required: false }
  | { required: true; kind: AlternatePayerKind }

/**
 * Does this payer choice need approval before the expense counts?
 * Admin roles and payers the author speaks for (own participant, own joint
 * account) never do.
 */
export function approvalForPayer(args: {
  isAdmin: boolean
  /** the author owns the payer (own participant / own joint account) */
  payerIsOwn: boolean
  /** the payer participant is linked to a user account */
  payerHasAccount: boolean
}): ApprovalRequirement {
  if (args.isAdmin || args.payerIsOwn) return { required: false }
  return { required: true, kind: args.payerHasAccount ? 'linked' : 'unlinked' }
}

/**
 * May this account decide a pending expense? The chata's admins (and
 * superadmins) always may; so may the accounts of the two people the expense
 * speaks for — the payer participant and the banker ("pokladník"). The
 * author is deliberately NOT an approver: approving your own claim would
 * defeat the point.
 */
export function canDecideExpense(args: {
  userId: number | string | null | undefined
  managesChata: boolean
  /** account linked to the payer participant, if any */
  payerAccountId?: number | string | null
  /** account linked to the chata's banker, if any */
  bankerAccountId?: number | string | null
}): boolean {
  if (args.managesChata) return true
  if (args.userId == null) return false
  const me = String(args.userId)
  return (
    (args.payerAccountId != null && refId(args.payerAccountId) === me) ||
    (args.bankerAccountId != null && refId(args.bankerAccountId) === me)
  )
}

/**
 * May this account edit/delete the expense? The author, plus the account of
 * the participant the expense says paid — an expense recorded FOR you is
 * yours to correct.
 */
export function canManageExpense(args: {
  userId: number | string | null | undefined
  authoredById?: number | string | null
  payerAccountId?: number | string | null
}): boolean {
  if (args.userId == null) return false
  const me = String(args.userId)
  return (
    (args.authoredById != null && refId(args.authoredById) === me) ||
    (args.payerAccountId != null && refId(args.payerAccountId) === me)
  )
}

/** Is this expense part of the journal and the maths? (undefined = legacy row) */
export function isCountedExpense(status: ApprovalStatus | null | undefined): boolean {
  return status == null || status === 'approved'
}
