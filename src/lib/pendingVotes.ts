import jwt from 'jsonwebtoken'

// Signed tokens of the pending-vote flow ("Nepotvrzené hlasy" —
// docs/PRD-planovani.md). Two kinds, both bound to a purpose so a session
// JWT or a claim decide token signed with the same secret never passes:
// - the CONFIRM token rides the vote email; it is bound to one pending row,
//   its account AND the submission it describes (`key`, regenerated on
//   every re-submission, so an older email can never confirm a newer
//   selection), lives 7 days and is separate from the account's single
//   magic-link slot, so a later login-link request cannot kill it
// - the INTENT token rides the `oauth-vote-intent` cookie for the ten
//   minutes an OAuth round trip takes; it carries the whole selection, so
//   the callback can create the account and the pending row from it
// Unit-tested in tests/int/pendingVotes.int.spec.ts.

export const VOTE_CONFIRM_TTL_DAYS = 7
export const VOTE_INTENT_TTL_MINUTES = 10

export interface VoteConfirmTokenPayload {
  pendingVoteId: number
  userId: number
  /** the row's `submissionKey` at the time the email went out */
  key: string
}

export function signVoteConfirmToken(payload: VoteConfirmTokenPayload, secret: string): string {
  return jwt.sign({ ...payload, purpose: 'vote-confirm' }, secret, {
    expiresIn: `${VOTE_CONFIRM_TTL_DAYS}d`,
  })
}

export type VoteConfirmTokenResult =
  | { ok: true; pendingVoteId: number; userId: number; key: string }
  | { ok: false; code: 'expired' | 'invalid' }

export function verifyVoteConfirmToken(token: string, secret: string): VoteConfirmTokenResult {
  try {
    const decoded = jwt.verify(token, secret) as Record<string, unknown>
    if (
      decoded.purpose !== 'vote-confirm' ||
      typeof decoded.pendingVoteId !== 'number' ||
      typeof decoded.userId !== 'number' ||
      typeof decoded.key !== 'string' ||
      decoded.key.length === 0
    ) {
      return { ok: false, code: 'invalid' }
    }
    return {
      ok: true,
      pendingVoteId: decoded.pendingVoteId,
      userId: decoded.userId,
      key: decoded.key,
    }
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, code: 'expired' }
    return { ok: false, code: 'invalid' }
  }
}

/** The selection an anonymous voter made before leaving for an OAuth provider. */
export interface VoteIntent {
  chataId: number
  name: string
  dateOptionIds: number[]
  accommodationOptionIds: number[]
}

export function signVoteIntentToken(intent: VoteIntent, secret: string): string {
  return jwt.sign({ ...intent, purpose: 'vote-intent' }, secret, {
    expiresIn: `${VOTE_INTENT_TTL_MINUTES}m`,
  })
}

const isIdList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((id) => Number.isInteger(id) && id > 0)

export function verifyVoteIntentToken(token: string, secret: string): VoteIntent | null {
  try {
    const decoded = jwt.verify(token, secret) as Record<string, unknown>
    if (
      decoded.purpose !== 'vote-intent' ||
      typeof decoded.chataId !== 'number' ||
      typeof decoded.name !== 'string' ||
      !isIdList(decoded.dateOptionIds) ||
      !isIdList(decoded.accommodationOptionIds)
    ) {
      return null
    }
    return {
      chataId: decoded.chataId,
      name: decoded.name,
      dateOptionIds: decoded.dateOptionIds,
      accommodationOptionIds: decoded.accommodationOptionIds,
    }
  } catch {
    return null
  }
}

/** Cookie carrying the intent across the OAuth round trip. */
export const VOTE_INTENT_COOKIE = 'oauth-vote-intent'
