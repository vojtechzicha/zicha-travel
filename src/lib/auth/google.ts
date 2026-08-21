import { getRequiredEnv, isProviderConfigured, parseRedirectUri } from './config'
import { decodeIdToken, postTokenRequest, type OAuthProvider } from './provider'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPES = 'openid email profile'

export const googleProvider: OAuthProvider = {
  id: 'google',
  usesFormPost: false,

  isConfigured: () => isProviderConfigured('google'),

  redirectOrigin: () => parseRedirectUri('GOOGLE_REDIRECT_URI').redirectOrigin,

  authorizationUrl(state) {
    const params = new URLSearchParams({
      client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
      response_type: 'code',
      redirect_uri: parseRedirectUri('GOOGLE_REDIRECT_URI').redirectUri,
      scope: SCOPES,
      state,
    })
    return `${AUTHORIZE_URL}?${params.toString()}`
  },

  async exchangeCode(code) {
    const tokens = await postTokenRequest(TOKEN_URL, {
      client_id: getRequiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: getRequiredEnv('GOOGLE_CLIENT_SECRET'),
      code,
      redirect_uri: parseRedirectUri('GOOGLE_REDIRECT_URI').redirectUri,
      grant_type: 'authorization_code',
    })
    return tokens.id_token ? decodeIdToken(tokens.id_token) : {}
  },
}
