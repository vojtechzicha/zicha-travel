// Retention jobs (compliance blocker 5, docs/legal/compliance-gaps.md):
// the privacy policy's section 9 table, executed. Driven by the daily cron
// route /api/retention (CRON_SECRET), same pattern as the claim reminder.
//
// What runs, per the recorded retention decisions (4 and 8):
// - 12 months after a chata's EXPLICIT `settledAt` date: participants' bank
//   fields are cleared and the chata's receipts (expense attachments,
//   files included) are deleted.
// - accounts (role "user") with no login for 2 years (or never logged in
//   and created 2+ years ago) are deleted; the Users beforeDelete hook
//   cleans up every reference. Dormant ADMIN accounts are only reported —
//   removing an operator's access is a human decision.
// - decided claim requests (approved/rejected/cancelled) go 12 months
//   after the decision.
// - housekeeping: stale payload-locked-documents rows.
//
// Everything is idempotent and logs counts only — no names, no emails.

import type { Payload } from 'payload'
import { refId } from '@/lib/access'

export const MONTH_MS = 30 * 24 * 60 * 60 * 1000

export interface RetentionSummary {
  settledChatasProcessed: number
  bankFieldsCleared: number
  receiptsDeleted: number
  dormantUsersDeleted: number
  dormantAdminsFound: number
  decidedClaimsDeleted: number
  staleLocksDeleted: number
}

export async function runRetention(
  payload: Payload,
  now: number = Date.now(),
): Promise<RetentionSummary> {
  const summary: RetentionSummary = {
    settledChatasProcessed: 0,
    bankFieldsCleared: 0,
    receiptsDeleted: 0,
    dormantUsersDeleted: 0,
    dormantAdminsFound: 0,
    decidedClaimsDeleted: 0,
    staleLocksDeleted: 0,
  }

  // ── 1. Settled chatas: bank fields + receipts, 12 months after settledAt
  const settledCutoff = new Date(now - 12 * MONTH_MS).toISOString()
  const settledChatas = await payload.find({
    collection: 'chatas',
    where: { settledAt: { less_than: settledCutoff } },
    limit: 1000,
    depth: 0,
    context: { triggerAfterRead: false },
    overrideAccess: true,
  })
  for (const chata of settledChatas.docs) {
    summary.settledChatasProcessed++

    const participants = await payload.find({
      collection: 'participants',
      where: { chata: { equals: chata.id } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    for (const participant of participants.docs) {
      if (participant.accountNumber == null && participant.iban == null) continue
      await payload.update({
        collection: 'participants',
        id: participant.id,
        data: { accountNumber: null, iban: null },
        depth: 0,
        overrideAccess: true,
      })
      summary.bankFieldsCleared++
    }

    const expenses = await payload.find({
      collection: 'expenses',
      where: { chata: { equals: chata.id } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    for (const expense of expenses.docs) {
      const attachments = (expense.attachments ?? []).map(refId)
      if (attachments.length === 0) continue
      await payload.update({
        collection: 'expenses',
        id: expense.id,
        data: { attachments: [] },
        depth: 0,
        overrideAccess: true,
        // administrative cleanup, not a decision — no approval side effects
        context: { expenseDecision: true, skipExpenseApprovalEffects: true },
      })
      for (const attachmentId of attachments) {
        try {
          // payload.delete removes the stored file (disk or S3) with the doc
          await payload.delete({
            collection: 'expense-attachments',
            id: attachmentId,
            overrideAccess: true,
          })
          summary.receiptsDeleted++
        } catch (err) {
          payload.logger.error({ err, attachment: attachmentId }, 'Retention: receipt delete failed')
        }
      }
    }
  }

  // ── 2. Dormant accounts: no login for 2 years (never-logged-in accounts
  //      count from creation)
  const dormantCutoff = new Date(now - 24 * MONTH_MS).toISOString()
  const dormantUsers = await payload.find({
    collection: 'users',
    where: {
      or: [
        { lastLoginAt: { less_than: dormantCutoff } },
        {
          and: [
            { lastLoginAt: { exists: false } },
            { createdAt: { less_than: dormantCutoff } },
          ],
        },
      ],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  for (const user of dormantUsers.docs) {
    if (user.role !== 'user') {
      // an admin losing access is a human decision — surface, don't delete
      summary.dormantAdminsFound++
      payload.logger.warn(
        { user: user.id, role: user.role },
        'Retention: dormant admin account needs manual review',
      )
      continue
    }
    try {
      // the Users beforeDelete hook nulls/cleans every reference
      await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
      summary.dormantUsersDeleted++
    } catch (err) {
      payload.logger.error({ err, user: user.id }, 'Retention: dormant account delete failed')
    }
  }

  // ── 3. Decided claim requests, 12 months after the decision
  const decidedClaims = await payload.find({
    collection: 'claim-requests',
    where: {
      and: [
        { status: { not_equals: 'pending' } },
        {
          or: [
            { decidedAt: { less_than: settledCutoff } },
            {
              and: [
                { decidedAt: { exists: false } },
                { updatedAt: { less_than: settledCutoff } },
              ],
            },
          ],
        },
      ],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  for (const claim of decidedClaims.docs) {
    try {
      await payload.delete({
        collection: 'claim-requests',
        id: claim.id,
        overrideAccess: true,
        context: { skipClaimSideEffects: true },
      })
      summary.decidedClaimsDeleted++
    } catch (err) {
      payload.logger.error({ err, claim: claim.id }, 'Retention: claim delete failed')
    }
  }

  // ── 4. Housekeeping: locked-document rows older than a day are leftovers
  //      of interrupted admin sessions
  try {
    const lockCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    const staleLocks = await payload.find({
      collection: 'payload-locked-documents',
      where: { updatedAt: { less_than: lockCutoff } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    for (const lock of staleLocks.docs) {
      await payload.delete({
        collection: 'payload-locked-documents',
        id: lock.id,
        overrideAccess: true,
      })
      summary.staleLocksDeleted++
    }
  } catch (err) {
    payload.logger.error({ err }, 'Retention: locked-documents housekeeping failed')
  }

  payload.logger.info(summary, 'Retention run finished')
  return summary
}
