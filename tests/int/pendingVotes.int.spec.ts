import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import {
  VOTE_CONFIRM_TTL_DAYS,
  signVoteConfirmToken,
  signVoteIntentToken,
  verifyVoteConfirmToken,
  verifyVoteIntentToken,
} from '@/lib/pendingVotes'
import { voteConfirmEmail } from '@/lib/planningVoteEmail'

const secret = 'test-secret'

describe('vote confirm tokens', () => {
  it('round-trips the pending row and its account', () => {
    const token = signVoteConfirmToken({ pendingVoteId: 12, userId: 9, key: 'k1' }, secret)
    expect(verifyVoteConfirmToken(token, secret)).toEqual({
      ok: true,
      pendingVoteId: 12,
      userId: 9,
      key: 'k1',
    })
  })

  it('lives 7 days — the email link must survive a slow week', () => {
    expect(VOTE_CONFIRM_TTL_DAYS).toBe(7)
    const token = signVoteConfirmToken({ pendingVoteId: 1, userId: 1, key: 'k' }, secret)
    const { exp, iat } = jwt.decode(token) as { exp: number; iat: number }
    expect(exp - iat).toBe(7 * 24 * 60 * 60)
  })

  it('rejects a token signed with a different secret, garbage, and other purposes', () => {
    const token = signVoteConfirmToken({ pendingVoteId: 1, userId: 1, key: 'k' }, secret)
    expect(verifyVoteConfirmToken(token, 'other')).toEqual({ ok: false, code: 'invalid' })
    expect(verifyVoteConfirmToken('nope', secret)).toEqual({ ok: false, code: 'invalid' })
    // a session JWT or a claim decide token signed with the same secret
    const session = jwt.sign({ id: 1, email: 'a@b.c', collection: 'users' }, secret)
    expect(verifyVoteConfirmToken(session, secret)).toEqual({ ok: false, code: 'invalid' })
    const intent = signVoteIntentToken(
      { chataId: 1, name: 'X', dateOptionIds: [1], accommodationOptionIds: [] },
      secret,
    )
    expect(verifyVoteConfirmToken(intent, secret)).toEqual({ ok: false, code: 'invalid' })
  })

  it('a token without a submission key is invalid (every link is bound to one submission)', () => {
    const keyless = jwt.sign({ pendingVoteId: 1, userId: 1, purpose: 'vote-confirm' }, secret)
    expect(verifyVoteConfirmToken(keyless, secret)).toEqual({ ok: false, code: 'invalid' })
  })

  it('reports expiry distinctly (the page offers a sign-in instead)', () => {
    const expired = jwt.sign(
      { pendingVoteId: 1, userId: 1, key: 'k', purpose: 'vote-confirm' },
      secret,
      { expiresIn: -10 },
    )
    expect(verifyVoteConfirmToken(expired, secret)).toEqual({ ok: false, code: 'expired' })
  })
})

describe('vote intent tokens (OAuth round trip)', () => {
  const intent = {
    chataId: 10,
    name: 'Michal C.',
    dateOptionIds: [2],
    accommodationOptionIds: [2],
  }

  it('round-trips the whole selection', () => {
    expect(verifyVoteIntentToken(signVoteIntentToken(intent, secret), secret)).toEqual(intent)
  })

  it('is short-lived and purpose-bound', () => {
    const { exp, iat } = jwt.decode(signVoteIntentToken(intent, secret)) as {
      exp: number
      iat: number
    }
    expect(exp - iat).toBe(10 * 60)
    const confirm = signVoteConfirmToken({ pendingVoteId: 1, userId: 1, key: 'k' }, secret)
    expect(verifyVoteIntentToken(confirm, secret)).toBeNull()
    expect(verifyVoteIntentToken('garbage', secret)).toBeNull()
  })

  it('refuses a tampered id list', () => {
    const forged = jwt.sign(
      { ...intent, dateOptionIds: ['2; drop table'], purpose: 'vote-intent' },
      secret,
    )
    expect(verifyVoteIntentToken(forged, secret)).toBeNull()
  })
})

describe('voteConfirmEmail', () => {
  const args = {
    link: 'https://pratele.zicha.travel/votes/confirm?token=abc',
    chataName: 'Přátelé',
    voterName: 'David <N.>',
    dates: ['16.–18. 10. 2026', '13.–15. 11. 2026'],
    places: ['Chata Kloučka'],
    ttlDays: 7,
  }

  it('puts the chata in the subject and the vote in the body, both locales', () => {
    const cs = voteConfirmEmail('cs', args)
    expect(cs.subject).toBe('Potvrď svůj hlas: Přátelé')
    expect(cs.text).toContain('16.–18. 10. 2026, 13.–15. 11. 2026')
    expect(cs.text).toContain('Chata Kloučka')
    expect(cs.text).toContain(args.link)
    expect(cs.text).toContain('7 dní')
    const en = voteConfirmEmail('en', args)
    expect(en.subject).toBe('Confirm your vote: Přátelé')
    expect(en.html).toContain('Confirm my vote')
  })

  it('escapes names in the HTML and words an empty place list', () => {
    const cs = voteConfirmEmail('cs', { ...args, places: [] })
    expect(cs.html).toContain('David &lt;N.&gt;')
    expect(cs.html).not.toContain('David <N.>')
    expect(cs.html).toContain('bez preference')
    expect(cs.text).toContain('bez preference')
  })
})
