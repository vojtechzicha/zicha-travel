import jwt from 'jsonwebtoken'

// Pure rules for "claim účastníka" — an anonymous visitor (or a signed-in
// user) claiming an account-less participant as themselves. Shared by the
// claim-requests collection endpoints and the frontend UI; unit-tested in
// tests/int/claimRequests.int.spec.ts. See docs/PRD-claim.md.

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

/** Own claim requests of the current viewer, shipped by the slug API. */
export interface ViewerClaim {
  id: number
  participantId: number
  status: ClaimStatus
  createdAt: string
}

/**
 * Whether a participant can be claimed at all. Mirrors the Finance-view
 * visibility rule: participants whose account is ACTIVE (logged in at
 * least once) are locked — everyone else is fair game, including
 * participants with an admin-created account that was never used (the
 * claim then goes through admin approval, never auto-approve, so an
 * admin-set link is never silently overwritten).
 */
export function isClaimableParticipant(p: {
  accountId: number | string | null
  accountActive: boolean
}): boolean {
  return !(p.accountId != null && p.accountActive)
}

export type AutoApproveReason = 'chata-admin' | 'known-face' | null

/**
 * The auto-approval shortcut ("známá tvář"): skip admin approval only when
 * - the requester already has a linked participant in a DIFFERENT chata
 *   (someone vouched for them there), AND the target participant has no
 *   account link at all (a pending admin-set link must stay an admin
 *   decision), or
 * - the requester could approve the claim themselves (chata admin).
 * Everything else waits for an admin ("nová tvář").
 */
export function autoApproveReason(args: {
  requesterManagesChata: boolean
  targetHasAccount: boolean
  requesterLinkedChataIds: Array<number | string>
  targetChataId: number | string
}): AutoApproveReason {
  if (args.requesterManagesChata) return 'chata-admin'
  if (args.targetHasAccount) return null
  const target = String(args.targetChataId)
  const elsewhere = args.requesterLinkedChataIds.some((id) => String(id) !== target)
  return elsewhere ? 'known-face' : null
}

// ---------------------------------------------------------------------------
// Decide tokens — signed links in the admin notification email. Bound to one
// claim AND one admin recipient; the decide endpoint re-checks the admin may
// still manage the chata, so a forwarded link cannot outlive a role change.

export const DECIDE_TOKEN_TTL_DAYS = 7

export interface DecideTokenPayload {
  claimId: number
  adminId: number
}

export function signDecideToken(payload: DecideTokenPayload, secret: string): string {
  return jwt.sign({ ...payload, purpose: 'claim-decide' }, secret, {
    expiresIn: `${DECIDE_TOKEN_TTL_DAYS}d`,
  })
}

export type DecideTokenResult =
  | { ok: true; claimId: number; adminId: number }
  | { ok: false; code: 'expired' | 'invalid' }

export function verifyDecideToken(token: string, secret: string): DecideTokenResult {
  try {
    const decoded = jwt.verify(token, secret) as {
      claimId?: unknown
      adminId?: unknown
      purpose?: unknown
    }
    if (
      decoded.purpose !== 'claim-decide' ||
      typeof decoded.claimId !== 'number' ||
      typeof decoded.adminId !== 'number'
    ) {
      return { ok: false, code: 'invalid' }
    }
    return { ok: true, claimId: decoded.claimId, adminId: decoded.adminId }
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, code: 'expired' }
    return { ok: false, code: 'invalid' }
  }
}

/**
 * The continuation URL a claim rides through a login flow: the visitor
 * picks "Tohle jsem já" → signs in (magic link or Microsoft) → lands back
 * on the finance view with ?claim=<participantId>, where the frontend
 * auto-submits the claim. Keeping the intent in the returnTo URL means it
 * survives both login flows with no extra session state.
 */
export function claimReturnTo(basePath: string, participantId: number): string {
  const [path, query = ''] = basePath.split('?')
  const params = new URLSearchParams(query)
  params.set('view', 'finance')
  params.set('participant', String(participantId))
  params.set('claim', String(participantId))
  return `${path}?${params.toString()}`
}
