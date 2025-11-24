/**
 * Statistics calculation utilities for expense splitting
 * Based on the original PoC calculateStats logic
 */

export interface Expense {
  id: string | number
  title: string
  amount: number
  payer: string | { id: string; name: string }
  splitType: 'equal' | 'weighted'
  weights?: Array<{
    participant: string | { id: string; name: string }
    weight: number
  }>
}

export interface Prepayment {
  id: string | number
  from: string | { id: string; name: string }
  amount: number
  note?: string
  type: 'advance' | 'supplement' | 'refund' | 'distribution'
}

export interface Participant {
  id: string
  name: string
}

export interface ParticipantStats {
  name: string
  paidExternal: number
  prepaidInternal: number
  prepaidAdvance: number
  prepaidSupplement: number
  prepaidRefund: number
  cost: number
  costBreakdown: Array<{
    title: string
    cost: number
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
 * Calculate statistics for a chata
 */
export function calculateStats(
  participants: Participant[],
  expenses: Expense[],
  prepayments: Prepayment[],
  bankerName: string
): ChataStats {
  // Initialize stats for each participant
  const stats: Record<string, ParticipantStats> = {}

  participants.forEach((p) => {
    stats[p.name] = {
      name: p.name,
      paidExternal: 0,
      prepaidInternal: 0,
      prepaidAdvance: 0,
      prepaidSupplement: 0,
      prepaidRefund: 0,
      cost: 0,
      costBreakdown: [],
      balance: 0,
    }
  })

  // Process expenses
  expenses.forEach((expense) => {
    const payerName = getParticipantName(expense.payer)
    const amount = expense.amount

    // Add to payer's paidExternal
    if (stats[payerName]) {
      stats[payerName].paidExternal += amount
    }

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

    // Distribute cost
    if (totalUnits > 0) {
      Object.entries(weights).forEach(([name, weight]) => {
        if (stats[name]) {
          const cost = (amount / totalUnits) * weight
          stats[name].cost += cost
          stats[name].costBreakdown.push({
            title: expense.title,
            cost: cost,
          })
        }
      })
    }
  })

  // Process prepayments
  prepayments.forEach((prepayment) => {
    const fromName = getParticipantName(prepayment.from)
    const amount = prepayment.amount

    if (stats[fromName]) {
      // Update prepaidInternal
      stats[fromName].prepaidInternal += amount

      // Update banker's prepaidInternal (opposite direction)
      if (stats[bankerName] && fromName !== bankerName) {
        stats[bankerName].prepaidInternal -= amount
      }

      // Categorize prepayment
      if (prepayment.type === 'advance') {
        stats[fromName].prepaidAdvance += amount
      } else if (prepayment.type === 'supplement') {
        stats[fromName].prepaidSupplement += amount
      } else if (prepayment.type === 'refund') {
        stats[fromName].prepaidRefund += Math.abs(amount)
      }
    }
  })

  // Calculate final balances
  Object.values(stats).forEach((stat) => {
    stat.balance = stat.paidExternal + stat.prepaidInternal - stat.cost
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
  }
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
