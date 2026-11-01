import { X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { ENV_SPEC } from '../../scripts/env-spec.mjs'
import { pgSslFor, SUPABASE_ROOT_CA } from '../../src/lib/db-ssl.mjs'

const POOLER = 'postgresql://zicha_travel_app.ref:pw@aws-1-eu-west-3.pooler.supabase.com:6543/postgres'

describe('pgSslFor', () => {
  it('pins the Supabase root CA for Supabase hosts', () => {
    expect(pgSslFor(POOLER)).toEqual({ ca: SUPABASE_ROOT_CA, rejectUnauthorized: true })
    expect(pgSslFor('postgresql://postgres:pw@db.ref.supabase.co:5432/postgres')?.rejectUnauthorized).toBe(true)
  })

  it('leaves other hosts (local Docker) on plain TCP', () => {
    expect(pgSslFor('postgresql://postgres:postgres@localhost:5433/zicha')).toBeUndefined()
    expect(pgSslFor('postgresql://u:p@evil-supabase.com.example.org:5432/db')).toBeUndefined()
    expect(pgSslFor(undefined)).toBeUndefined()
    expect(pgSslFor('not a url')).toBeUndefined()
  })

  it('refuses URI TLS parameters that would override the pinned CA', () => {
    expect(() => pgSslFor(`${POOLER}?sslmode=require`)).toThrow(/must not set sslmode/)
    expect(() => pgSslFor(`${POOLER}?uselibpqcompat=true&sslmode=require`)).toThrow()
  })

  it('embeds the published Supabase Root 2021 CA', () => {
    const cert = new X509Certificate(SUPABASE_ROOT_CA)
    expect(cert.subject).toContain('CN=Supabase Root 2021 CA')
    expect(cert.fingerprint256).toBe(
      '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
    )
  })
})

describe('DATABASE_URI env check', () => {
  const check = ENV_SPEC.find((v: { name: string }) => v.name === 'DATABASE_URI')!.check!

  it('accepts a plain pooler URI and rejects TLS parameters', () => {
    expect(check(POOLER)).toBeNull()
    expect(check(`${POOLER}?sslmode=require`)).toMatch(/must not set sslmode/)
  })
})
