import { describe, it, expect } from 'vitest'
import {
  bankerCombineHints,
  buildPrivateLayer,
  canViewPrivateExpense,
  nettingHints,
  payerParticipantId,
  privateDebtSignature,
  privateExpenseMembers,
  privateExpenseProblem,
  privateShare,
  visiblePrivatePayerIds,
  weightsAreAmounts,
  type PrivateExpenseLike,
} from '@/lib/privateExpenses'

// Martin (1) pays a 2 400 Kč gift for Katka; Tereza (2) and Ondra (3) split
// it with him. Katka (4) and Vojta (5) must never learn about it.
const gift = (overrides: Partial<PrivateExpenseLike> = {}): PrivateExpenseLike => ({
  id: 100,
  title: 'Dárek pro Katku',
  amount: 2400,
  payer: { relationTo: 'participants', value: 1 },
  splitType: 'weighted',
  weights: [
    { participant: 1, weight: 1 },
    { participant: 2, weight: 1 },
    { participant: 3, weight: 1 },
  ],
  isPrivate: true,
  ...overrides,
})

describe('payerParticipantId', () => {
  it('reads the wrapper, populated docs and bare ids', () => {
    expect(payerParticipantId({ relationTo: 'participants', value: 7 })).toBe('7')
    expect(payerParticipantId({ relationTo: 'participants', value: { id: 7 } })).toBe('7')
    expect(payerParticipantId(7)).toBe('7')
    expect(payerParticipantId({ id: 7 })).toBe('7')
  })
  it('refuses joint accounts and missing payers', () => {
    expect(payerParticipantId({ relationTo: 'joint-accounts', value: 7 })).toBeNull()
    expect(payerParticipantId(null)).toBeNull()
    expect(payerParticipantId(undefined)).toBeNull()
  })
})

describe('privateExpenseMembers', () => {
  it('is the payer plus the split, deduplicated', () => {
    expect(privateExpenseMembers(gift())).toEqual(['1', '2', '3'])
  })
  it('includes a payer who is not in the weights', () => {
    const members = privateExpenseMembers(
      gift({ weights: [{ participant: 2, weight: 1 }] }),
    )
    expect(members.sort()).toEqual(['1', '2'])
  })
  it('skips null participant refs (deleted members)', () => {
    const members = privateExpenseMembers(
      gift({
        weights: [
          { participant: null as unknown as number, weight: 1 },
          { participant: 2, weight: 1 },
        ],
      }),
    )
    expect(members.sort()).toEqual(['1', '2'])
  })
})

describe('privateShare', () => {
  it('splits proportionally', () => {
    expect(privateShare(gift(), 2)).toBe(800)
    expect(privateShare(gift(), 1)).toBe(800)
  })
  it('is zero for non-members and zero-weight members', () => {
    expect(privateShare(gift(), 4)).toBe(0)
    expect(
      privateShare(
        gift({
          weights: [
            { participant: 2, weight: 0 },
            { participant: 3, weight: 1 },
          ],
        }),
        2,
      ),
    ).toBe(0)
  })
  it('stays proportional even when weights read as Kč amounts', () => {
    // 1000 + 1400 = 2400 = the amount, so the UI labels them as Kč — but
    // the debt is still amount * weight / total, which equals the weight
    const e = gift({
      weights: [
        { participant: 2, weight: 1000 },
        { participant: 3, weight: 1400 },
      ],
    })
    expect(weightsAreAmounts(e)).toBe(true)
    expect(privateShare(e, 2)).toBeCloseTo(1000, 6)
    expect(privateShare(e, 3)).toBeCloseTo(1400, 6)
  })
  it('handles a payer outside the weights (others owe the full amount)', () => {
    const e = gift({
      weights: [
        { participant: 2, weight: 1 },
        { participant: 3, weight: 1 },
      ],
    })
    expect(privateShare(e, 1)).toBe(0)
    expect(privateShare(e, 2)).toBe(1200)
  })
})

