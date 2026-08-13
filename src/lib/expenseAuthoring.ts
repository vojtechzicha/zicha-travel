// Frontend expense authoring ("výdaje od účastníků") — pure rules shared by
// the Expenses collection hook (server-side enforcement) and the composer UI
// (building the payer options). A signed-in frontend account may:
// - create expenses in a chata where it owns at least one participant
// - pay as one of its own participants, or as a joint account
//   ("společný účet") one of its participants is a member of
// - pay as SOMEBODY ELSE of the same chata, participant or joint account
//   ("výdaj za jiného plátce") — that expense is stored but stays invisible
//   and out of the maths until it is confirmed (see needsApproval below)
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
// from the journal and keeps it out of every balance until somebody confirms
// it. The chata's admins always can; on top of them, whoever the payer
// speaks through can (payerAccountIds below) and so can the banker
// ("pokladník") — but only when those accounts actually exist, which is why
// the composer asks before promising a confirmer.
// See docs/PRD-vydaj-za-jineho.md.

export type ApprovalStatus = 'approved' | 'pending' | 'rejected'

/**
 * Does this payer choice need confirmation before the expense counts?
 * Admin roles and payers the author speaks for (own participant, own joint
 * account) never do; anybody else's participant or joint account does.
 */
export function needsApproval(args: {
  isAdmin: boolean
  /** the author owns the payer (own participant / own joint account) */
  payerIsOwn: boolean
}): boolean {
  return !args.isAdmin && !args.payerIsOwn
}

/**
 * Accounts that speak for the payer, so may confirm the expense: a
 * participant's own account, or EVERY member account of a joint account
 * ("společný účet" — a shared wallet, so any member can vouch for it).
 * Empty when nobody involved has an account: then only the banker and the
 * chata's admins are left.
 */
export function payerAccountIds(
  payer: PayerRefLike | null,
  participants: ParticipantLike[],
  jointAccounts: JointAccountLike[] = [],
): string[] {
  if (!payer) return []
  const accountOf = (participantId: string): string | null => {
    const found = participants.find((p) => String(p.id) === participantId)
    return found?.account != null ? refId(found.account) : null
  }
  if (payer.relationTo === 'participants') {
    const account = accountOf(refId(payer.value))
    return account ? [account] : []
  }
  const jointAccount = jointAccounts.find((ja) => String(ja.id) === refId(payer.value))
  if (!jointAccount) return []
  const ids = (jointAccount.members || [])
    .map((m) => accountOf(refId(m)))
    .filter((id): id is string => id != null)
  return [...new Set(ids)]
}

/**
 * May this account decide a pending expense? The chata's admins (and
 * superadmins) always may; so may the accounts of the two people the expense
 * speaks for — the payer participant and the banker ("pokladník"). Being the
 * author grants no say by itself (and the approval email skips them), but an
 * author who happens to be the banker or an admin may confirm their own
 * record — the verdict is stamped with their name either way.
 */
export function canDecideExpense(args: {
  userId: number | string | null | undefined
  managesChata: boolean
  /** accounts speaking for the payer (see payerAccountIds) */
  payerAccountIds?: ReadonlyArray<number | string | null | undefined>
  /** account linked to the chata's banker, if any */
  bankerAccountId?: number | string | null
}): boolean {
  if (args.managesChata) return true
  if (args.userId == null) return false
  const me = String(args.userId)
  return (
    (args.payerAccountIds || []).some((id) => id != null && refId(id) === me) ||
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
