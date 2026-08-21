import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'

import { configuredProviders, isOAuthConfigured, isProviderConfigured } from '@/lib/auth/config'
import { decodeIdToken } from '@/lib/auth/provider'
import { microsoftProvider } from '@/lib/auth/microsoft'
import { googleProvider } from '@/lib/auth/google'
import { appleClientSecret, applePrivateKeyPem, appleProvider } from '@/lib/auth/apple'
import { resolveProvider } from '@/lib/auth/providers'

// The provider layer is pure env + URL/JWT plumbing, so it tests without a
// server. Each test builds its own env snapshot and restores the original.

const ENV_KEYS = [
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_REDIRECT_URI',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'APPLE_CLIENT_ID',
  'APPLE_TEAM_ID',
  'APPLE_KEY_ID',
  'APPLE_PRIVATE_KEY',
  'APPLE_REDIRECT_URI',
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

const configureMicrosoft = () => {
  process.env.AZURE_CLIENT_ID = 'ms-client'
  process.env.AZURE_CLIENT_SECRET = 'ms-secret'
  process.env.AZURE_REDIRECT_URI = 'https://zicha.travel/api/auth/callback'
}

const configureGoogle = () => {
  process.env.GOOGLE_CLIENT_ID = 'g-client'
  process.env.GOOGLE_CLIENT_SECRET = 'g-secret'
  process.env.GOOGLE_REDIRECT_URI = 'https://zicha.travel/api/auth/callback/google'
}

const appleKey = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })

const configureApple = () => {
  process.env.APPLE_CLIENT_ID = 'travel.zicha.signin'
  process.env.APPLE_TEAM_ID = 'TEAMID9999'
  process.env.APPLE_KEY_ID = 'KEYID88888'
  process.env.APPLE_PRIVATE_KEY = Buffer.from(
    appleKey.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  ).toString('base64')
  process.env.APPLE_REDIRECT_URI = 'https://zicha.travel/api/auth/callback/apple'
}

describe('provider configuration', () => {
  it('reports nothing configured on an empty environment', () => {
    expect(isOAuthConfigured()).toBe(false)
    expect(configuredProviders()).toEqual([])
    expect(resolveProvider('microsoft')).toBeNull()
  })

  it('treats each provider independently', () => {
    configureGoogle()
    expect(isProviderConfigured('google')).toBe(true)
    expect(isProviderConfigured('microsoft')).toBe(false)
    expect(isProviderConfigured('apple')).toBe(false)
    expect(isOAuthConfigured()).toBe(true)
    expect(configuredProviders()).toEqual(['google'])
  })

  it('resolves the requested provider when configured, else the first configured', () => {
    configureMicrosoft()
    configureGoogle()
    expect(resolveProvider('google')?.id).toBe('google')
    // Bare /api/auth/login links predate the provider param and mean Microsoft
    expect(resolveProvider(null)?.id).toBe('microsoft')
    // An enabled-but-unconfigured provider falls back instead of crashing
    expect(resolveProvider('apple')?.id).toBe('microsoft')
    expect(resolveProvider('not-a-provider')?.id).toBe('microsoft')
  })
})

describe('authorization URLs', () => {
  it('sends Microsoft to the consumers tenant with the fixed callback', () => {
    configureMicrosoft()
    const url = new URL(microsoftProvider.authorizationUrl('state-1'))
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    )
    expect(url.searchParams.get('client_id')).toBe('ms-client')
    expect(url.searchParams.get('redirect_uri')).toBe('https://zicha.travel/api/auth/callback')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(microsoftProvider.usesFormPost).toBe(false)
  })

  it('sends Google to accounts.google.com with the openid email scope', () => {
    configureGoogle()
    const url = new URL(googleProvider.authorizationUrl('state-2'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toContain('email')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://zicha.travel/api/auth/callback/google',
    )
    expect(googleProvider.usesFormPost).toBe(false)
  })

  it('sends Apple to appleid.apple.com as form_post — the cross-site POST flow', () => {
    configureApple()
    const url = new URL(appleProvider.authorizationUrl('state-3'))
    expect(url.origin + url.pathname).toBe('https://appleid.apple.com/auth/authorize')
    expect(url.searchParams.get('response_mode')).toBe('form_post')
    expect(url.searchParams.get('client_id')).toBe('travel.zicha.signin')
    expect(appleProvider.usesFormPost).toBe(true)
  })
})

describe('Apple client secret', () => {
  it('normalizes the private key from base64 and from escaped PEM', () => {
    const pem = appleKey.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    expect(applePrivateKeyPem(Buffer.from(pem).toString('base64'))).toBe(pem)
    expect(applePrivateKeyPem(pem.replaceAll('\n', '\\n'))).toBe(pem.replaceAll('\n', '\n'))
  })

  it('signs a verifiable ES256 JWT with the Apple claims', () => {
    configureApple()
    const token = appleClientSecret()
    const decoded = jwt.verify(token, appleKey.publicKey, {
      algorithms: ['ES256'],
      audience: 'https://appleid.apple.com',
      issuer: 'TEAMID9999',
    }) as jwt.JwtPayload
    expect(decoded.sub).toBe('travel.zicha.signin')
    expect(jwt.decode(token, { complete: true })?.header.kid).toBe('KEYID88888')
  })
})

describe('decodeIdToken', () => {
  it('reads email and name from an OIDC id_token payload', () => {
    const payload = Buffer.from(
      JSON.stringify({ email: 'katka@example.com', name: 'Katka' }),
    ).toString('base64url')
    expect(decodeIdToken(`x.${payload}.y`)).toEqual({ email: 'katka@example.com', name: 'Katka' })
  })

  it('falls back to preferred_username and survives garbage', () => {
    const payload = Buffer.from(JSON.stringify({ preferred_username: 'k@example.com' })).toString(
      'base64url',
    )
    expect(decodeIdToken(`x.${payload}.y`).email).toBe('k@example.com')
    expect(decodeIdToken('not-a-jwt')).toEqual({})
  })
})
