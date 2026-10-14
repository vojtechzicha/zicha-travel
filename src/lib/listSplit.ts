// Who pays for the shared lists ("Nákup", "Pivo"). By default every item
// is split equally among all participants of the chata; a participant may
// opt out of a single item ("tohle nechci") or of a whole list ("na pivo se
// neskládám", which covers items added later too). When the banker closes a
// list, its total becomes ONE expense whose weights are these shares in
// whole crowns (src/utils/listExpense.ts). Pure rules, shared by the
// endpoint, the slug API and the UI.

export type ListKind = 'shopping' | 'beer'

export interface SplitItem {
  id: number | string
  /** CZK for the whole line; null = no price known (left out of the split) */
  cost: number | null
}

export interface ListOptOuts {
  /** participants who opted out of the whole list */
  list: (number | string)[]
  /** item id → participants who opted out of that item */
  items: Record<string, (number | string)[]>
}

export interface ListShares {
  /** participant id → CZK (unrounded) */
  shares: Map<string, number>
  /** CZK of all priced items */
  total: number
  /** items without a price, not in the split */
  unpriced: number
  /** items nobody chips in for any more: split among everyone instead */
  orphaned: string[]
}

/**
 * Each priced item's cost split equally among the participants who didn't
 * opt out of it or of the list. An item everybody opted out of was still
 * bought, so it falls back to everyone.
 */
export function listShares(
  participantIds: (number | string)[],
  items: SplitItem[],
  optOuts: ListOptOuts,
): ListShares {
  const everyone = participantIds.map(String)
  const outOfList = new Set(optOuts.list.map(String))
  const shares = new Map<string, number>(everyone.map((id) => [id, 0]))
  let total = 0
  let unpriced = 0
  const orphaned: string[] = []
  for (const item of items) {
    if (item.cost == null || !Number.isFinite(item.cost)) {
      unpriced += 1
      continue
    }
    total += item.cost
    const outOfItem = new Set((optOuts.items[String(item.id)] ?? []).map(String))
    let sharers = everyone.filter((id) => !outOfList.has(id) && !outOfItem.has(id))
    if (sharers.length === 0) {
      orphaned.push(String(item.id))
      sharers = everyone
    }
    if (sharers.length === 0) continue
    const each = item.cost / sharers.length
    for (const id of sharers) shares.set(id, (shares.get(id) ?? 0) + each)
  }
  return { shares, total, unpriced, orphaned }
}

/**
 * Shares in whole crowns that add up to the rounded total exactly (largest
 * remainder), so the expense's weights read as exact amounts. Participants
 * with nothing to pay are left out.
 */
export function roundedShares(shares: Map<string, number>): Map<string, number> {
  const entries = [...shares.entries()].filter(([, value]) => value > 0)
  const total = Math.round(entries.reduce((sum, [, value]) => sum + value, 0))
  const floors = entries.map(([id, value]) => ({ id, floor: Math.floor(value), rest: value % 1 }))
  let missing = total - floors.reduce((sum, entry) => sum + entry.floor, 0)
  const byRest = [...floors].sort((a, b) => b.rest - a.rest || a.id.localeCompare(b.id))
  for (const entry of byRest) {
    if (missing <= 0) break
    entry.floor += 1
    missing -= 1
  }
  return new Map(floors.filter((entry) => entry.floor > 0).map((entry) => [entry.id, entry.floor]))
}

/** Weights scaled to a known amount (the real bill), in whole crowns. */
export function scaledShares(shares: Map<string, number>, amount: number): Map<string, number> {
  const sum = [...shares.values()].reduce((total, value) => total + value, 0)
  if (sum <= 0) return new Map()
  return roundedShares(new Map([...shares].map(([id, value]) => [id, (value / sum) * amount])))
}

/**
 * Who may set someone's opt-out: the account that owns the participant (a
 * parent for a child), the banker and chata admins.
 */
export function canSetOptOut(args: {
  ownsParticipant: boolean
  isBanker: boolean
  isChataAdmin: boolean
}): boolean {
  return args.ownsParticipant || args.isBanker || args.isChataAdmin
}

/** What the slug API ships about opt-outs; names only to signed-in viewers. */
export interface OptOutView {
  /** participant ids; null for anonymous viewers (they get the counts) */
  list: number[] | null
  items: Record<string, number[]> | null
  listCount: number
  itemCounts: Record<string, number>
  /** participants this viewer may opt in or out */
  canSetFor: number[]
}

/** The opt-outs as the slug API ships them to one viewer. */
export function optOutView(
  optOuts: ListOptOuts,
  args: { signedIn: boolean; canSetFor: number[] },
): OptOutView {
  const itemCounts: Record<string, number> = {}
  for (const [item, ids] of Object.entries(optOuts.items)) itemCounts[item] = new Set(ids).size
  return {
    list: args.signedIn ? optOuts.list.map(Number) : null,
    items: args.signedIn
      ? Object.fromEntries(
          Object.entries(optOuts.items).map(([item, ids]) => [item, ids.map(Number)]),
        )
      : null,
    listCount: new Set(optOuts.list.map(String)).size,
    itemCounts,
    canSetFor: args.canSetFor,
  }
}
