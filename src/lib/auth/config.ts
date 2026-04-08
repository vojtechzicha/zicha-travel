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
