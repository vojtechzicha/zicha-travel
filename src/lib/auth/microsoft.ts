import { getRequiredEnv, isProviderConfigured, parseRedirectUri } from './config'
import { decodeIdToken, postTokenRequest, type OAuthProvider } from './provider'

const TENANT = 'consumers'
const AUTH_BASE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`
const SCOPES = 'openid email profile'

export const microsoftProvider: OAuthProvider = {
  id: 'microsoft',
  usesFormPost: false,

  isConfigured: () => isProviderConfigured('microsoft'),

  redirectOrigin: () => parseRedirectUri('AZURE_REDIRECT_URI').redirectOrigin,

  authorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: getRequiredEnv('AZURE_CLIENT_ID'),
      response_type: 'code',
      redirect_uri: parseRedirectUri('AZURE_REDIRECT_URI').redirectUri,
      response_mode: 'query',
      scope: SCOPES,
      state,
    })
    return `${AUTH_BASE}/authorize?${params.toString()}`
  },

  async exchangeCode(code) {
    const tokens = await postTokenRequest(`${AUTH_BASE}/token`, {
      client_id: getRequiredEnv('AZURE_CLIENT_ID'),
      client_secret: getRequiredEnv('AZURE_CLIENT_SECRET'),
      code,
      redirect_uri: parseRedirectUri('AZURE_REDIRECT_URI').redirectUri,
      grant_type: 'authorization_code',
      scope: SCOPES,
    })
    return tokens.id_token ? decodeIdToken(tokens.id_token) : {}
  },
}
