import jwt from 'jsonwebtoken'
import { getRequiredEnv, isProviderConfigured, parseRedirectUri } from './config'
import { decodeIdToken, postTokenRequest, type OAuthProvider } from './provider'

const AUTHORIZE_URL = 'https://appleid.apple.com/auth/authorize'
const TOKEN_URL = 'https://appleid.apple.com/auth/token'
// Requesting name or email forces response_mode=form_post: Apple POSTs the
// callback cross-site, which is why this provider's state cookies need
// SameSite=None (see usesFormPost) and why the callback route accepts POST.
const SCOPES = 'name email'

/**
 * APPLE_PRIVATE_KEY holds the .p8 signing key. Env vars are single-line, so
 * the templates document storing it base64-encoded (`base64 -i AuthKey.p8`);
 * a raw PEM with literal "\n" escapes is accepted too.
 */
export function applePrivateKeyPem(raw: string): string {
  const value = raw.trim()
  if (value.includes('BEGIN')) return value.replace(/\\n/g, '\n')
  return Buffer.from(value, 'base64').toString('utf-8')
}

/**
 * Apple has no static client secret: each token request carries a short-lived
 * ES256 JWT signed with the .p8 key from the Apple Developer portal.
 */
export function appleClientSecret(): string {
  return jwt.sign({}, applePrivateKeyPem(getRequiredEnv('APPLE_PRIVATE_KEY')), {
    algorithm: 'ES256',
    keyid: getRequiredEnv('APPLE_KEY_ID'),
    issuer: getRequiredEnv('APPLE_TEAM_ID'),
    subject: getRequiredEnv('APPLE_CLIENT_ID'),
    audience: 'https://appleid.apple.com',
    expiresIn: '5m',
  })
}

export const appleProvider: OAuthProvider = {
  id: 'apple',
  usesFormPost: true,

  isConfigured: () => isProviderConfigured('apple'),

  redirectOrigin: () => parseRedirectUri('APPLE_REDIRECT_URI').redirectOrigin,

  authorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: getRequiredEnv('APPLE_CLIENT_ID'),
      response_type: 'code',
      redirect_uri: parseRedirectUri('APPLE_REDIRECT_URI').redirectUri,
      response_mode: 'form_post',
      scope: SCOPES,
      state,
    })
    return `${AUTHORIZE_URL}?${params.toString()}`
  },

  async exchangeCode(code) {
    const tokens = await postTokenRequest(TOKEN_URL, {
      client_id: getRequiredEnv('APPLE_CLIENT_ID'),
      client_secret: appleClientSecret(),
      code,
      redirect_uri: parseRedirectUri('APPLE_REDIRECT_URI').redirectUri,
      grant_type: 'authorization_code',
    })
    // The id_token always carries the email (the private-relay address when
    // the person picked "Hide My Email" — that one simply won't match an
    // account, which the unauthorized error already covers).
    return tokens.id_token ? decodeIdToken(tokens.id_token) : {}
  },
}
