function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name} in environment variables.`)
  }
  return value
}

export interface AuthConfig {
  azureClientId: string
  azureClientSecret: string
  azureRedirectUri: string
  azureRedirectOrigin: string
}

export function isOAuthConfigured(): boolean {
  return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)
}

export type ProviderName = 'google' | 'microsoft'

export function isProviderConfigured(provider: ProviderName): boolean {
  if (provider === 'microsoft') {
    return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)
  }
  if (provider === 'google') {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  }
  return false
}

export function configuredProviders(): ProviderName[] {
  return (['google', 'microsoft'] as ProviderName[]).filter(isProviderConfigured)
}

export function getAuthConfig(): AuthConfig {
  const azureRedirectUri = getRequiredEnv('AZURE_REDIRECT_URI')

  let azureRedirectOrigin: string
  try {
    azureRedirectOrigin = new URL(azureRedirectUri).origin
  } catch {
    throw new Error('AZURE_REDIRECT_URI must be a valid absolute URL.')
  }

  return {
    azureClientId: getRequiredEnv('AZURE_CLIENT_ID'),
    azureClientSecret: getRequiredEnv('AZURE_CLIENT_SECRET'),
    azureRedirectUri,
    azureRedirectOrigin,
  }
}
