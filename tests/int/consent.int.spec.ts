import { describe, it, expect } from 'vitest'
import {
  CONSENT_COOKIE,
  CONSENT_TTL_SECONDS,
  consentCookieString,
  readConsentCookie,
  resolveConsent,
  serializeConsent,
} from '@/lib/consent'

const now = new Date('2026-08-10T12:00:00Z')
const monthsAgo = (months: number): number => {
  const d = new Date(now)
  d.setMonth(d.getMonth() - months)
  return d.getTime()
}

describe('resolveConsent', () => {
  it('accepts a fresh granted decision', () => {
    expect(resolveConsent(`granted.${monthsAgo(1)}`, now)).toBe('granted')
  })

  it('accepts a fresh denied decision', () => {
    expect(resolveConsent(`denied.${monthsAgo(1)}`, now)).toBe('denied')
  })

  it('a decision just under 12 months old still counts', () => {
    expect(resolveConsent(`granted.${monthsAgo(11)}`, now)).toBe('granted')
  })

  it('a decision older than 12 months is treated as absent (re-prompt)', () => {
    expect(resolveConsent(`granted.${monthsAgo(13)}`, now)).toBeNull()
    expect(resolveConsent(`denied.${monthsAgo(13)}`, now)).toBeNull()
  })

  it('missing cookie means no decision', () => {
    expect(resolveConsent(null, now)).toBeNull()
    expect(resolveConsent(undefined, now)).toBeNull()
    expect(resolveConsent('', now)).toBeNull()
  })

  it('malformed values mean no decision', () => {
    expect(resolveConsent('granted', now)).toBeNull()
    expect(resolveConsent('yes.12345', now)).toBeNull()
    expect(resolveConsent('granted.not-a-number', now)).toBeNull()
    expect(resolveConsent('granted.', now)).toBeNull()
    expect(resolveConsent('.12345', now)).toBeNull()
  })

  it('round-trips through serializeConsent', () => {
    expect(resolveConsent(serializeConsent('granted', now), now)).toBe('granted')
    expect(resolveConsent(serializeConsent('denied', now), now)).toBe('denied')
  })
})

describe('consentCookieString', () => {
  it('builds a host-only cookie without a domain (local dev)', () => {
    const cookie = consentCookieString('granted', now)
    expect(cookie).toBe(
      `${CONSENT_COOKIE}=granted.${now.getTime()}; Max-Age=${CONSENT_TTL_SECONDS}; Path=/; SameSite=Lax`,
    )
    expect(cookie).not.toContain('Domain=')
    expect(cookie).not.toContain('Secure')
  })

  it('adds Domain and Secure for production (.zicha.travel across subdomains)', () => {
    const cookie = consentCookieString('denied', now, { domain: '.zicha.travel', secure: true })
    expect(cookie).toContain('Domain=.zicha.travel')
    expect(cookie).toContain('Secure')
  })

  it('never marks the cookie HttpOnly — the client reads it back', () => {
    expect(consentCookieString('granted', now, { secure: true })).not.toContain('HttpOnly')
  })
})

describe('readConsentCookie', () => {
  it('finds zt_consent among other cookies', () => {
    const header = `payload-token=abc; ${CONSENT_COOKIE}=granted.123; theme=dark`
    expect(readConsentCookie(header)).toBe('granted.123')
  })

  it('ignores cookies whose name merely contains the consent name', () => {
    expect(readConsentCookie(`x${CONSENT_COOKIE}=denied.123`)).toBeNull()
  })

  it('returns null when absent', () => {
    expect(readConsentCookie('payload-token=abc')).toBeNull()
    expect(readConsentCookie('')).toBeNull()
    expect(readConsentCookie(null)).toBeNull()
  })

  it('round-trips with resolveConsent', () => {
    const header = `a=b; ${CONSENT_COOKIE}=${serializeConsent('denied', now)}`
    expect(resolveConsent(readConsentCookie(header), now)).toBe('denied')
  })
})
