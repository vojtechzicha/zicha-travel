// Reference cleanup when a user account is deleted (compliance blocker 6):
// deleting a user used to cascade nowhere — participants.account,
// expenses.authoredBy/payerAccount/approvalDecidedBy and claim requests
// kept pointing at the deleted row. Wired into the Users beforeDelete hook
// so the admin panel delete, the rights machinery and the retention job all
// clean up the same way. The caller's `req` is threaded into every nested
// operation so the cleanup joins the delete's transaction — a delete that
// fails after the hook must roll the unlinking back too, or the account
// would survive with its claims gone and its participants unlocked.

import type { Payload, PayloadRequest } from 'payload'
import { refId } from '@/lib/access'

export interface UserCleanupSummary {
  participantsUnlinked: number
  expensesCleaned: number
  claimsDeleted: number
}

export async function cleanupDeletedUserReferences(
  payload: Payload,
  userId: number | string,
  req?: PayloadRequest,
): Promise<UserCleanupSummary> {
  const summary: UserCleanupSummary = {
    participantsUnlinked: 0,
    expensesCleaned: 0,
    claimsDeleted: 0,
  }

  // participants.account → null (the participant stays with the trip)
  const participants = await payload.find({
    collection: 'participants',
    where: { account: { equals: userId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const participant of participants.docs) {
    await payload.update({
      collection: 'participants',
      id: participant.id,
      data: { account: null },
      depth: 0,
      overrideAccess: true,
      req,
    })
    summary.participantsUnlinked++
  }

  // expenses: authoredBy / payerAccount / approvalDecidedBy → null; the
  // expense itself (amounts, shares) stays — it is the group's record
  const expenses = await payload.find({
    collection: 'expenses',
    where: {
      or: [
        { authoredBy: { equals: userId } },
        { payerAccount: { equals: userId } },
        { approvalDecidedBy: { equals: userId } },
      ],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const expense of expenses.docs) {
    const data: Record<string, unknown> = {}
    if (expense.authoredBy != null && refId(expense.authoredBy) === String(userId)) {
      data.authoredBy = null
    }
    if (expense.payerAccount != null && refId(expense.payerAccount) === String(userId)) {
      data.payerAccount = null
    }
    if (expense.approvalDecidedBy != null && refId(expense.approvalDecidedBy) === String(userId)) {
      data.approvalDecidedBy = null
    }
    if (Object.keys(data).length === 0) continue
    await payload.update({
      collection: 'expenses',
      id: expense.id,
      data,
      depth: 0,
      overrideAccess: true,
      req,
      // administrative cleanup, not a decision — no approval side effects
      context: { expenseDecision: true, skipExpenseApprovalEffects: true },
    })
    summary.expensesCleaned++
  }

  // claim requests BY this user are meaningless without them — delete;
  // requests they merely DECIDED keep the row, only the decider ref clears
  const ownClaims = await payload.find({
    collection: 'claim-requests',
    where: { user: { equals: userId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const claim of ownClaims.docs) {
    await payload.delete({
      collection: 'claim-requests',
      id: claim.id,
      overrideAccess: true,
      req,
      context: { skipClaimSideEffects: true },
    })
    summary.claimsDeleted++
  }
  const decidedClaims = await payload.find({
    collection: 'claim-requests',
    where: { decidedBy: { equals: userId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const claim of decidedClaims.docs) {
    await payload.update({
      collection: 'claim-requests',
      id: claim.id,
      data: { decidedBy: null },
      depth: 0,
      overrideAccess: true,
      req,
      context: { skipClaimSideEffects: true },
    })
  }

  return summary
}
