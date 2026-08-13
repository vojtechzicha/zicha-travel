/**
 * Statistics calculation utilities for expense splitting
 * Based on the original PoC calculateStats logic
 */

import { isCountedExpense, type ApprovalStatus } from '../lib/expenseAuthoring'

export interface PayerRef {
  id: string | number
  name: string
  relationTo?: 'participants' | 'joint-accounts'
}

export interface Expense {
  id: string | number
  title: string
  amount: number
  payer: string | PayerRef
  splitType: 'equal' | 'weighted'
  weights?: Array<{
    participant: string | { id: string; name: string }
    weight: number
  }>
  invitations?: Array<{
    host: string | { id: string; name: string }
    guest: string | { id: string; name: string }
    /** Standing "paid by" arrangement (Participant.paidBy) rather than a one-off invite */
    auto?: boolean | null
  }>
  isPlanned?: boolean
  /**
   * "Výdaj za jiného plátce": anything other than 'approved' (or a legacy
   * row with no value at all) is a claim nobody has confirmed yet — it is
   * skipped by every calculation below. See docs/PRD-vydaj-za-jineho.md.
   */
  approvalStatus?: ApprovalStatus | null
}

export interface Prepayment {
  id: string | number
  from: string | PayerRef
  amount: number
  note?: string
  type: 'advance' | 'supplement' | 'refund' | 'distribution'
}

export interface Participant {
  id: string
  name: string
}

export interface JointAccountInfo {
  id: string | number
  name: string
  memberNames: string[]
}

export interface ParticipantStats {
  name: string
  paidExternal: number
  plannedPaidExternal: number
  prepaidInternal: number
  prepaidAdvance: number
  prepaidSupplement: number
  prepaidRefund: number
  cost: number
  plannedCost: number
  costBreakdown: Array<{
    /** Source expense — lets the overview matrix group entries per expense */
    expenseId?: string | number
    title: string
    cost: number
    weight: number
    /** The expense's weights sum to its amount (±1 Kč), so `weight` is a Kč amount */
    weightIsAmount?: boolean
    isPlanned?: boolean
    /** Set on the guest's zero-cost entry: name of the host covering the share */
    invitedBy?: string
    /** Set on the host's extra entry: name of the guest whose share this is */
    invitedGuest?: string
    /** With invitedBy/invitedGuest: standing "paid by" arrangement, not a one-off invite */
    auto?: boolean
  }>
  balance: number
}

export interface ChataStats {
  participants: Record<string, ParticipantStats>
  debtors: Array<{ name: string; amount: number }>
  creditors: Array<{ name: string; amount: number }>
  totalExpenses: number
  totalPrepayments: number
}

/**
 * Get name from participant (handles both string and object format)
 */
function getParticipantName(participant: string | { id: string; name: string }): string {
  return typeof participant === 'string' ? participant : participant.name
}

/**
 * Resolve a payer/from reference to the list of participant names the amount
 * is attributed to. A participant resolves to itself; a joint account
 * ("společný účet") resolves to its members — the amount is then split
 * equally among them.
 */
function getContributorNames(
  ref: string | PayerRef,
  jointAccountsById: Map<string, JointAccountInfo>,
  jointAccountsByName: Map<string, JointAccountInfo>
): string[] {
  if (typeof ref === 'string') {
    return [ref]
  }
  if (ref.relationTo === 'joint-accounts') {
    const ja = jointAccountsById.get(String(ref.id)) || jointAccountsByName.get(ref.name)
    if (ja && ja.memberNames.length > 0) {
      return ja.memberNames
    }
    // Unknown joint account — behave like an unknown participant name
    // (silently uncredited), matching existing behavior
    return [ref.name]
  }
  return [ref.name]
}

/**
 * Calculate statistics for a chata
 */
