import jwt from 'jsonwebtoken'

// Decide tokens for "výdaj za jiného plátce" — the signed links in the
// approval email. Bound to one expense AND one recipient; the decide
// endpoint re-checks that the recipient may still decide, so a forwarded
// link cannot outlive a role change or a re-assigned participant.
//
// Deliberately a separate purpose from the claim decide token
// (src/lib/claimRequests.ts): a token minted for one flow must never be
// replayable in the other.

export const EXPENSE_DECIDE_TOKEN_TTL_DAYS = 14

export interface ExpenseDecideTokenPayload {
  expenseId: number
  userId: number
}

export function signExpenseDecideToken(
  payload: ExpenseDecideTokenPayload,
  secret: string,
): string {
  return jwt.sign({ ...payload, purpose: 'expense-decide' }, secret, {
    expiresIn: `${EXPENSE_DECIDE_TOKEN_TTL_DAYS}d`,
  })
}

export type ExpenseDecideTokenResult =
  | { ok: true; expenseId: number; userId: number }
  | { ok: false; code: 'expired' | 'invalid' }

export function verifyExpenseDecideToken(
  token: string,
  secret: string,
): ExpenseDecideTokenResult {
  try {
    const decoded = jwt.verify(token, secret) as {
      expenseId?: unknown
      userId?: unknown
      purpose?: unknown
    }
    if (
      decoded.purpose !== 'expense-decide' ||
      typeof decoded.expenseId !== 'number' ||
      typeof decoded.userId !== 'number'
    ) {
      return { ok: false, code: 'invalid' }
    }
    return { ok: true, expenseId: decoded.expenseId, userId: decoded.userId }
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return { ok: false, code: 'expired' }
    return { ok: false, code: 'invalid' }
  }
}
