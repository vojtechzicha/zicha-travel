// Data shaping for the "Přehled" (finance-overview) screen: every
// participant's "first table" side by side — one matrix (or card list) whose
// every row can be recalculated. Pure logic, unit-tested; rendering lives in
// components/FinanceOverview.tsx.

import type { ChataStats } from '@/utils/calculateStats'

export interface OverviewCellEntry {
  /** signed share on this expense (0 for an invited guest) */
  cost: number
  weight: number
  weightIsAmount?: boolean
  /** guest: the host covering this share */
  invitedBy?: string
  /** host: guests whose shares are included in `cost` */
  invitedGuests: string[]
  /** standing "paid by" arrangement rather than a one-off invite */
  auto?: boolean
}

export interface OverviewExpenseRow {
  id: string | number
  title: string
  amount: number
  payerLabel: string
  /** participant name → their cell (absent = not part of the split) */
  cells: Record<string, OverviewCellEntry>
}

/** Banker first, then Czech alphabetical — the approved column order. */
export function overviewOrder(names: string[], bankerName: string): string[] {
  return [...names].sort((a, b) => {
    if (a === bankerName) return -1
    if (b === bankerName) return 1
    return a.localeCompare(b, 'cs')
  })
}

/**
 * One row per ACTUAL (non-planned) expense, with each participant's share
 * pulled from the stats breakdown (matched by expense id, so duplicate
 * titles stay separate). A host's cell merges their own share with the
 * guests' shares they cover. Private expenses ("soukromý výdaj") never get a
 * row, even for their own members: the overview is the shared dispute table
 * and must show the same picture to everybody — and the pot maths excludes
 * them anyway, so a row would only dangle with empty cells.
 */
export function buildExpenseRows(
  expenses: Array<{
    id: string | number
    title: string
    amount: number
    isPlanned?: boolean | null
    isPrivate?: boolean | null
  }>,
  payerLabels: Record<string, string>,
  stats: ChataStats,
): OverviewExpenseRow[] {
  return expenses
    .filter((e) => !e.isPlanned && e.isPrivate !== true)
    .map((e) => {
      const cells: Record<string, OverviewCellEntry> = {}
      for (const [name, pStats] of Object.entries(stats.participants)) {
        for (const entry of pStats.costBreakdown) {
          if (entry.isPlanned) continue
          if (String(entry.expenseId) !== String(e.id)) continue
          const cell = (cells[name] ||= {
            cost: 0,
            weight: entry.weight,
            weightIsAmount: entry.weightIsAmount,
            invitedGuests: [],
          })
          cell.cost += entry.cost
          if (entry.invitedBy) {
            cell.invitedBy = entry.invitedBy
            cell.auto = entry.auto
          }
          if (entry.invitedGuest) {
            cell.invitedGuests.push(entry.invitedGuest)
            cell.auto = entry.auto
          } else {
            // the participant's own entry carries their weight
            cell.weight = entry.weight
            cell.weightIsAmount = entry.weightIsAmount
          }
        }
      }
      return {
        id: e.id,
        title: e.title,
        amount: e.amount,
        payerLabel: payerLabels[String(e.id)] || '',
        cells,
      }
    })
}

export type PrepaymentRowKind = 'advance' | 'supplement' | 'refund'

/**
 * Signed per-participant values for one prepayment row, straight from
 * ParticipantStats (the banker's collected side is already negative there,
 * so each row sums to zero). Returns null when nobody has a value.
 */
export function prepaymentRow(
  kind: PrepaymentRowKind,
  stats: ChataStats,
): Record<string, number> | null {
  const field =
    kind === 'advance' ? 'prepaidAdvance' : kind === 'supplement' ? 'prepaidSupplement' : 'prepaidRefund'
  const values: Record<string, number> = {}
  let any = false
  for (const [name, pStats] of Object.entries(stats.participants)) {
    const value = pStats[field]
    if (Math.abs(value) > 0.005) {
      values[name] = value
      any = true
    }
  }
  return any ? values : null
}

/** Sum of a record's values (the Σ-kontrola column). */
export function rowSum(values: Record<string, number>): number {
  return Object.values(values).reduce((a, b) => a + b, 0)
}

/** Verdict with the project's 1 Kč settlement threshold. */
export function verdict(balance: number): 'get' | 'owe' | 'settled' {
  if (balance > 1) return 'get'
  if (balance < -1) return 'owe'
  return 'settled'
}
