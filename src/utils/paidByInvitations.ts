/**
 * "Platí za něj/ni" (paid by) — standing invitations.
 *
 * A participant with `paidBy` set (e.g. a child paid by a parent) gets an
 * automatic invitation row `{ host: paidBy, guest: participant, auto: true }`
 * on every expense where they take a share. `auto` rows are managed by the
 * code here (added on expense create, reconciled by the retroactive sync)
 * and are hidden on the expense card; manual one-off invitations are never
 * touched. See docs/PRD-pozvani.md.
 */
import type { Payload } from 'payload'
import type { Expense as PayloadExpense } from '../payload-types'

type Ref = number | string | { id: number | string } | null | undefined

interface ExpenseShape {
  splitType?: 'equal' | 'weighted' | null
  weights?: Array<{ participant: Ref; weight?: number | null }> | null
  invitations?: Array<{ host: Ref; guest: Ref; auto?: boolean | null; id?: string | null }> | null
}

export interface PaidByPair {
  guest: number | string
  host: number | string
}

/** Comparison key (string) for a relationship value */
export function refId(ref: Ref): string | null {
  if (ref === null || ref === undefined) return null
  if (typeof ref === 'object') return String(ref.id)
  return String(ref)
}

/** Raw ID of a relationship value, preserving its type — Payload's
 * relationship validation rejects stringified numeric IDs */
export function rawId(ref: Ref): number | string | null {
  if (ref === null || ref === undefined) return null
  if (typeof ref === 'object') return ref.id
  return ref
}

/** Does this participant take a share of the expense? Equal split: everyone
 * does. Weighted: only with a positive weight. */
function takesShare(expense: ExpenseShape, participantId: string): boolean {
  if (expense.splitType !== 'weighted') return true
  return (expense.weights || []).some(
    (w) => refId(w.participant) === participantId && (w.weight || 0) > 0
  )
}

/**
 * Auto rows to append to an expense for the given paidBy pairs. Skips
 * self-pairs, guests already invited (auto or manual), and guests without
 * a share.
 */
export function buildAutoInvitations(
  expense: ExpenseShape,
  pairs: PaidByPair[]
): Array<{ host: number | string; guest: number | string; auto: true }> {
  const invitedGuests = new Set(
    (expense.invitations || []).map((inv) => refId(inv.guest)).filter(Boolean)
  )
  return pairs
    .filter((p) => String(p.host) !== String(p.guest))
    .filter((p) => !invitedGuests.has(String(p.guest)))
    .filter((p) => takesShare(expense, String(p.guest)))
    .map((p) => ({ host: p.host, guest: p.guest, auto: true as const }))
}

/** All paidBy pairs of a chata (guest = participant, host = their payer). */
export async function findPaidByPairs(
  payload: Payload,
  chataId: number | string
): Promise<PaidByPair[]> {
  const res = await payload.find({
    collection: 'participants',
    where: {
      and: [{ chata: { equals: chataId } }, { paidBy: { exists: true } }],
    },
    limit: 1000,
    depth: 0,
  })
  const pairs: PaidByPair[] = []
  for (const p of res.docs as any[]) {
    const host = rawId(p.paidBy)
    if (host !== null && String(host) !== String(p.id)) {
      pairs.push({ guest: p.id, host })
    }
  }
  return pairs
}

/**
 * Retroactive sync: reconcile ONE participant's auto rows across all
 * expenses of their chata against their current `paidBy`.
 *
 * - removes this guest's auto rows whose host no longer matches (paidBy
 *   changed) or when paidBy was cleared
 * - adds a missing auto row where the guest takes a share and has no
 *   invitation row yet (manual rows always win and are never modified)
 *
 * Idempotent; returns the number of expenses changed.
 */
export async function syncPaidByInvitations(
  payload: Payload,
  participant: { id: number | string; chata: Ref; paidBy?: Ref }
): Promise<{ scanned: number; updated: number }> {
  const guestId = String(participant.id)
  const hostRaw = rawId(participant.paidBy)
  const hostId = hostRaw === null ? null : String(hostRaw)
  const chataId = rawId(participant.chata)
  if (chataId === null) return { scanned: 0, updated: 0 }

  const expenses = await payload.find({
    collection: 'expenses',
    // Private expenses carry no invitations at all (docs/PRD-soukromy-vydaj.md);
    // touching one here would also tell a non-member host about it
    where: { and: [{ chata: { equals: chataId } }, { isPrivate: { not_equals: true } }] },
    limit: 1000,
    depth: 0,
  })

  let updated = 0
  for (const expense of expenses.docs as Array<ExpenseShape & { id: number | string }>) {
    const rows = expense.invitations || []
    let next = rows.filter(
      (row) =>
        !(row.auto && refId(row.guest) === guestId && (hostId === null || refId(row.host) !== hostId))
    )
    let changed = next.length !== rows.length
    const hasRow = next.some((row) => refId(row.guest) === guestId)
    if (hostRaw !== null && hostId !== guestId && !hasRow && takesShare(expense, guestId)) {
      next = [...next, { host: hostRaw, guest: participant.id, auto: true }]
      changed = true
    }
    if (changed) {
      await payload.update({
        collection: 'expenses',
        id: expense.id,
        data: { invitations: next as PayloadExpense['invitations'] },
        depth: 0,
      })
      updated++
    }
  }

  return { scanned: expenses.docs.length, updated }
}
