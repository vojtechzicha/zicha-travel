import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { requestOrigin, safeReturnTo, safeReturnUrl } from '@/lib/auth/session'

// The OAuth callback always lands on the apex (AZURE_REDIRECT_URI is fixed in
// the Azure app registration), so the return target has to carry the host the
// sign-in actually started on — see safeReturnUrl.

const APEX = 'https://zicha.travel'

describe('safeReturnTo', () => {
  it('keeps a plain path', () => {
    expect(safeReturnTo('/lipno?view=finance')).toBe('/lipno?view=finance')
  })

  it('rejects absolute and protocol-relative values', () => {
    expect(safeReturnTo('https://evil.example/x')).toBe('/')
    expect(safeReturnTo('//evil.example/x')).toBe('/')
    expect(safeReturnTo(null)).toBe('/')
  })

  // The URL parser reads "\" as "/" and strips tabs/newlines, so these
  // resolve to https://evil.example/ against ANY origin if let through
  it('rejects the parser tricks that escape an origin', () => {
    for (const attack of ['/\\evil.example/x', '/\t/evil.example', '/\n/evil.example', '/\r/evil.example']) {
      expect(safeReturnTo(attack)).toBe('/')
      expect(new URL(safeReturnTo(attack), 'https://zicha.travel').origin).toBe('https://zicha.travel')
    }
  })
})

describe('safeReturnUrl', () => {
  const original = process.env.SESSION_COOKIE_DOMAIN

  beforeEach(() => {
    process.env.SESSION_COOKIE_DOMAIN = '.zicha.travel'
  })
  afterEach(() => {
    if (original === undefined) delete process.env.SESSION_COOKIE_DOMAIN
    else process.env.SESSION_COOKIE_DOMAIN = original
  })

  it('returns to the chata subdomain the sign-in started on', () => {
    expect(safeReturnUrl('https://lipno.zicha.travel/?view=finance&participant=43', APEX)).toBe(
      'https://lipno.zicha.travel/?view=finance&participant=43',
    )
  })

  it('keeps the apex when that is where it started', () => {
    expect(safeReturnUrl('https://zicha.travel/lipno?view=finance', APEX)).toBe(
      'https://zicha.travel/lipno?view=finance',
    )
  })

  it('resolves a bare path against the fallback origin', () => {
    expect(safeReturnUrl('/lipno?view=finance', APEX)).toBe('https://zicha.travel/lipno?view=finance')
  })

  it('drops an untrusted host but keeps its path', () => {
    expect(safeReturnUrl('https://evil.example/lipno?view=finance', APEX)).toBe(
      'https://zicha.travel/lipno?view=finance',
    )
  })

  it('refuses non-http schemes', () => {
    expect(safeReturnUrl('javascript:alert(1)', APEX)).toBe('https://zicha.travel/')
    expect(safeReturnUrl('data:text/html,x', APEX)).toBe('https://zicha.travel/')
    expect(safeReturnUrl('//evil.example/x', APEX)).toBe('https://zicha.travel/')
  })

  // An attacker controls the cookie only via ?returnTo, but that is enough:
  // every one of these resolves to https://evil.example/ if passed straight
  // to new URL(value, origin)
  it('never leaves the trusted origin, whatever the input', () => {
    const attacks = [
      '/\\evil.example/x',
      '/\t/evil.example',
      '/\n/evil.example',
      '\\\\evil.example/x',
      'https://evil.example/\\@zicha.travel',
      'https://evil.example//attacker',
      'https://zicha.travel.evil.example/x',
      'https://notzicha.travel/x',
    ]
    for (const attack of attacks) {
      const host = new URL(safeReturnUrl(attack, APEX)).host
      expect(host, `escaped via ${JSON.stringify(attack)}`).toBe('zicha.travel')
    }
  })

  it('does not mistake a lookalike host for a chata subdomain', () => {
    expect(safeReturnUrl('https://zicha.travel.evil.example/?view=finance', APEX)).toBe(
      'https://zicha.travel/?view=finance',
    )
    expect(safeReturnUrl('https://evilzicha.travel/x', APEX)).toBe('https://zicha.travel/x')
  })

  it('falls back to the homepage on garbage', () => {
    expect(safeReturnUrl('not a url', APEX)).toBe('https://zicha.travel/')
    expect(safeReturnUrl(null, APEX)).toBe('https://zicha.travel/')
  })

  it('trusts the deployment host itself without a cookie domain (local dev)', () => {
    delete process.env.SESSION_COOKIE_DOMAIN
    expect(safeReturnUrl('http://localhost:3000/lipno', 'http://localhost:3000')).toBe(
      'http://localhost:3000/lipno',
    )
    // …but nothing else, since no session cookie spans other hosts there
    expect(safeReturnUrl('https://lipno.zicha.travel/x', 'http://localhost:3000')).toBe(
      'http://localhost:3000/x',
    )
  })
})

describe('requestOrigin', () => {
  it('uses the Host header the visitor reached', () => {
    const headers = new Headers({ host: 'lipno.zicha.travel', 'x-forwarded-proto': 'https' })
    expect(requestOrigin(headers)).toBe('https://lipno.zicha.travel')
  })

  it('assumes http on localhost', () => {
    expect(requestOrigin(new Headers({ host: 'localhost:3000' }))).toBe('http://localhost:3000')
  })
})