export function calculateStats(
  participants: Participant[],
  allExpenses: Expense[],
  prepayments: Prepayment[],
  bankerName: string,
  jointAccounts: JointAccountInfo[] = []
): ChataStats {
  // An expense recorded for somebody else counts only once it is confirmed —
  // until then it exists in the database and nowhere else (docs/PRD-vydaj-za-jineho.md)
  const expenses = allExpenses.filter((e) => isCountedExpense(e.approvalStatus))
  const jointAccountsById = new Map<string, JointAccountInfo>()
  const jointAccountsByName = new Map<string, JointAccountInfo>()
  jointAccounts.forEach((ja) => {
    jointAccountsById.set(String(ja.id), ja)
    jointAccountsByName.set(ja.name, ja)
  })
  // Initialize stats for each participant
  const stats: Record<string, ParticipantStats> = {}

  participants.forEach((p) => {
    stats[p.name] = {
      name: p.name,
      paidExternal: 0,
      plannedPaidExternal: 0,
      prepaidInternal: 0,
      prepaidAdvance: 0,
      prepaidSupplement: 0,
      prepaidRefund: 0,
      cost: 0,
      plannedCost: 0,
      costBreakdown: [],
      balance: 0,
    }
  })

  // Process expenses
  expenses.forEach((expense) => {
    const amount = expense.amount
    const isPlanned = expense.isPlanned || false

    // Credit the payment: a joint-account payment is attributed equally to
    // its members; a personal payment is a single contributor with the full
    // amount (identical to the original behavior)
    const contributors = getContributorNames(expense.payer, jointAccountsById, jointAccountsByName)
    const contributorShare = amount / contributors.length
    contributors.forEach((payerName) => {
      if (stats[payerName]) {
        if (isPlanned) {
          stats[payerName].plannedPaidExternal += contributorShare
        } else {
          stats[payerName].paidExternal += contributorShare
        }
      }
    })

    // Calculate cost shares
    let weights: Record<string, number> = {}

    if (expense.splitType === 'equal') {
      // Equal split among all participants
      participants.forEach((p) => {
        weights[p.name] = 1
      })
    } else if (expense.weights && expense.weights.length > 0) {
      // Weighted split
      expense.weights.forEach((w) => {
        const name = getParticipantName(w.participant)
        weights[name] = w.weight
      })
    }

    // Calculate total units
    const totalUnits = Object.values(weights).reduce((sum, w) => sum + w, 0)

    // Weights summing to the amount (1 Kč tolerance) are Kč amounts, not
    // abstract multipliers — the UI then shows them as currency
    const weightIsAmount =
      expense.splitType === 'weighted' && totalUnits > 0 && Math.abs(totalUnits - amount) <= 1

    // Invitations ("pozvání"): the host covers the guest's share of this
    // expense. Each guest's ORIGINAL share moves to their direct host —
    // single hop, so a host who is themselves invited still pays for their
    // own guests, and chains/cycles stay deterministic. A host can cover
    // any number of guests. An unknown host cannot absorb the share, so it
    // stays with the guest and balances keep summing to zero.
    const hostByGuest = new Map<string, { hostName: string; auto: boolean }>()
    ;(expense.invitations || []).forEach((inv) => {
      const guestName = getParticipantName(inv.guest)
      const hostName = getParticipantName(inv.host)
      if (!guestName || !hostName || guestName === hostName) return
      if (!stats[hostName]) return
      if (!hostByGuest.has(guestName)) {
        hostByGuest.set(guestName, { hostName, auto: Boolean(inv.auto) })
      }
    })

    // Distribute cost - track actual and planned separately
    if (totalUnits > 0) {
      Object.entries(weights).forEach(([name, weight]) => {
        if (!stats[name]) return
        const cost = (amount / totalUnits) * weight
        const invitation = hostByGuest.get(name)
        if (invitation) {
          const { hostName, auto } = invitation
          // Guest: the host pays this share instead
          if (isPlanned) {
            stats[hostName].plannedCost += cost
          } else {
            stats[hostName].cost += cost
          }
          stats[name].costBreakdown.push({
            expenseId: expense.id,
            title: expense.title,
            cost: 0,
            weight: weight,
            weightIsAmount: weightIsAmount,
            isPlanned: isPlanned,
            invitedBy: hostName,
            auto: auto,
          })
          stats[hostName].costBreakdown.push({
            expenseId: expense.id,
            title: expense.title,
            cost: cost,
            weight: weight,
            weightIsAmount: weightIsAmount,
            isPlanned: isPlanned,
            invitedGuest: name,
            auto: auto,
          })
        } else {
          if (isPlanned) {
            stats[name].plannedCost += cost
          } else {
            stats[name].cost += cost
          }
          stats[name].costBreakdown.push({
            expenseId: expense.id,
            title: expense.title,
            cost: cost,
            weight: weight,
            weightIsAmount: weightIsAmount,
            isPlanned: isPlanned,
          })
        }
      })
    }
  })

  // Process prepayments — a joint-account prepayment is decomposed into
  // equal per-member shares, each processed like a personal prepayment
  prepayments.forEach((prepayment) => {
    const contributors = getContributorNames(prepayment.from, jointAccountsById, jointAccountsByName)
    const amount = prepayment.amount / contributors.length

    contributors.forEach((fromName) => {
      // The banker's own prepayment (share) moves money within the pot they
      // already hold — counting only the sender side would inflate their
      // balance and break the zero-sum invariant (phantom "chybí vybrat"
      // with no debtors)
      if (fromName === bankerName) {
        return
      }

      if (stats[fromName]) {
        // Update prepaidInternal for the person making the prepayment
        stats[fromName].prepaidInternal += amount

        // Categorize prepayment for the person making it
        // Note: refunds/distributions have negative amount, advances/supplements are positive
        if (prepayment.type === 'advance') {
          stats[fromName].prepaidAdvance += amount
        } else if (prepayment.type === 'supplement') {
          stats[fromName].prepaidSupplement += amount
        } else if (prepayment.type === 'refund' || prepayment.type === 'distribution') {
          // Refund/distribution amount is negative, so prepaidRefund becomes negative for the recipient
          stats[fromName].prepaidRefund += amount
        }
      }

      // Update banker's stats (opposite direction)
      if (stats[bankerName] && fromName !== bankerName) {
        stats[bankerName].prepaidInternal -= amount

        // Banker's prepaid values are opposite of the participant's
        // Advances/supplements: banker receives (negative for banker)
        // Refunds/distributions: banker sends back (positive for banker after -= negative)
        if (prepayment.type === 'advance') {
          stats[bankerName].prepaidAdvance -= amount
        } else if (prepayment.type === 'supplement') {
          stats[bankerName].prepaidSupplement -= amount
        } else if (prepayment.type === 'refund' || prepayment.type === 'distribution') {
          stats[bankerName].prepaidRefund -= amount
        }
      }
    })
  })

  // Calculate final balances (including planned expenses for projected state)
  Object.values(stats).forEach((stat) => {
    stat.balance = stat.paidExternal + stat.plannedPaidExternal + stat.prepaidInternal - stat.cost - stat.plannedCost
  })

  // Calculate debtors and creditors
  // Only include people with balance >= 1 Kč (to avoid showing small rounding differences)
  const debtors = Object.values(stats)
    .filter((s) => s.balance < -1) // Must owe at least 1 Kč
    .map((s) => ({ name: s.name, amount: Math.abs(s.balance) }))
    .sort((a, b) => b.amount - a.amount)

  const creditors = Object.values(stats)
    .filter((s) => s.balance > 1) // Must be owed at least 1 Kč
    .map((s) => ({ name: s.name, amount: s.balance }))
    .sort((a, b) => b.amount - a.amount)

  // Calculate totals
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const totalPrepayments = prepayments.reduce((sum, p) => sum + p.amount, 0)

  return {
    participants: stats,
    debtors,
    creditors,
    totalExpenses,
    totalPrepayments,
  }
}

