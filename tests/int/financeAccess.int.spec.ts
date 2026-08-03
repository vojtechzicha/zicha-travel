import { describe, it, expect } from 'vitest'
import {
  anonymousViewer,
  canSwitchParticipant,
  maskEmail,
  selectableParticipants,
  type FinanceViewer,
  type LockedParticipant,
} from '@/lib/financeAccess'

// Participants of one chata. Alice's and Bob's accounts are ACTIVE (logged
// in at least once) → locked for anonymous visitors. Cedric has an account
// that never logged in (NOT locked), Dana has no account at all.
const alice = { id: 1 }
const bob = { id: 2 }
const cedric = { id: 3 }
const dana = { id: 4 }
const all = [alice, bob, cedric, dana]
const locked: LockedParticipant[] = [
  { id: alice.id, maskedEmail: 'a***@e***.com' },
  { id: bob.id, maskedEmail: 'b***@e***.com' },
]

const viewer = (overrides: Partial<FinanceViewer>): FinanceViewer => ({
  ...anonymousViewer,
  ...overrides,
})

describe('selectableParticipants', () => {
  it('anonymous visitors see everyone except locked (active-account) participants', () => {
    expect(selectableParticipants(anonymousViewer, all, locked)).toEqual([cedric, dana])
  })

  it('an inactive account (never logged in) hides nothing', () => {
    expect(selectableParticipants(anonymousViewer, all, [])).toEqual(all)
  })

  it('a linked user sees ONLY their own participants', () => {
    const v = viewer({ authenticated: true, linkedParticipantIds: [alice.id] })
    expect(selectableParticipants(v, all, locked)).toEqual([alice])
  })

  it('one user may own several participants — even in the same chata', () => {
    const v = viewer({ authenticated: true, linkedParticipantIds: [alice.id, cedric.id] })
    expect(selectableParticipants(v, all, locked)).toEqual([alice, cedric])
  })

  it('an admin of the chata sees everyone', () => {
    const v = viewer({ authenticated: true, canViewAll: true, linkedParticipantIds: [alice.id] })
    expect(selectableParticipants(v, all, locked)).toEqual(all)
  })

  it('a signed-in user with no participant here falls back to the anonymous set', () => {
    const v = viewer({ authenticated: true, linkedParticipantIds: [] })
    expect(selectableParticipants(v, all, locked)).toEqual([cedric, dana])
  })

  it('a stale linked id (participant deleted) falls back to the anonymous set', () => {
    const v = viewer({ authenticated: true, linkedParticipantIds: [999] })
    expect(selectableParticipants(v, all, locked)).toEqual([cedric, dana])
  })

  it('returns an empty list when every participant is locked', () => {
    expect(
      selectableParticipants(anonymousViewer, [alice, bob], locked),
    ).toEqual([])
  })
})

describe('canSwitchParticipant', () => {
  it('single-participant users cannot switch; multi-participant users and admins can', () => {
    expect(
      canSwitchParticipant(viewer({ authenticated: true, linkedParticipantIds: [alice.id] }), all, locked),
    ).toBe(false)
    expect(
      canSwitchParticipant(
        viewer({ authenticated: true, linkedParticipantIds: [alice.id, cedric.id] }),
        all,
        locked,
      ),
    ).toBe(true)
    expect(canSwitchParticipant(viewer({ authenticated: true, canViewAll: true }), all, locked)).toBe(
      true,
    )
  })

  it('anonymous visitors can switch only while 2+ unlocked participants exist', () => {
    expect(canSwitchParticipant(anonymousViewer, all, locked)).toBe(true)
    expect(canSwitchParticipant(anonymousViewer, [alice, bob, cedric], locked)).toBe(false)
  })
})

describe('maskEmail', () => {
  it('masks dotted locals and domains, keeping first letters and the TLD', () => {
    expect(maskEmail('daniel.novak@gmail.com')).toBe('d***.n***@g***.com')
    expect(maskEmail('katka@seznam.cz')).toBe('k***@s***.cz')
    expect(maskEmail('a.b.c@mail.co.uk')).toBe('a***.b***.c***@m***.c***.uk')
  })

  it('degrades safely on malformed input', () => {
    expect(maskEmail('no-at-sign')).toBe('***')
    expect(maskEmail('@nolocal.com')).toBe('***')
    expect(maskEmail('user@localhost')).toBe('u***@l***')
  })
})
