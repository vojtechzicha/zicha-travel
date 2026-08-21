// Which OAuth sign-in providers are configured, read straight from the
// environment. Dependency-free on purpose: collection configs import this at
// module load, and the provider modules (microsoft.ts, google.ts, apple.ts)
// build on it.

export const OAUTH_PROVIDER_IDS = ['microsoft', 'google', 'apple'] as const
export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number]

export function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name} in environment variables.`)
  }
  return value
}

/**
 * "Configured" means the credentials that make the provider able to complete
 * a token exchange are present. The redirect URI is validated separately by
 * each provider's getConfig (and by env-spec's all-or-nothing groups).
 */
export function isProviderConfigured(id: OAuthProviderId): boolean {
  switch (id) {
    case 'microsoft':
      return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)
    case 'google':
      return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    case 'apple':
      return !!(
        process.env.APPLE_CLIENT_ID &&
        process.env.APPLE_TEAM_ID &&
        process.env.APPLE_KEY_ID &&
        process.env.APPLE_PRIVATE_KEY
      )
  }
}

/**
 * At least one OAuth provider is configured. This is the switch that turns
 * off Payload's local email+password bootstrap login and reserves superadmin
 * sign-in for OAuth (any provider) — the role Microsoft alone used to play.
 */
export function isOAuthConfigured(): boolean {
  return OAUTH_PROVIDER_IDS.some(isProviderConfigured)
}

export function configuredProviders(): OAuthProviderId[] {
  return OAUTH_PROVIDER_IDS.filter(isProviderConfigured)
}

/** Fixed callback URL and its origin, shared shape for every provider. */
export interface RedirectConfig {
  redirectUri: string
  redirectOrigin: string
}

export function parseRedirectUri(envName: string): RedirectConfig {
  const redirectUri = getRequiredEnv(envName)
  try {
    return { redirectUri, redirectOrigin: new URL(redirectUri).origin }
  } catch {
    throw new Error(`${envName} must be a valid absolute URL.`)
  }
}
