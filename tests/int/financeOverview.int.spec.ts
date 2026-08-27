import { describe, it, expect } from 'vitest'
import { calculateStats, type Expense, type Prepayment } from '@/utils/calculateStats'
import {
  buildExpenseRows,
  overviewOrder,
  prepaymentRow,
  rowSum,
  verdict,
} from '@/lib/financeOverview'

// Fixtures run through the REAL calculateStats so the overview rows are
// checked against the same numbers the app shows.
const participants = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Cedric' },
  { id: '4', name: 'Dana' },
]

const expenses: Expense[] = [
  { id: 10, title: 'Ubytování', amount: 4000, payer: 'Alice', splitType: 'equal' },
  {
    id: 11,
    title: 'Nákup',
    amount: 900,
    payer: 'Bob',
    splitType: 'weighted',
    weights: [
      { participant: 'Bob', weight: 1 },
      { participant: 'Cedric', weight: 1 },
      { participant: 'Dana', weight: 1 },
    ],
    // Dana is Cedric's guest: her share moves to him
    invitations: [{ host: 'Cedric', guest: 'Dana' }],
  },
  { id: 12, title: 'Plánovaný výlet', amount: 500, payer: 'Alice', splitType: 'equal', isPlanned: true },
]

const prepayments: Prepayment[] = [
  { id: 20, from: 'Bob', amount: 1000, type: 'advance' },
  { id: 21, from: 'Cedric', amount: 1000, type: 'advance' },
]

const stats = calculateStats(participants, expenses, prepayments, 'Alice')

describe('overviewOrder', () => {
  it('puts the banker first, everyone else Czech-alphabetical', () => {
    expect(overviewOrder(['Dana', 'Cedric', 'Alice', 'Bob'], 'Cedric')).toEqual([
      'Cedric',
      'Alice',
      'Bob',
      'Dana',
    ])
  })
})

describe('buildExpenseRows', () => {
  const rows = buildExpenseRows(expenses, { '10': 'Alice', '11': 'Bob' }, stats)

  it('emits one row per ACTUAL expense, skipping planned ones', () => {
    expect(rows.map((r) => r.id)).toEqual([10, 11])
    expect(rows[0].payerLabel).toBe('Alice')
  })

  it('leaves no trace of private expenses, even for their members', () => {
    const withPrivate: Expense[] = [
      ...expenses,
      {
        id: 13,
        title: 'Dárek pro Danu',
        amount: 2400,
        payer: 'Bob',
        splitType: 'weighted',
        weights: [
          { participant: 'Bob', weight: 1 },
          { participant: 'Cedric', weight: 1 },
        ],
        isPrivate: true,
      },
    ]
    const privateRows = buildExpenseRows(
      withPrivate,
      { '10': 'Alice', '11': 'Bob', '13': 'Bob' },
      calculateStats(participants, withPrivate, prepayments, 'Alice'),
    )
    expect(privateRows).toEqual(rows)
  })

  it('cells of each row sum to the expense amount (the Σ-kontrola invariant)', () => {
    for (const row of rows) {
      const sum = Object.values(row.cells).reduce((a, c) => a + c.cost, 0)
      expect(sum).toBeCloseTo(row.amount, 6)
    }
  })

  it('equal split covers every participant', () => {
    expect(Object.keys(rows[0].cells).sort()).toEqual(['Alice', 'Bob', 'Cedric', 'Dana'])
    expect(rows[0].cells['Bob'].cost).toBeCloseTo(1000, 6)
  })

  it('weighted split leaves non-participants without a cell', () => {
    expect(rows[1].cells['Alice']).toBeUndefined()
  })

  it('an invitation zeroes the guest cell and merges the share into the host cell', () => {
    const guest = rows[1].cells['Dana']
    const host = rows[1].cells['Cedric']
    expect(guest.cost).toBe(0)
    expect(guest.invitedBy).toBe('Cedric')
    expect(host.cost).toBeCloseTo(600, 6) // own 300 + Dana's 300
    expect(host.invitedGuests).toEqual(['Dana'])
  })
})

describe('prepaymentRow', () => {
  it('returns signed values that sum to zero (banker side is negative)', () => {
    const advances = prepaymentRow('advance', stats)!
    expect(advances['Bob']).toBeCloseTo(1000, 6)
    expect(advances['Alice']).toBeCloseTo(-2000, 6) // banker collected both
    expect(rowSum(advances)).toBeCloseTo(0, 6)
  })

  it('returns null for prepayment kinds nobody used', () => {
    expect(prepaymentRow('refund', stats)).toBeNull()
  })
})

describe('overview totals', () => {
  it('balances across all participants sum to zero', () => {
    const total = Object.values(stats.participants).reduce((a, s) => a + s.balance, 0)
    expect(total).toBeCloseTo(0, 6)
  })

  it('verdict honours the 1 Kč settlement threshold', () => {
    expect(verdict(0.8)).toBe('settled')
    expect(verdict(-0.8)).toBe('settled')
    expect(verdict(1.5)).toBe('get')
    expect(verdict(-1.5)).toBe('owe')
  })
})
