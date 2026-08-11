import { describe, expect, it } from 'vitest'

import { isAppLocale, localeCookieString, pickLocale } from '@/i18n/config'

describe('pickLocale', () => {
  it('prefers a valid cookie over everything', () => {
    expect(pickLocale('en', 'cs,en;q=0.5')).toBe('en')
    expect(pickLocale('cs', 'en-US,en;q=0.9')).toBe('cs')
  })

  it('ignores an invalid cookie value', () => {
    expect(pickLocale('de', 'en-US,en;q=0.9')).toBe('en')
    expect(pickLocale('', 'en-US')).toBe('en')
  })

  it('negotiates from Accept-Language with quality values', () => {
    expect(pickLocale(null, 'en-US,en;q=0.9,cs;q=0.8')).toBe('en')
    expect(pickLocale(null, 'cs-CZ,cs;q=0.9,en;q=0.8')).toBe('cs')
    expect(pickLocale(null, 'en;q=0.4,cs;q=0.9')).toBe('cs')
  })

  it('keeps the earlier entry on equal quality', () => {
    expect(pickLocale(null, 'cs,en')).toBe('cs')
    expect(pickLocale(null, 'en,cs')).toBe('en')
  })

  it('maps Slovak to Czech', () => {
    expect(pickLocale(null, 'sk-SK,sk;q=0.9')).toBe('cs')
    // ...but an explicitly better English still wins
    expect(pickLocale(null, 'en;q=1,sk;q=0.5')).toBe('en')
  })

  it('falls back to Czech when nothing matches', () => {
    expect(pickLocale(null, null)).toBe('cs')
    expect(pickLocale(undefined, 'de-DE,de;q=0.9,fr;q=0.8')).toBe('cs')
    expect(pickLocale(null, '')).toBe('cs')
  })

  it('treats malformed quality values as lowest priority', () => {
    expect(pickLocale(null, 'en;q=abc,cs;q=0.5')).toBe('cs')
  })
})

describe('isAppLocale', () => {
  it('accepts only cs and en', () => {
    expect(isAppLocale('cs')).toBe(true)
    expect(isAppLocale('en')).toBe(true)
    expect(isAppLocale('de')).toBe(false)
    expect(isAppLocale(undefined)).toBe(false)
  })
})

describe('localeCookieString', () => {
  it('builds a host-only cookie by default', () => {
    const cookie = localeCookieString('en')
    expect(cookie).toContain('NEXT_LOCALE=en')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Domain=')
    expect(cookie).not.toContain('Secure')
  })

  it('adds Domain and Secure when configured', () => {
    const cookie = localeCookieString('cs', { domain: '.zicha.travel', secure: true })
    expect(cookie).toContain('Domain=.zicha.travel')
    expect(cookie).toContain('Secure')
  })
})
