import { getAuthConfig } from './config'

const TENANT = 'consumers'
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`
const SCOPES = 'openid email profile'

export function getAuthorizationUrl(state: string): string {
  const config = getAuthConfig()
  const params = new URLSearchParams({
    client_id: config.azureClientId,
    response_type: 'code',
    redirect_uri: config.azureRedirectUri,
    response_mode: 'query',
    scope: SCOPES,
    state,
  })

  return `${AUTH_BASE}/authorize?${params.toString()}`
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  id_token?: string
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const config = getAuthConfig()
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.azureClientId,
      client_secret: config.azureClientSecret,
      code,
      redirect_uri: config.azureRedirectUri,
      grant_type: 'authorization_code',
      scope: SCOPES,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${text}`)
  }

  return await res.json()
}

export function decodeIdToken(idToken: string): { email?: string; name?: string } {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString('utf-8'),
    )
    return {
      email: payload.email || payload.preferred_username,
      name: payload.name,
    }
  } catch {
    return {}
  }
}
