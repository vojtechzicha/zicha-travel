import type { ProviderName } from './config'

export interface OAuthUserInfo {
  email?: string
  name?: string
}

export interface OAuthProvider {
  name: ProviderName
  isConfigured(): boolean
  getAuthorizationUrl(state: string, redirectUri: string): string
  exchangeCode(code: string, redirectUri: string): Promise<OAuthUserInfo>
}

function decodeIdToken(idToken: string): OAuthUserInfo {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf-8'))
    return {
      email: payload.email || payload.preferred_username,
      name: payload.name,
    }
  } catch {
    return {}
  }
}

// --- Microsoft (personal/consumer accounts) ---

const MS_TENANT = 'consumers'
const MS_BASE = `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0`
const MS_SCOPES = 'openid email profile'

const microsoftProvider: OAuthProvider = {
  name: 'microsoft',
  isConfigured: () => !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET),
  getAuthorizationUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: MS_SCOPES,
      state,
    })
    return `${MS_BASE}/authorize?${params.toString()}`
  },
  async exchangeCode(code, redirectUri) {
    const res = await fetch(`${MS_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: MS_SCOPES,
      }),
    })
    if (!res.ok) throw new Error(`Microsoft token exchange failed: ${res.status} ${await res.text()}`)
    const tokens = (await res.json()) as { id_token?: string }
    return tokens.id_token ? decodeIdToken(tokens.id_token) : {}
  },
}

// --- Google ---

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_SCOPES = 'openid email profile'

const googleProvider: OAuthProvider = {
  name: 'google',
  isConfigured: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  getAuthorizationUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: GOOGLE_SCOPES,
      access_type: 'online',
      prompt: 'select_account',
      state,
    })
    return `${GOOGLE_AUTH}?${params.toString()}`
  },
  async exchangeCode(code, redirectUri) {
    const res = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`)
    const tokens = (await res.json()) as { id_token?: string }
    return tokens.id_token ? decodeIdToken(tokens.id_token) : {}
  },
}

const PROVIDERS: Record<ProviderName, OAuthProvider> = {
  microsoft: microsoftProvider,
  google: googleProvider,
}

export function getProvider(name: string): OAuthProvider | null {
  if (name === 'google' || name === 'microsoft') return PROVIDERS[name]
  return null
}
