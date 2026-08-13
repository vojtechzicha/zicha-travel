import { describe, it, expect } from 'vitest'
import {
  canDecideExpense,
  canManageExpense,
  isAllowedPayer,
  isCountedExpense,
  linkedParticipantIds,
  needsApproval,
  normalizePayer,
  ownJointAccounts,
  payerAccountIds,
  samePayer,
  type PayerRefLike,
} from '@/lib/expenseAuthoring'

// One chata: Katka's account (user 10) owns Katka + her daughter Anička.
// Tomáš belongs to user 20, Petra has no account. "Auto" is a joint account
// of Katka + Tomáš; "Zichovi" of Tomáš + Petra.
const participants = [
  { id: 1, account: 10 }, // Katka
  { id: 2, account: { id: 10 } }, // Anička (populated ref)
  { id: 3, account: 20 }, // Tomáš
  { id: 4, account: null }, // Petra
]
const jointAccounts = [
  { id: 100, members: [1, 3] }, // Auto (Katka + Tomáš)
  { id: 101, members: [{ id: 3 }, { id: 4 }] }, // Zichovi (Tomáš + Petra)
]

const payer = (
  relationTo: PayerRefLike['relationTo'],
  value: PayerRefLike['value'],
): PayerRefLike => ({ relationTo, value })

describe('linkedParticipantIds', () => {
  it('collects all participants of the user, bare and populated refs alike', () => {
    expect(linkedParticipantIds(10, participants)).toEqual(['1', '2'])
  })

  it('ignores participants without an account', () => {
    expect(linkedParticipantIds(30, participants)).toEqual([])
  })
})

describe('normalizePayer', () => {
  it('accepts the polymorphic { relationTo, value } shape', () => {
    expect(normalizePayer({ relationTo: 'participants', value: 1 })).toEqual({
      relationTo: 'participants',
      value: 1,
    })
  })

  it('rejects everything else', () => {
    expect(normalizePayer(null)).toBeNull()
    expect(normalizePayer(1)).toBeNull()
    expect(normalizePayer({ relationTo: 'users', value: 1 })).toBeNull()
    expect(normalizePayer({ relationTo: 'participants' })).toBeNull()
  })
})

describe('isAllowedPayer', () => {
  const own = linkedParticipantIds(10, participants)

  it('allows the user’s own participants', () => {
    expect(isAllowedPayer(payer('participants', 1), own, jointAccounts)).toBe(true)
    expect(isAllowedPayer(payer('participants', { id: 2 }), own, jointAccounts)).toBe(true)
  })

  it('rejects other people’s participants', () => {
    expect(isAllowedPayer(payer('participants', 3), own, jointAccounts)).toBe(false)
    expect(isAllowedPayer(payer('participants', 4), own, jointAccounts)).toBe(false)
  })

  it('allows a joint account with an own participant among members', () => {
    expect(isAllowedPayer(payer('joint-accounts', 100), own, jointAccounts)).toBe(true)
  })

  it('rejects joint accounts of other people, and unknown ones', () => {
    expect(isAllowedPayer(payer('joint-accounts', 101), own, jointAccounts)).toBe(false)
    expect(isAllowedPayer(payer('joint-accounts', 999), own, jointAccounts)).toBe(false)
  })
})

describe('samePayer', () => {
  it('matches on relationTo + id regardless of ref shape', () => {
    expect(samePayer(payer('participants', 1), payer('participants', { id: 1 }))).toBe(true)
  })

  it('differs across collections and ids', () => {
    expect(samePayer(payer('participants', 1), payer('joint-accounts', 1))).toBe(false)
    expect(samePayer(payer('participants', 1), payer('participants', 2))).toBe(false)
    expect(samePayer(payer('participants', 1), null)).toBe(false)
  })
})

describe('ownJointAccounts', () => {
  it('returns only accounts the user is (via a participant) a member of', () => {
    expect(ownJointAccounts(['1', '2'], jointAccounts).map((ja) => ja.id)).toEqual([100])
    expect(ownJointAccounts(['3'], jointAccounts).map((ja) => ja.id)).toEqual([100, 101])
    expect(ownJointAccounts(['4'], jointAccounts).map((ja) => ja.id)).toEqual([101])
    expect(ownJointAccounts([], jointAccounts)).toEqual([])
  })
})

// ── "výdaj za jiného plátce" ────────────────────────────────────────────

