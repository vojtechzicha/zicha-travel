// Payload-backed helpers behind the privacy scrubbing in lib/privacyScrub —
// who is locked, and whose bank fields the current viewer may see. Shared by
// the chata slug API and the Chatas afterRead hook so REST and the shaped
// response enforce the same rules.

import type { Payload } from 'payload'
import { canManageChata, refId } from '@/lib/access'
import { maskEmail } from '@/lib/financeAccess'
import type { BankFieldVisibility } from '@/lib/privacyScrub'

interface ParticipantDocLike {
  id: number | string
  name?: string
  account?: unknown
}

type ViewerUser = { id: number | string } | null | undefined

export interface LockedParticipantInfo {
  id: number
  name: string
  maskedEmail: string
}

/**
 * Participants of one chata whose linked account is ACTIVE (has logged in at
 * least once) — the "locked" list. One users query for the whole batch.
 */
export async function findLockedParticipants(
  payload: Payload,
  participants: ParticipantDocLike[],
): Promise<LockedParticipantInfo[]> {
  const accountIds = [
    ...new Set(
      participants.filter((p) => p.account != null).map((p) => refId(p.account)),
    ),
  ]
  if (accountIds.length === 0) return []
  const usersResult = await payload.find({
    collection: 'users',
    where: { id: { in: accountIds } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const activeUsers = new Map<string, { email: string }>()
  usersResult.docs.forEach((u) => {
    if (u.lastLoginAt) activeUsers.set(String(u.id), { email: u.email })
  })
  return participants.flatMap((p) => {
    if (p.account == null) return []
    const account = activeUsers.get(refId(p.account))
    if (!account) return []
    return [{ id: Number(p.id), name: p.name ?? '', maskedEmail: maskEmail(account.email) }]
  })
}

/**
 * Which participants' bank fields this viewer may see (controller decisions
 * 6 and 13): chata admins and the banker's own account see all, everyone
 * else sees the banker's fields (the anonymous QR settlement needs them)
 * plus their own linked participants'.
 */
export function bankFieldVisibilityFor({
  user,
  chataId,
  bankerId,
  participants,
}: {
  user: ViewerUser
  chataId: number | string
  bankerId: string | null
  participants: ParticipantDocLike[]
}): BankFieldVisibility {
  if (canManageChata(user as Parameters<typeof canManageChata>[0], chataId)) return 'all'
  const allowed = new Set<string>()
  if (bankerId != null) allowed.add(bankerId)
  if (user != null) {
    for (const p of participants) {
      if (p.account != null && refId(p.account) === String(user.id)) {
        allowed.add(String(p.id))
        // the banker's account sees every creditor's fields (refund view)
        if (bankerId != null && String(p.id) === bankerId) return 'all'
      }
    }
  }
  return allowed
}
