import { describe, it, expect } from 'vitest'
import { SECURITY_CONTACT, microsoftIdentityAssociation, securityTxtBody } from '@/lib/wellKnown'

const now = new Date('2026-08-30T15:42:11Z')

describe('securityTxtBody', () => {
  const body = securityTxtBody('https://zicha.travel', now)
  const lines = body.split('\n')

  it('names the published security contact', () => {
    expect(lines).toContain(`Contact: ${SECURITY_CONTACT}`)
  })

  it('expires 180 days out, truncated to midnight UTC', () => {
    expect(lines).toContain('Expires: 2027-02-26T00:00:00.000Z')
  })

  it('expiry always stays in the future (RFC 9116 hard requirement)', () => {
    const expiresLine = lines.find((l) => l.startsWith('Expires: '))
    const expires = new Date(expiresLine!.slice('Expires: '.length))
    expect(expires.getTime()).toBeGreaterThan(now.getTime())
  })

  it('canonical link uses the serving origin', () => {
    expect(lines).toContain('Canonical: https://zicha.travel/.well-known/security.txt')
  })

  it('has no Policy field until a real vulnerability-disclosure policy exists', () => {
    expect(body).not.toContain('Policy:')
  })

  it('a chata subdomain links to itself, not the apex', () => {
    const sub = securityTxtBody('https://pratele.zicha.travel', now)
    expect(sub).toContain('Canonical: https://pratele.zicha.travel/.well-known/security.txt')
    expect(sub).not.toContain('https://zicha.travel/.well-known')
  })

  it('ends with a trailing newline', () => {
    expect(body.endsWith('\n')).toBe(true)
  })

  it('is stable within a UTC day (matches the CDN cache window)', () => {
    const laterSameDay = new Date('2026-08-30T23:59:59Z')
    expect(securityTxtBody('https://zicha.travel', laterSameDay)).toBe(body)
  })
})

describe('microsoftIdentityAssociation', () => {
  it('wraps the client ID in the shape the verifier expects', () => {
    expect(microsoftIdentityAssociation('11111111-2222-3333-4444-555555555555')).toEqual({
      associatedApplications: [{ applicationId: '11111111-2222-3333-4444-555555555555' }],
    })
  })

  it('is null without a configured client ID (route answers 404)', () => {
    expect(microsoftIdentityAssociation(undefined)).toBeNull()
    expect(microsoftIdentityAssociation('')).toBeNull()
  })
})
