import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  autoApproveReason,
  claimReturnTo,
  isClaimableParticipant,
  signDecideToken,
  verifyDecideToken,
} from '@/lib/claimRequests'

const SECRET = 'test-secret'

describe('isClaimableParticipant', () => {
  it('a participant without any account is claimable', () => {
    expect(isClaimableParticipant({ accountId: null, accountActive: false })).toBe(true)
  })

  it('an admin-created account that never logged in does not block claiming', () => {
    expect(isClaimableParticipant({ accountId: 7, accountActive: false })).toBe(true)
  })

  it('an active account locks the participant', () => {
    expect(isClaimableParticipant({ accountId: 7, accountActive: true })).toBe(false)
  })
})

describe('autoApproveReason', () => {
  const base = {
    requesterManagesChata: false,
    targetHasAccount: false,
    requesterLinkedChataIds: [] as number[],
    targetChataId: 10,
  }

  it('a brand-new face always waits for an admin', () => {
    expect(autoApproveReason(base)).toBeNull()
  })

  it('a linked participant in ANOTHER chata auto-approves ("známá tvář")', () => {
    expect(autoApproveReason({ ...base, requesterLinkedChataIds: [3] })).toBe('known-face')
  })

  it('a linked participant only in the SAME chata still waits for an admin', () => {
    // parent claiming their child: known here, but same-chata links must
    // not let anyone grab other participants of their own chata unchecked
    expect(autoApproveReason({ ...base, requesterLinkedChataIds: [10] })).toBeNull()
  })

  it('mixed links: any other-chata link is enough', () => {
    expect(autoApproveReason({ ...base, requesterLinkedChataIds: [10, 4] })).toBe('known-face')
  })

  it('string/number id mismatches do not defeat the same-chata rule', () => {
    expect(autoApproveReason({ ...base, requesterLinkedChataIds: ['10'], targetChataId: 10 })).toBeNull()
  })

  it('an existing (inactive) account link always forces admin approval', () => {
    // never silently overwrite an admin-set link, however known the face is
    expect(
      autoApproveReason({ ...base, targetHasAccount: true, requesterLinkedChataIds: [3] })
    ).toBeNull()
  })

  it('a chata admin approves themselves', () => {
    expect(autoApproveReason({ ...base, requesterManagesChata: true })).toBe('chata-admin')
  })

  it('the admin shortcut wins even over an existing account link', () => {
    // the admin could relink in the panel anyway
    expect(
      autoApproveReason({ ...base, requesterManagesChata: true, targetHasAccount: true })
    ).toBe('chata-admin')
  })
})

describe('decide tokens', () => {
  it('round-trips claim and admin ids', () => {
    const token = signDecideToken({ claimId: 42, adminId: 7 }, SECRET)
    expect(verifyDecideToken(token, SECRET)).toEqual({ ok: true, claimId: 42, adminId: 7 })
  })

  it('rejects a token signed with a different secret', () => {
    const token = signDecideToken({ claimId: 42, adminId: 7 }, 'other-secret')
    expect(verifyDecideToken(token, SECRET)).toEqual({ ok: false, code: 'invalid' })
  })

  it('rejects garbage', () => {
    expect(verifyDecideToken('not-a-token', SECRET)).toEqual({ ok: false, code: 'invalid' })
  })

  it('rejects other-purpose tokens signed with the same secret (e.g. session JWTs)', () => {
    const sessionLike = jwt.sign({ id: 7, collection: 'users' }, SECRET)
    expect(verifyDecideToken(sessionLike, SECRET)).toEqual({ ok: false, code: 'invalid' })
    const wrongPurpose = jwt.sign({ claimId: 42, adminId: 7, purpose: 'other' }, SECRET)
    expect(verifyDecideToken(wrongPurpose, SECRET)).toEqual({ ok: false, code: 'invalid' })
  })

  it('reports expiry distinctly', () => {
    const expired = jwt.sign({ claimId: 1, adminId: 2, purpose: 'claim-decide' }, SECRET, {
      expiresIn: '-1s',
    })
    expect(verifyDecideToken(expired, SECRET)).toEqual({ ok: false, code: 'expired' })
  })
})

describe('claimReturnTo', () => {
  it('adds view, participant and claim to a bare path', () => {
    expect(claimReturnTo('/lipno', 5)).toBe('/lipno?view=finance&participant=5&claim=5')
  })

  it('preserves unrelated params and overwrites stale ones', () => {
    expect(claimReturnTo('/lipno?view=information&foo=1', 5)).toBe(
      '/lipno?view=finance&foo=1&participant=5&claim=5'
    )
  })

  it('works for the single-chata homepage', () => {
    expect(claimReturnTo('/', 12)).toBe('/?view=finance&participant=12&claim=12')
  })
})
