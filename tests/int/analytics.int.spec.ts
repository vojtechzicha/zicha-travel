import { describe, it, expect } from 'vitest'
import { commonProps, referrerHost, sanitizeUrl, scrubProps } from '@/lib/analytics'

describe('sanitizeUrl', () => {
  it('strips the participant id — the public API resolves it to a real name', () => {
    expect(sanitizeUrl('https://lipno.zicha.travel/?view=finance&participant=12')).toBe(
      'https://lipno.zicha.travel/?view=finance',
    )
  })

  it('strips claim, token and returnTo', () => {
    expect(
      sanitizeUrl('https://zicha.travel/login?claim=5&token=abc&returnTo=%2Flipno&error=x'),
    ).toBe('https://zicha.travel/login?error=x')
  })

  it('keeps harmless params (view) untouched', () => {
    expect(sanitizeUrl('https://zicha.travel/lipno?view=organization')).toBe(
      'https://zicha.travel/lipno?view=organization',
    )
  })

  it('handles relative paths', () => {
    expect(sanitizeUrl('/lipno?participant=3&view=finance')).toBe('/lipno?view=finance')
  })

  it('never leaks an unparsable value', () => {
    expect(sanitizeUrl('http://')).toBe('')
    expect(sanitizeUrl(null)).toBe('')
    expect(sanitizeUrl(undefined)).toBe('')
  })
})

describe('referrerHost', () => {
  it('reduces a referrer to its host', () => {
    expect(referrerHost('https://www.facebook.com/some/private/path?x=1')).toBe('www.facebook.com')
  })

  it('returns empty for missing or malformed referrers', () => {
    expect(referrerHost('')).toBe('')
    expect(referrerHost(null)).toBe('')
    expect(referrerHost('not a url')).toBe('')
  })
})

describe('scrubProps (PII guard)', () => {
  it('drops denylisted keys however they are cased or word-separated', () => {
    expect(
      scrubProps({
        view: 'finance',
        name: 'Katka',
        Email: 'katka@example.com',
        participantId: 12,
        participant_id: 12,
        userId: 3,
        amount: 1500,
        IBAN: 'CZ65...',
      }),
    ).toEqual({ view: 'finance' })
  })

  it('passes ordinary props through unchanged', () => {
    expect(scrubProps({ step: 2, split_mode: 'shares', side: 'debtor' })).toEqual({
      step: 2,
      split_mode: 'shares',
      side: 'debtor',
    })
  })
})

describe('commonProps', () => {
  it('derives surface from the viewport, not the UA', () => {
    const ctx = { chata: 'lipno', role: 'user' as const }
    expect(commonProps(ctx, 390)).toEqual({ chata: 'lipno', role: 'user', surface: 'mobile' })
    expect(commonProps(ctx, 1280)).toEqual({ chata: 'lipno', role: 'user', surface: 'desktop' })
  })

  it('defaults to anonymous with no chata', () => {
    expect(commonProps({ chata: null, role: 'anonymous' }, 900)).toEqual({
      chata: null,
      role: 'anonymous',
      surface: 'desktop',
    })
  })
})
