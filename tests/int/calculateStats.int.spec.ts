import { describe, it, expect } from 'vitest'
import {
  calculateStats,
  normalizePayerRef,
  transformJointAccount,
  type Expense,
  type Prepayment,
  type Participant,
  type JointAccountInfo,
  type ChataStats,
} from '@/utils/calculateStats'

const participants: Participant[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
  { id: '3', name: 'Cedric' },
  { id: '4', name: 'Dana' },
]

const jaAliceBob: JointAccountInfo = {
  id: 10,
  name: 'Alice + Bob',
  memberNames: ['Alice', 'Bob'],
}

const jaPayer = { id: 10, name: 'Alice + Bob', relationTo: 'joint-accounts' as const }

function expense(overrides: Partial<Expense> & Pick<Expense, 'amount' | 'payer'>): Expense {
  return {
    id: Math.random().toString(36),
    title: 'Expense',
    splitType: 'equal',
    ...overrides,
  } as Expense
}

/** The zero-sum invariant: balances across all participants must sum to 0
 * whenever every expense is fully split among known participants. */
function expectZeroSum(stats: ChataStats) {
  const sum = Object.values(stats.participants).reduce((acc, s) => acc + s.balance, 0)
  expect(sum).toBeCloseTo(0, 6)
}

describe('calculateStats without joint accounts (regression)', () => {
  it('produces identical results whether jointAccounts is omitted or empty', () => {
    const expenses: Expense[] = [
      expense({ title: 'Groceries', amount: 1200, payer: { id: '1', name: 'Alice' } }),
      expense({
        title: 'Fuel',
        amount: 400,
        payer: { id: '3', name: 'Cedric' },
        splitType: 'weighted',
        weights: [
          { participant: { id: '1', name: 'Alice' }, weight: 1 },
          { participant: { id: '2', name: 'Bob' }, weight: 1 },
        ],
      }),
    ]
    const prepayments: Prepayment[] = [
      { id: 'p1', from: { id: '4', name: 'Dana' }, amount: 500, type: 'advance' },
    ]

    const legacy = calculateStats(participants, expenses, prepayments, 'Cedric')
    const withParam = calculateStats(participants, expenses, prepayments, 'Cedric', [])

    expect(withParam).toEqual(legacy)

    // Hand-computed expectations
    expect(legacy.participants['Alice'].paidExternal).toBe(1200)
    expect(legacy.participants['Alice'].cost).toBeCloseTo(300 + 200)
    expect(legacy.participants['Alice'].balance).toBeCloseTo(1200 - 500)
    expect(legacy.participants['Dana'].balance).toBeCloseTo(500 - 300)
    // Banker: paid 400, cost 300, collected 500
    expect(legacy.participants['Cedric'].balance).toBeCloseTo(400 - 300 - 500)
    expectZeroSum(legacy)
  })

  it('still skips the banker own prepayments', () => {
    const prepayments: Prepayment[] = [
      { id: 'p1', from: { id: '3', name: 'Cedric' }, amount: 999, type: 'advance' },
    ]
    const stats = calculateStats(participants, [], prepayments, 'Cedric', [])
    expect(stats.participants['Cedric'].prepaidInternal).toBe(0)
    expect(stats.participants['Cedric'].balance).toBe(0)
    expectZeroSum(stats)
  })
})

