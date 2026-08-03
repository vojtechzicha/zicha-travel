import { describe, it, expect } from 'vitest'
import {
  anonymousViewer,
  canSwitchParticipant,
  participantHasAccount,
  selectableParticipants,
  type FinanceViewer,
} from '@/lib/financeAccess'

// Participants of one chata: two with a linked user account, two without
const alice = { id: 1, account: 10 } // linked to user 10
const bob = { id: 2, account: { id: 20 } } // linked (populated shape)
const cedric = { id: 3, account: null } // no account
const dana = { id: 4 } // no account field at all
const all = [alice, bob, cedric, dana]

const viewer = (overrides: Partial<FinanceViewer>): FinanceViewer => ({
  ...anonymousViewer,
  ...overrides,
})

describe('participantHasAccount', () => {
  it('detects id and populated relationship shapes', () => {
    expect(participantHasAccount(alice)).toBe(true)
    expect(participantHasAccount(bob)).toBe(true)
    expect(participantHasAccount(cedric)).toBe(false)
    expect(participantHasAccount(dana)).toBe(false)
  })
})

describe('selectableParticipants', () => {
  it('anonymous visitors only see participants without an account', () => {
    expect(selectableParticipants(anonymousViewer, all)).toEqual([cedric, dana])
  })

  it('a linked user sees ONLY their own participant', () => {
    const v = viewer({ authenticated: true, linkedParticipantId: alice.id })
    expect(selectableParticipants(v, all)).toEqual([alice])
  })

  it('an admin of the chata sees everyone', () => {
    const v = viewer({ authenticated: true, canViewAll: true })
    expect(selectableParticipants(v, all)).toEqual(all)
  })

  it('an admin who is also linked still sees everyone (selector defaults separately)', () => {
    const v = viewer({ authenticated: true, canViewAll: true, linkedParticipantId: alice.id })
    expect(selectableParticipants(v, all)).toEqual(all)
  })

  it('a signed-in user with no participant here falls back to the anonymous set', () => {
    const v = viewer({ authenticated: true, linkedParticipantId: null })
    expect(selectableParticipants(v, all)).toEqual([cedric, dana])
  })

  it('a stale linked id (participant deleted) falls back to the anonymous set', () => {
    const v = viewer({ authenticated: true, linkedParticipantId: 999 })
    expect(selectableParticipants(v, all)).toEqual([cedric, dana])
  })

  it('returns an empty list when every participant has an account', () => {
    expect(selectableParticipants(anonymousViewer, [alice, bob])).toEqual([])
  })
})

describe('canSwitchParticipant', () => {
  it('linked users cannot switch, admins can', () => {
    expect(
      canSwitchParticipant(viewer({ authenticated: true, linkedParticipantId: alice.id }), all),
    ).toBe(false)
    expect(canSwitchParticipant(viewer({ authenticated: true, canViewAll: true }), all)).toBe(true)
  })

  it('anonymous visitors can switch only while 2+ accountless participants exist', () => {
    expect(canSwitchParticipant(anonymousViewer, all)).toBe(true)
    expect(canSwitchParticipant(anonymousViewer, [alice, bob, cedric])).toBe(false)
  })
})
