// Server-side privacy scrubbing for API responses ("compliance blocker 1",
// docs/legal/compliance-gaps.md). Pure functions, unit-tested in
// tests/int/privacyScrub.int.spec.ts.
//
// The rules these implement (controller decisions 6 and 13):
// - Bank fields (accountNumber, iban) of everyone but the chata's banker are
//   served only to the owner account, the banker's account and chata admins.
//   The banker's own fields stay public — the anonymous QR settlement needs
//   them.
// - A participant whose account has signed in at least once ("locked") has
//   their per-person balance and breakdown withheld from anonymous
//   responses. The debtors/creditors settlement lists stay: the compliance
//   gate records "who owes what" as deliberately visible to anyone with the
//   link.
// - Receipts and email addresses are never served to anonymous callers.
//
// The deep walkers exist because the slug API populates at depth 2: the
// chata doc nests participant docs (banker, bed occupants, riders), and
// those can nest a populated user account — a top-level strip alone leaks.

import type { ChataStats } from '@/utils/calculateStats'

/** 'all' for admins and the banker's own account, otherwise the set of
 *  participant ids (as strings) whose bank fields the viewer may see. */
export type BankFieldVisibility = 'all' | ReadonlySet<string>

const refId = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? String((value as { id: unknown }).id)
    : String(value)

/** A populated participant doc, wherever it appears in a payload. */
const isParticipantLike = (obj: Record<string, unknown>): boolean =>
  'name' in obj &&
  'chata' in obj &&
  ('accountNumber' in obj || 'iban' in obj || 'account' in obj)

/** A populated user doc — must never reach an API response in full. */
const isUserLike = (obj: Record<string, unknown>): boolean =>
  typeof obj.email === 'string' && ('role' in obj || 'lastLoginAt' in obj)

/**
 * Walks the whole payload and, in place:
 * - blanks accountNumber/iban on every participant doc the viewer may not
 *   see (per `visibility`),
 * - flattens populated `account` relationships (and any stray user doc)
 *   back to a bare id, so no email or login state ships.
 */
export function deepScrubParticipants(node: unknown, visibility: BankFieldVisibility): void {
  const seen = new Set<object>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (!value || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)
    const obj = value as Record<string, unknown>

    if (isParticipantLike(obj)) {
      const allowed = visibility === 'all' || visibility.has(refId(obj.id))
      if (!allowed) {
        if ('accountNumber' in obj) obj.accountNumber = null
        if ('iban' in obj) obj.iban = null
      }
      if (obj.account && typeof obj.account === 'object') {
        obj.account = Number(refId(obj.account))
      }
    } else if (isUserLike(obj)) {
      // belt and braces — population paths should never get this far
      delete obj.email
      delete obj.loginToken
      delete obj.loginTokenExpires
    }

    Object.values(obj).forEach(walk)
  }
  walk(node)
}

/**
 * Removes the per-person stats entries (balance + breakdown) of locked
 * participants from a ChataStats object, in place. The debtors/creditors
 * settlement lists are left alone by design — see the file header.
 */
export function scrubLockedStats(stats: ChataStats, hiddenNames: ReadonlyArray<string>): void {
  for (const name of hiddenNames) {
    delete stats.participants[name]
  }
}

/**
 * Strips receipt attachments off expense docs for viewers who may not see
 * them (anonymous visitors). Mutates the docs.
 */
export function stripExpenseAttachments(expenses: Array<Record<string, unknown>>): void {
  for (const expense of expenses) {
    if ('attachments' in expense) expense.attachments = []
  }
}
