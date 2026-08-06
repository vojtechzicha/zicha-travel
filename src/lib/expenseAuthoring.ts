// Frontend expense authoring ("výdaje od účastníků") — pure rules shared by
// the Expenses collection hook (server-side enforcement) and the composer UI
// (building the payer options). A signed-in frontend account may:
// - create expenses in a chata where it owns at least one participant
// - pay only as one of its own participants, or as a joint account
//   ("společný účet") one of its participants is a member of
// - update/delete only expenses it authored (Expense.authoredBy)
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

/** Same payer target? (used to skip re-validation of an unchanged payer) */
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
