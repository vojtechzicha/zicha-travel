import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

// Acceptance test for compliance blocker 1 (docs/legal/compliance-gaps.md):
// an unauthenticated request to any API route returns no receipt, no email,
// no bank field of anyone but the chata's banker, and no balance or
// breakdown belonging to a locked participant. Runs against whatever data
// the local database holds — the assertions are data-independent invariants,
// so they fail whenever a future field re-exposes something.
//
// Needs the local docker-compose database (pnpm db), like api.int.spec.ts.

let payload: Payload

const anonymous = { overrideAccess: false, user: undefined } as const

describe('anonymous API privacy invariants', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('serves no bank fields except the banker’s', async () => {
    const chatas = await payload.find({
      collection: 'chatas',
      depth: 0,
      limit: 100,
      context: { triggerAfterRead: false },
      ...anonymous,
    })
    const bankerByChata = new Map<string, string | null>()
    for (const chata of chatas.docs) {
      bankerByChata.set(
        String(chata.id),
        chata.banker != null ? String(chata.banker) : null,
      )
    }
    const participants = await payload.find({
      collection: 'participants',
      depth: 0,
      limit: 1000,
      ...anonymous,
    })
    for (const p of participants.docs) {
      const bankerId = bankerByChata.get(String(p.chata))
      const isBanker = bankerId != null && String(p.id) === bankerId
      if (!isBanker) {
        expect(p.accountNumber ?? null, `participant ${p.id} accountNumber`).toBeNull()
        expect(p.iban ?? null, `participant ${p.id} iban`).toBeNull()
      }
    }
  })

  it('denies anonymous reads of users (emails)', async () => {
    await expect(
      payload.find({ collection: 'users', depth: 0, limit: 1, ...anonymous }),
    ).rejects.toThrow()
  })

  it('denies anonymous reads of receipts', async () => {
    await expect(
      payload.find({ collection: 'expense-attachments', depth: 0, limit: 1, ...anonymous }),
    ).rejects.toThrow()
  })

  it('denies anonymous reads of claim requests', async () => {
    await expect(
      payload.find({ collection: 'claim-requests', depth: 0, limit: 1, ...anonymous }),
    ).rejects.toThrow()
  })

  it('serves only counted expenses to anonymous readers', async () => {
    const expenses = await payload.find({
      collection: 'expenses',
      depth: 0,
      limit: 1000,
      ...anonymous,
    })
    for (const e of expenses.docs) {
      expect(
        e.approvalStatus == null || e.approvalStatus === 'approved',
        `expense ${e.id} approvalStatus`,
      ).toBe(true)
    }
  })

  it('serves no private expenses to anonymous readers', async () => {
    const expenses = await payload.find({
      collection: 'expenses',
      depth: 0,
      limit: 1000,
      ...anonymous,
    })
    for (const e of expenses.docs) {
      expect(e.isPrivate ?? false, `expense ${e.id} isPrivate`).toBe(false)
    }
  })

  it('withholds locked participants’ balances from anonymous chata stats', async () => {
    const chatas = await payload.find({
      collection: 'chatas',
      depth: 0,
      limit: 100,
      context: { triggerAfterRead: false },
      ...anonymous,
    })
    for (const chata of chatas.docs) {
      // single-doc read triggers the afterRead stats hook, anonymously
      const doc = (await payload.findByID({
        collection: 'chatas',
        id: chata.id,
        depth: 0,
        ...anonymous,
      })) as { _stats?: { participants: Record<string, unknown> } }
      if (!doc._stats) continue
      const participants = await payload.find({
        collection: 'participants',
        where: { chata: { equals: chata.id } },
        depth: 0,
        limit: 1000,
        overrideAccess: true,
      })
      const accountIds = participants.docs
        .filter((p) => p.account != null)
        .map((p) => (typeof p.account === 'object' ? (p.account as { id: number }).id : p.account))
      if (accountIds.length === 0) continue
      const users = await payload.find({
        collection: 'users',
        where: { id: { in: accountIds } },
        depth: 0,
        limit: 1000,
        overrideAccess: true,
      })
      const activeAccounts = new Set(
        users.docs.filter((u) => u.lastLoginAt).map((u) => String(u.id)),
      )
      for (const p of participants.docs) {
        const accountId =
          p.account == null
            ? null
            : typeof p.account === 'object'
              ? String((p.account as { id: number }).id)
              : String(p.account)
        if (accountId != null && activeAccounts.has(accountId)) {
          expect(
            doc._stats.participants[p.name],
            `locked participant ${p.name} must not appear in anonymous stats`,
          ).toBeUndefined()
        }
      }
    }
  })
})
