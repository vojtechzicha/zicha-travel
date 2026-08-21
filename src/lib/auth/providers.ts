import { OAUTH_PROVIDER_IDS, type OAuthProviderId } from './config'
import type { OAuthProvider } from './provider'
import { microsoftProvider } from './microsoft'
import { googleProvider } from './google'
import { appleProvider } from './apple'

const REGISTRY: Record<OAuthProviderId, OAuthProvider> = {
  microsoft: microsoftProvider,
  google: googleProvider,
  apple: appleProvider,
}

/**
 * Resolve the ?provider= query value to a CONFIGURED provider. A missing or
 * unknown value falls back to the first configured one (microsoft first, so
 * pre-existing `/api/auth/login` links keep meaning Microsoft); null when no
 * provider is configured at all.
 */
export function resolveProvider(requested: string | null | undefined): OAuthProvider | null {
  if (requested && (OAUTH_PROVIDER_IDS as readonly string[]).includes(requested)) {
    const provider = REGISTRY[requested as OAuthProviderId]
    if (provider.isConfigured()) return provider
  }
  for (const id of OAUTH_PROVIDER_IDS) {
    if (REGISTRY[id].isConfigured()) return REGISTRY[id]
  }
  return null
}

export function getProvider(id: OAuthProviderId): OAuthProvider {
  return REGISTRY[id]
}
