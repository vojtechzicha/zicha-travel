// Payments between a participant and the banker ("zálohy", collection
// `prepayments`): who may record them and how the sign works. Pure, shared by
// the collection hooks, the Finance view's editor and the Claude connector.
//
// Who: superadmins, admins of the chata, and the chata's BANKER (the account
// linked to the chata's banker participant). The banker is the one who sees
// the money arrive on their account, so they record it without the admin
// panel. Everybody else only reads.
//
// Sign (unchanged from the admin panel, calculateStats relies on it):
// advance (záloha) and supplement (doplatek) are money TO the banker and are
// stored positive; refund (vratka) and distribution are money FROM the banker
// and are stored negative. The frontend and the connector take a positive
// amount plus the type and store the signed value.

export const PREPAYMENT_TYPES = ['advance', 'supplement', 'refund', 'distribution'] as const
export type PrepaymentType = (typeof PREPAYMENT_TYPES)[number]

/** Money that leaves the banker (stored negative). */
export const isOutgoingType = (type: PrepaymentType): boolean =>
  type === 'refund' || type === 'distribution'

/** The stored amount for a positive amount of this type. */
export function signedPrepaymentAmount(type: PrepaymentType, amount: number): number {
  const abs = Math.abs(amount)
  return isOutgoingType(type) ? -abs : abs
}

/** Largest amount the frontend and the connector accept (a typo guard). */
export const MAX_PREPAYMENT_AMOUNT = 1_000_000

export type PrepaymentProblem = 'type' | 'amount' | 'sign'

/**
 * What is wrong with a prepayment written outside the admin panel, or null.
 * The admin panel keeps its free hand (legacy rows of every shape exist);
 * the banker's path must keep the sign consistent with the type.
 */
export function prepaymentProblem(input: { type: unknown; amount: unknown }): PrepaymentProblem | null {
  if (typeof input.type !== 'string' || !(PREPAYMENT_TYPES as readonly string[]).includes(input.type)) {
    return 'type'
  }
  const amount = input.amount
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) return 'amount'
  if (Math.abs(amount) > MAX_PREPAYMENT_AMOUNT) return 'amount'
  const outgoing = isOutgoingType(input.type as PrepaymentType)
  if (outgoing ? amount > 0 : amount < 0) return 'sign'
  return null
}

/**
 * May this account record and change prepayments of the chata? `isBanker` =
 * the account owns the chata's banker participant; `managesChata` = superadmin
 * or an admin with this chata assigned.
 */
export const canManagePrepayments = (args: { managesChata: boolean; isBanker: boolean }): boolean =>
  args.managesChata || args.isBanker