describe('buildPrivateLayer', () => {
  it('builds debtor rows with settled flags', () => {
    const layer = buildPrivateLayer(
      [gift({ privateSettlements: [{ participant: 3, settledAt: '2026-03-13T10:00:00.000Z' }] })],
      2,
    )
    expect(layer.paid).toEqual([])
    expect(layer.debts).toHaveLength(1)
    expect(layer.debts[0]).toMatchObject({
      expenseId: '100',
      amount: 800,
      payerParticipantId: '1',
      settled: false,
      isPlanned: false,
    })
    const ondra = buildPrivateLayer(
      [gift({ privateSettlements: [{ participant: 3, settledAt: '2026-03-13T10:00:00.000Z' }] })],
      3,
    )
    expect(ondra.debts[0].settled).toBe(true)
  })

  it('builds the payer view: net and per-member states, own share excluded', () => {
    const layer = buildPrivateLayer(
      [gift({ privateSettlements: [{ participant: 3, settledAt: '2026-03-13T10:00:00.000Z' }] })],
      1,
    )
    expect(layer.debts).toEqual([])
    expect(layer.paid).toHaveLength(1)
    expect(layer.paid[0]).toMatchObject({ paidTotal: 2400, ownShare: 800, net: 1600 })
    expect(layer.paid[0].members).toEqual([
      { participantId: '2', amount: 800, settled: false },
      { participantId: '3', amount: 800, settled: true },
    ])
  })

  it('ignores public expenses and zero shares', () => {
    const layer = buildPrivateLayer(
      [
        gift({ isPrivate: false }),
        gift({
          id: 101,
          weights: [
            { participant: 2, weight: 0 },
            { participant: 3, weight: 1 },
          ],
        }),
      ],
      2,
    )
    expect(layer.debts).toEqual([])
    expect(layer.paid).toEqual([])
  })

  it('marks planned expenses so the UI keeps them informational', () => {
    const layer = buildPrivateLayer([gift({ isPlanned: true })], 2)
    expect(layer.debts[0].isPlanned).toBe(true)
  })
})

describe('nettingHints', () => {
  // Tereza (2) owes Martin (1) 800 from the gift; Martin owes Tereza 500
  // from her own private expense
  const back = (overrides: Partial<PrivateExpenseLike> = {}): PrivateExpenseLike =>
    gift({
      id: 200,
      title: 'Překvapení pro Ondru',
      amount: 1000,
      payer: { relationTo: 'participants', value: 2 },
      weights: [
        { participant: 1, weight: 1 },
        { participant: 2, weight: 1 },
      ],
      ...overrides,
    })

  it('aggregates a mutual pair and points the difference the right way', () => {
    const hints = nettingHints([gift(), back()], 2)
    expect(hints).toHaveLength(1)
    expect(hints[0]).toMatchObject({
      counterpartId: '1',
      iOwe: 800,
      theyOwe: 500,
      difference: 300,
      direction: 'send',
    })
    expect(hints[0].items).toEqual(
      expect.arrayContaining([
        { expenseId: '100', participantId: '2' },
        { expenseId: '200', participantId: '1' },
      ]),
    )
    // the same pair seen from Martin's side
    const martinHints = nettingHints([gift(), back()], 1)
    expect(martinHints[0]).toMatchObject({ counterpartId: '2', direction: 'receive' })
  })

  it('aggregates several expenses in both directions', () => {
    const secondGift = gift({ id: 102, amount: 900 })
    const hints = nettingHints([gift(), secondGift, back()], 2)
    expect(hints).toHaveLength(1)
    expect(hints[0].iOwe).toBe(1100)
    expect(hints[0].items).toHaveLength(3)
  })

  it('skips settled, planned and one-way debts', () => {
    expect(nettingHints([gift()], 2)).toEqual([])
    expect(
      nettingHints(
        [gift({ privateSettlements: [{ participant: 2, settledAt: 'x' }] }), back()],
        2,
      ),
    ).toEqual([])
    expect(nettingHints([gift(), back({ isPlanned: true })], 2)).toEqual([])
  })

  it('calls a near-equal pair even (1 Kč tolerance)', () => {
    const hints = nettingHints([gift({ amount: 1500 }), back({ amount: 1000 })], 2)
    // 500 each way
    expect(hints[0].direction).toBe('even')
  })
})

describe('bankerCombineHints', () => {
  const debts = buildPrivateLayer([gift()], 2).debts
  it('offers the top-up combination when the private payee is the banker', () => {
    const hints = bankerCombineHints({
      viewerParticipantId: 2,
      bankerParticipantId: 1,
      debts,
      potDebtorIds: [2],
      potCreditorIds: [],
    })
    expect(hints).toEqual([{ counterpartId: '1', potTransfer: 'topup' }])
  })
  it('offers the refund combination when the banker owes privately', () => {
    const bankerDebts = buildPrivateLayer(
      [gift({ payer: { relationTo: 'participants', value: 3 }, weights: [{ participant: 2, weight: 1 }] })],
      2,
    ).debts
    const hints = bankerCombineHints({
      viewerParticipantId: 2,
      bankerParticipantId: 2,
      debts: bankerDebts,
      potDebtorIds: [],
      potCreditorIds: [3],
    })
    expect(hints).toEqual([{ counterpartId: '3', potTransfer: 'refund' }])
  })
  it('stays silent otherwise', () => {
    expect(
      bankerCombineHints({
        viewerParticipantId: 2,
        bankerParticipantId: 4,
        debts,
        potDebtorIds: [2],
        potCreditorIds: [1],
      }),
    ).toEqual([])
    expect(
      bankerCombineHints({
        viewerParticipantId: 2,
        bankerParticipantId: null,
        debts,
        potDebtorIds: [2],
        potCreditorIds: [1],
      }),
    ).toEqual([])
  })
})

