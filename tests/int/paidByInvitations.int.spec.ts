import { describe, it, expect } from 'vitest'
import { buildAutoInvitations, refId } from '@/utils/paidByInvitations'
import { calculateStats, type Expense, type Participant } from '@/utils/calculateStats'

describe('buildAutoInvitations (standing "paid by" rows)', () => {
  const pairs = [
    { guest: 2, host: 1 }, // kid 2 paid by parent 1
    { guest: 4, host: 3 }, // kid 4 paid by parent 3
  ]

  it('adds an auto row per covered participant on an equal split', () => {
    const rows = buildAutoInvitations({ splitType: 'equal' }, pairs)
    expect(rows).toEqual([
      { host: 1, guest: 2, auto: true },
      { host: 3, guest: 4, auto: true },
    ])
  })

  it('only adds rows for guests with a positive weight on a weighted split', () => {
    const rows = buildAutoInvitations(
      {
        splitType: 'weighted',
        weights: [
          { participant: 1, weight: 1 },
          { participant: 2, weight: 1 },
          { participant: 4, weight: 0 },
        ],
      },
      pairs
    )
    expect(rows).toEqual([{ host: 1, guest: 2, auto: true }])
  })

  it('never overrides an existing (manual or auto) invitation for the guest', () => {
    const rows = buildAutoInvitations(
      {
        splitType: 'equal',
        invitations: [{ host: 3, guest: 2 }], // one-off: 3 treats the kid this time
      },
      pairs
    )
    expect(rows).toEqual([{ host: 3, guest: 4, auto: true }])
  })

  it('ignores self-pairs', () => {
    const rows = buildAutoInvitations({ splitType: 'equal' }, [{ guest: 1, host: 1 }])
    expect(rows).toEqual([])
  })

  it('handles populated weight refs (objects with id)', () => {
    const rows = buildAutoInvitations(
      {
        splitType: 'weighted',
        weights: [{ participant: { id: 2 }, weight: 2 }],
      },
      pairs
    )
    expect(rows).toEqual([{ host: 1, guest: 2, auto: true }])
  })
})

describe('refId', () => {
  it('normalizes bare ids and populated docs, keeps null', () => {
    expect(refId(5)).toBe('5')
    expect(refId('5')).toBe('5')
    expect(refId({ id: 5 })).toBe('5')
    expect(refId(null)).toBeNull()
    expect(refId(undefined)).toBeNull()
  })
})

describe('calculateStats with auto (standing) invitations', () => {
  const participants: Participant[] = [
    { id: '1', name: 'Parent' },
    { id: '2', name: 'Kid' },
    { id: '3', name: 'Other' },
  ]

  it('transfers identically to a manual invitation and flags the breakdown', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        title: 'Dinner',
        amount: 300,
        payer: { id: '3', name: 'Other' },
        splitType: 'equal',
        invitations: [{ host: { id: '1', name: 'Parent' }, guest: { id: '2', name: 'Kid' }, auto: true }],
      },
    ]
    const stats = calculateStats(participants, expenses, [], 'Other')

    expect(stats.participants['Parent'].cost).toBeCloseTo(200)
    expect(stats.participants['Kid'].cost).toBe(0)
    expect(stats.participants['Kid'].costBreakdown[0]).toMatchObject({
      cost: 0,
      invitedBy: 'Parent',
      auto: true,
    })
    expect(
      stats.participants['Parent'].costBreakdown.find((e) => e.invitedGuest === 'Kid')
    ).toMatchObject({ auto: true })
    const sum = Object.values(stats.participants).reduce((a, s) => a + s.balance, 0)
    expect(sum).toBeCloseTo(0, 6)
  })

  it('keeps auto false/absent for one-off invitations', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        title: 'Dinner',
        amount: 300,
        payer: { id: '3', name: 'Other' },
        splitType: 'equal',
        invitations: [{ host: { id: '1', name: 'Parent' }, guest: { id: '2', name: 'Kid' } }],
      },
    ]
    const stats = calculateStats(participants, expenses, [], 'Other')
    expect(stats.participants['Kid'].costBreakdown[0]).toMatchObject({
      invitedBy: 'Parent',
      auto: false,
    })
  })
})