describe('joint account as expense payer (equal-split attribution)', () => {
  it('attributes a joint-account payment equally to the members', () => {
    // PRD §4.2 example: dinner 900, weighted Alice 2 / Bob 1 / Cedric 1
    const expenses: Expense[] = [
      expense({
        title: 'Dinner',
        amount: 900,
        payer: jaPayer,
        splitType: 'weighted',
        weights: [
          { participant: { id: '1', name: 'Alice' }, weight: 2 },
          { participant: { id: '2', name: 'Bob' }, weight: 1 },
          { participant: { id: '3', name: 'Cedric' }, weight: 1 },
        ],
      }),
    ]
    const stats = calculateStats(
      participants.slice(0, 3),
      expenses,
      [],
      'Cedric',
      [jaAliceBob]
    )
    // Equal split: 450 credited to each member
    expect(stats.participants['Alice'].paidExternal).toBeCloseTo(450)
    expect(stats.participants['Bob'].paidExternal).toBeCloseTo(450)
    expect(stats.participants['Cedric'].paidExternal).toBe(0)
    // Costs stay per person from weights
    expect(stats.participants['Alice'].cost).toBeCloseTo(450)
    expect(stats.participants['Bob'].cost).toBeCloseTo(225)
    // Balances: Alice 0, Bob +225, Cedric -225
    expect(stats.participants['Alice'].balance).toBeCloseTo(0)
    expect(stats.participants['Bob'].balance).toBeCloseTo(225)
    expect(stats.participants['Cedric'].balance).toBeCloseTo(-225)
    expectZeroSum(stats)
    // Settlement is per person: Bob is the creditor, the JA never appears.
    // Cedric (the banker here) is listed as debtor — matching existing
    // behavior where the frontend filters the banker out of these lists.
    expect(stats.creditors).toEqual([{ name: 'Bob', amount: expect.closeTo(225, 6) }])
    expect(stats.debtors).toEqual([{ name: 'Cedric', amount: expect.closeTo(225, 6) }])
  })

  it('handles equal-split expenses and keeps every member one head', () => {
    // PRD §4.5: Alice (banker) + Bob joint account, Cedric solo
    const trio = participants.slice(0, 3)
    const expenses: Expense[] = [
      expense({ title: 'Accommodation', amount: 3000, payer: jaPayer }),
      expense({
        title: 'Dinner',
        amount: 600,
        payer: { id: '3', name: 'Cedric' },
      }),
    ]
    const prepayments: Prepayment[] = [
      { id: 'p1', from: { id: '3', name: 'Cedric' }, amount: 800, type: 'advance' },
    ]
    const stats = calculateStats(trio, expenses, prepayments, 'Alice', [jaAliceBob])

    // Equal split counts each member individually: 3000/3 + 600/3 = 1200 cost each
    expect(stats.participants['Alice'].cost).toBeCloseTo(1200)
    // JA payment credited 1500 + 1500
    expect(stats.participants['Alice'].paidExternal).toBeCloseTo(1500)
    expect(stats.participants['Bob'].paidExternal).toBeCloseTo(1500)
    // Balances from the PRD worked example
    expect(stats.participants['Alice'].balance).toBeCloseTo(1500 - 800 - 1200) // -500
    expect(stats.participants['Bob'].balance).toBeCloseTo(1500 - 1200) // +300
    expect(stats.participants['Cedric'].balance).toBeCloseTo(600 + 800 - 1200) // +200
    expectZeroSum(stats)
  })

  it('attributes planned joint-account expenses to plannedPaidExternal', () => {
    const stats = calculateStats(
      participants.slice(0, 3),
      [expense({ title: 'Planned', amount: 300, payer: jaPayer, isPlanned: true })],
      [],
      'Cedric',
      [jaAliceBob]
    )
    expect(stats.participants['Alice'].plannedPaidExternal).toBeCloseTo(150)
    expect(stats.participants['Bob'].plannedPaidExternal).toBeCloseTo(150)
    expect(stats.participants['Alice'].paidExternal).toBe(0)
    expectZeroSum(stats)
  })

  it('handles negative (refund) expenses paid by a joint account', () => {
    const stats = calculateStats(
      participants.slice(0, 3),
      [expense({ title: 'Refund', amount: -300, payer: jaPayer })],
      [],
      'Cedric',
      [jaAliceBob]
    )
    expect(stats.participants['Alice'].paidExternal).toBeCloseTo(-150)
    expect(stats.participants['Bob'].paidExternal).toBeCloseTo(-150)
    // Everyone's cost share is -100
    expect(stats.participants['Cedric'].cost).toBeCloseTo(-100)
    expectZeroSum(stats)
  })
})

describe('joint account as prepayment sender', () => {
  it('splits a joint-account prepayment equally among members', () => {
    const stats = calculateStats(
      participants.slice(0, 3),
      [],
      [{ id: 'p1', from: jaPayer, amount: 1000, type: 'advance' }],
      'Cedric',
      [jaAliceBob]
    )
    expect(stats.participants['Alice'].prepaidInternal).toBeCloseTo(500)
    expect(stats.participants['Alice'].prepaidAdvance).toBeCloseTo(500)
    expect(stats.participants['Bob'].prepaidInternal).toBeCloseTo(500)
    // Banker's side: collected 1000 total
    expect(stats.participants['Cedric'].prepaidInternal).toBeCloseTo(-1000)
    expectZeroSum(stats)
  })

  it('skips the banker member share when the banker is in the joint account', () => {
    // Alice is the banker AND a member of the joint account: her share of
    // the prepayment is pot-internal; only Bob's share counts
    const stats = calculateStats(
      participants.slice(0, 3),
      [],
      [{ id: 'p1', from: jaPayer, amount: 1000, type: 'advance' }],
      'Alice',
      [jaAliceBob]
    )
    expect(stats.participants['Bob'].prepaidInternal).toBeCloseTo(500)
    // Banker receives only Bob's 500 share (her own 500 is skipped)
    expect(stats.participants['Alice'].prepaidInternal).toBeCloseTo(-500)
    expectZeroSum(stats)
  })
})

describe('normalizePayerRef / transformJointAccount', () => {
  const participantMap = new Map([
    ['1', 'Alice'],
    ['2', 'Bob'],
  ])
  const jaMap = new Map<string, JointAccountInfo>([['10', jaAliceBob]])

  it('resolves bare IDs (legacy monomorphic depth 0)', () => {
    expect(normalizePayerRef(1, participantMap, jaMap)).toEqual({
      id: 1,
      name: 'Alice',
      relationTo: 'participants',
    })
  })

  it('resolves polymorphic participant refs with ID value', () => {
    expect(
      normalizePayerRef({ relationTo: 'participants', value: 2 }, participantMap, jaMap)
    ).toEqual({ id: 2, name: 'Bob', relationTo: 'participants' })
  })

  it('resolves polymorphic joint-account refs with ID and doc values', () => {
    expect(
      normalizePayerRef({ relationTo: 'joint-accounts', value: 10 }, participantMap, jaMap)
    ).toEqual({ id: 10, name: 'Alice + Bob', relationTo: 'joint-accounts' })
    expect(
      normalizePayerRef(
        { relationTo: 'joint-accounts', value: { id: 10, name: 'Alice + Bob' } },
        participantMap,
        jaMap
      )
    ).toEqual({ id: 10, name: 'Alice + Bob', relationTo: 'joint-accounts' })
  })

  it('maps member IDs to names at depth 0', () => {
    expect(
      transformJointAccount({ id: 10, name: 'Alice + Bob', members: [1, 2] }, participantMap)
    ).toEqual(jaAliceBob)
  })

  it('reads member names from populated docs at depth 1', () => {
    expect(
      transformJointAccount({
        id: 10,
        name: 'Alice + Bob',
        members: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      })
    ).toEqual(jaAliceBob)
  })
})