describe('needsApproval', () => {
  it('asks nothing of an admin, whoever the payer is', () => {
    expect(needsApproval({ isAdmin: true, payerIsOwn: false })).toBe(false)
  })

  it('asks nothing when you pay as yourself', () => {
    expect(needsApproval({ isAdmin: false, payerIsOwn: true })).toBe(false)
  })

  it('holds back an expense recorded for somebody else', () => {
    expect(needsApproval({ isAdmin: false, payerIsOwn: false })).toBe(true)
  })
})

describe('payerAccountIds', () => {
  it('gives the participant their own account', () => {
    expect(payerAccountIds(payer('participants', 3), participants, jointAccounts)).toEqual(['20'])
    expect(payerAccountIds(payer('participants', { id: 1 }), participants)).toEqual(['10'])
  })

  it('gives a joint account every member account, deduplicated', () => {
    // Auto = Katka (10) + Tomáš (20)
    expect(payerAccountIds(payer('joint-accounts', 100), participants, jointAccounts)).toEqual([
      '10',
      '20',
    ])
    // Zichovi = Tomáš (20) + Petra (no account)
    expect(payerAccountIds(payer('joint-accounts', 101), participants, jointAccounts)).toEqual([
      '20',
    ])
    expect(
      payerAccountIds(payer('joint-accounts', 102), participants, [
        { id: 102, members: [1, 2] }, // both Katka's
      ]),
    ).toEqual(['10'])
  })

  it('comes back empty when nobody involved has an account', () => {
    expect(payerAccountIds(payer('participants', 4), participants, jointAccounts)).toEqual([])
    expect(payerAccountIds(null, participants, jointAccounts)).toEqual([])
    // a payer that is not in this chata's data at all
    expect(payerAccountIds(payer('joint-accounts', 999), participants, jointAccounts)).toEqual([])
  })
})

describe('canDecideExpense', () => {
  const base = { payerAccountIds: ['10'], bankerAccountId: 20 }

  it('lets the chata admins decide', () => {
    expect(canDecideExpense({ userId: 99, managesChata: true, ...base })).toBe(true)
  })

  it('lets the payer and the banker decide', () => {
    expect(canDecideExpense({ userId: 10, managesChata: false, ...base })).toBe(true)
    expect(canDecideExpense({ userId: 20, managesChata: false, ...base })).toBe(true)
    expect(canDecideExpense({ userId: '10', managesChata: false, ...base })).toBe(true)
  })

  it('lets any member of the paying joint account decide', () => {
    const joint = { payerAccountIds: ['10', '20'], bankerAccountId: null }
    expect(canDecideExpense({ userId: 10, managesChata: false, ...joint })).toBe(true)
    expect(canDecideExpense({ userId: 20, managesChata: false, ...joint })).toBe(true)
    expect(canDecideExpense({ userId: 30, managesChata: false, ...joint })).toBe(false)
  })

  it('turns everybody else away, anonymous visitors included', () => {
    expect(canDecideExpense({ userId: 30, managesChata: false, ...base })).toBe(false)
    expect(canDecideExpense({ userId: null, managesChata: false, ...base })).toBe(false)
  })

  it('does not treat a missing account link as a match', () => {
    expect(
      canDecideExpense({ userId: 10, managesChata: false, payerAccountIds: [], bankerAccountId: null }),
    ).toBe(false)
    expect(
      canDecideExpense({
        userId: 10,
        managesChata: false,
        payerAccountIds: [null, undefined],
        bankerAccountId: null,
      }),
    ).toBe(false)
  })
})

describe('canManageExpense', () => {
  it('covers the author and the payer whose money it was', () => {
    expect(canManageExpense({ userId: 10, authoredById: 10, payerAccountId: 20 })).toBe(true)
    expect(canManageExpense({ userId: 20, authoredById: 10, payerAccountId: 20 })).toBe(true)
  })

  it('excludes anyone else', () => {
    expect(canManageExpense({ userId: 30, authoredById: 10, payerAccountId: 20 })).toBe(false)
    expect(canManageExpense({ userId: null, authoredById: 10, payerAccountId: 10 })).toBe(false)
  })
})

describe('isCountedExpense', () => {
  it('counts approved expenses and legacy rows without a status', () => {
    expect(isCountedExpense('approved')).toBe(true)
    expect(isCountedExpense(null)).toBe(true)
    expect(isCountedExpense(undefined)).toBe(true)
  })

  it('leaves pending and rejected ones out', () => {
    expect(isCountedExpense('pending')).toBe(false)
    expect(isCountedExpense('rejected')).toBe(false)
  })
})
