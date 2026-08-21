import type { OAuthProviderId } from './config'

// The contract every OAuth sign-in provider implements. All three flows are
// plain authorization-code exchanges that end with an email address; the app
// only ever matches that email against an EXISTING account (the callback
// never creates users), so the id_token email is all a provider must yield.

export interface OAuthUserInfo {
  email?: string
  name?: string
}

export interface OAuthProvider {
  id: OAuthProviderId
  /** Credentials present in the environment (not necessarily the redirect URI). */
  isConfigured(): boolean
  /** Origin of the fixed callback URL — error pages and fallbacks land here. */
  redirectOrigin(): string
  authorizationUrl(state: string): string
  /** Exchange the authorization code and decode who signed in. */
  exchangeCode(code: string): Promise<OAuthUserInfo>
  /**
   * Apple posts the callback cross-site (response_mode=form_post), so the
   * state cookies for its flow need SameSite=None; the redirect-based
   * providers stay on Lax.
   */
  usesFormPost: boolean
}

/** Shared by all three providers: read email + name out of an OIDC id_token. */
export function decodeIdToken(idToken: string): OAuthUserInfo {
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

export async function postTokenRequest(
  url: string,
  body: Record<string, string>,
): Promise<{ id_token?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${res.status} ${text}`)
  }
  return await res.json()
}