/**
 * Transform expense from Payload format to calculation format
 */
export function transformExpense(expense: any): Expense {
  return {
    id: expense.id,
    title: expense.title,
    amount: expense.amount,
    payer: expense.payer,
    splitType: expense.splitType,
    weights: expense.weights,
    invitations: expense.invitations,
    isPlanned: expense.isPlanned || false,
    approvalStatus: expense.approvalStatus ?? null,
  }
}

/**
 * Map bare participant IDs inside an expense's weights and invitations to
 * { id, name } objects using the participant name map. Works with depth 0
 * (bare IDs) and depth 1+ (populated docs pass through unchanged).
 */
export function populateExpenseParticipants(
  expense: Expense,
  participantNamesById: Map<string, string>
): Expense {
  const mapRef = (ref: string | { id: string; name: string }) =>
    typeof ref === 'object' && ref !== null
      ? ref
      : { id: String(ref), name: participantNamesById.get(String(ref)) || String(ref) }
  if (expense.weights) {
    expense.weights = expense.weights.map((w) => ({ ...w, participant: mapRef(w.participant) }))
  }
  if (expense.invitations) {
    expense.invitations = expense.invitations.map((inv) => ({
      ...inv,
      host: mapRef(inv.host),
      guest: mapRef(inv.guest),
    }))
  }
  return expense
}

