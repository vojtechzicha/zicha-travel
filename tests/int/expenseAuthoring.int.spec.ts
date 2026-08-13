import { describe, it, expect } from 'vitest'
import {
  approvalForPayer,
  canDecideExpense,
  canManageExpense,
  isAllowedPayer,
  isCountedExpense,
  linkedParticipantIds,
  normalizePayer,
  ownJointAccounts,
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

describe('approvalForPayer', () => {
  it('asks nothing of an admin, whoever the payer is', () => {
    expect(approvalForPayer({ isAdmin: true, payerIsOwn: false, payerHasAccount: false })).toEqual({
      required: false,
    })
  })

  it('asks nothing when you pay as yourself', () => {
    expect(approvalForPayer({ isAdmin: false, payerIsOwn: true, payerHasAccount: true })).toEqual({
      required: false,
    })
  })

  it('lets a payer with an account speak for themselves', () => {
    expect(approvalForPayer({ isAdmin: false, payerIsOwn: false, payerHasAccount: true })).toEqual({
      required: true,
      kind: 'linked',
    })
  })

  it('leaves a payer without an account to the banker', () => {
    expect(approvalForPayer({ isAdmin: false, payerIsOwn: false, payerHasAccount: false })).toEqual({
      required: true,
      kind: 'unlinked',
    })
  })
})

describe('canDecideExpense', () => {
  const base = { payerAccountId: 10, bankerAccountId: 20 }

  it('lets the chata admins decide', () => {
    expect(canDecideExpense({ userId: 99, managesChata: true, ...base })).toBe(true)
  })

  it('lets the payer and the banker decide', () => {
    expect(canDecideExpense({ userId: 10, managesChata: false, ...base })).toBe(true)
    expect(canDecideExpense({ userId: 20, managesChata: false, ...base })).toBe(true)
    expect(canDecideExpense({ userId: '10', managesChata: false, ...base })).toBe(true)
  })

  it('turns everybody else away, anonymous visitors included', () => {
    expect(canDecideExpense({ userId: 30, managesChata: false, ...base })).toBe(false)
    expect(canDecideExpense({ userId: null, managesChata: false, ...base })).toBe(false)
  })

  it('does not treat a missing account link as a match', () => {
    expect(
      canDecideExpense({ userId: 10, managesChata: false, payerAccountId: null, bankerAccountId: null }),
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