describe('canViewPrivateExpense', () => {
  const base = {
    isSuperadminUser: false,
    userId: 50 as number | null,
    payerAccountIds: [] as string[],
    linkedParticipantIds: [] as number[],
    expense: gift(),
  }
  it('lets a public expense through untouched', () => {
    expect(canViewPrivateExpense({ ...base, expense: gift({ isPrivate: false }) })).toBe(true)
  })
  it('superadmin sees it', () => {
    expect(canViewPrivateExpense({ ...base, isSuperadminUser: true })).toBe(true)
  })
  it("the payer's account sees it", () => {
    expect(canViewPrivateExpense({ ...base, payerAccountIds: ['50'] })).toBe(true)
  })
  it('a linked member sees it', () => {
    expect(canViewPrivateExpense({ ...base, linkedParticipantIds: [3] })).toBe(true)
  })
  it('anonymous, non-members, and the surprise target see nothing', () => {
    expect(canViewPrivateExpense({ ...base, userId: null })).toBe(false)
    expect(canViewPrivateExpense(base)).toBe(false)
    // Katka (4) is in the chata but not in the circle
    expect(canViewPrivateExpense({ ...base, linkedParticipantIds: [4] })).toBe(false)
  })
})

describe('visiblePrivatePayerIds', () => {
  it("collects payers of private expenses the viewer's participants split", () => {
    expect(visiblePrivatePayerIds([gift()], [2])).toEqual(['1'])
  })
  it('skips the viewer as payer, non-members, and public expenses', () => {
    expect(visiblePrivatePayerIds([gift()], [1])).toEqual([])
    expect(visiblePrivatePayerIds([gift()], [4])).toEqual([])
    expect(visiblePrivatePayerIds([gift({ isPrivate: false })], [2])).toEqual([])
    expect(visiblePrivatePayerIds([gift()], [])).toEqual([])
  })
})

describe('privateExpenseProblem', () => {
  it('accepts the well-formed gift', () => {
    expect(privateExpenseProblem(gift())).toBeNull()
  })
  it('names each violated rule', () => {
    expect(
      privateExpenseProblem(gift({ payer: { relationTo: 'joint-accounts', value: 9 } })),
    ).toBe('payer')
    expect(privateExpenseProblem(gift({ amount: -100 }))).toBe('amount')
    expect(privateExpenseProblem(gift({ amount: 0 }))).toBe('amount')
    expect(privateExpenseProblem(gift({ splitType: 'equal' }))).toBe('split')
    expect(privateExpenseProblem(gift({ weights: [] }))).toBe('weights-empty')
    expect(
      privateExpenseProblem(
        gift({
          weights: [
            { participant: 2, weight: 1 },
            { participant: 2, weight: 2 },
          ],
        }),
      ),
    ).toBe('weights-duplicate')
    expect(
      privateExpenseProblem(gift({ weights: [{ participant: 2, weight: 0 }] })),
    ).toBe('weights-total')
    expect(
      privateExpenseProblem(gift({ invitations: [{ host: 1, guest: 2 }] })),
    ).toBe('invitations')
    expect(privateExpenseProblem(gift({ attachments: [7] }))).toBe('attachments')
  })
})

describe('privateDebtSignature', () => {
  it('is stable across row order and settlement changes', () => {
    const reordered = gift({
      weights: [
        { participant: 3, weight: 1 },
        { participant: 1, weight: 1 },
        { participant: 2, weight: 1 },
      ],
      privateSettlements: [{ participant: 2, settledAt: 'x' }],
    })
    expect(privateDebtSignature(reordered)).toBe(privateDebtSignature(gift()))
  })
  it('changes with amount, payer, weights and planned state', () => {
    const base = privateDebtSignature(gift())
    expect(privateDebtSignature(gift({ amount: 2500 }))).not.toBe(base)
    expect(
      privateDebtSignature(gift({ payer: { relationTo: 'participants', value: 2 } })),
    ).not.toBe(base)
    expect(
      privateDebtSignature(gift({ weights: [{ participant: 2, weight: 2 }] })),
    ).not.toBe(base)
    expect(privateDebtSignature(gift({ isPlanned: true }))).not.toBe(base)
  })
})