/**
 * Transform prepayment from Payload format to calculation format
 */
export function transformPrepayment(prepayment: any): Prepayment {
  return {
    id: prepayment.id,
    from: prepayment.from,
    amount: prepayment.amount,
    note: prepayment.note,
    type: prepayment.type,
  }
}

/**
 * Transform participant from Payload format to calculation format
 */
export function transformParticipant(participant: any): Participant {
  return {
    id: participant.id,
    name: participant.name,
  }
}

/**
 * Transform joint account from Payload format to calculation format.
 * Works with depth 0 (member IDs) and depth 1+ (member docs); pass a
 * participant name map for the depth-0 case.
 */
export function transformJointAccount(
  jointAccount: any,
  participantNamesById?: Map<string, string>
): JointAccountInfo {
  const members: any[] = jointAccount.members || []
  return {
    id: jointAccount.id,
    name: jointAccount.name,
    memberNames: members
      .map((m) =>
        typeof m === 'object' && m !== null
          ? m.name
          : participantNamesById?.get(String(m)) || ''
      )
      .filter(Boolean),
  }
}

/**
 * Normalize a payer/from value from Payload into a PayerRef.
 * Handles every shape Payload can produce:
 * - bare ID (number/string) from a legacy monomorphic relationship at depth 0
 * - populated participant doc ({ id, name })
 * - polymorphic wrapper { relationTo, value } with value as ID or doc
 */
export function normalizePayerRef(
  raw: any,
  participantNamesById: Map<string, string>,
  jointAccountsById: Map<string, JointAccountInfo>
): PayerRef {
  if (raw === null || raw === undefined) {
    return { id: '', name: '' }
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    return {
      id: raw,
      name: participantNamesById.get(String(raw)) || String(raw),
      relationTo: 'participants',
    }
  }
  if ('relationTo' in raw) {
    const value = raw.value
    const id = typeof value === 'object' && value !== null ? value.id : value
    if (raw.relationTo === 'joint-accounts') {
      const name =
        typeof value === 'object' && value !== null
          ? value.name
          : jointAccountsById.get(String(id))?.name || String(id)
      return { id, name, relationTo: 'joint-accounts' }
    }
    const name =
      typeof value === 'object' && value !== null
        ? value.name
        : participantNamesById.get(String(id)) || String(id)
    return { id, name, relationTo: 'participants' }
  }
  // Already-populated participant doc
  return { id: raw.id, name: raw.name, relationTo: 'participants' }
}
