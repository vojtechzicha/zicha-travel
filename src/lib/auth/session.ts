import { parseCookies } from 'payload'
import jwt from 'jsonwebtoken'

export const PAYLOAD_TOKEN_COOKIE = 'payload-token'

export type AuthCollection = 'users' | 'accounts'

export interface SessionToken {
  id: string | number
  collection: AuthCollection
  email?: string
}

const DEFAULT_EXPIRY = '30d'

/**
 * Mint a Payload-compatible JWT for the shared `payload-token` cookie.
 * The `collection` claim is what lets each auth collection's strategy
 * (Users / Accounts) decide whether the token belongs to it.
 */
export function signSessionToken(payload: SessionToken, expiresIn: string = DEFAULT_EXPIRY): string {
  return jwt.sign(payload, process.env.PAYLOAD_SECRET!, { expiresIn } as jwt.SignOptions)
}

export function verifySessionToken(token: string): SessionToken | null {
  try {
    const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as SessionToken
    if (decoded.collection !== 'users' && decoded.collection !== 'accounts') return null
    return decoded
  } catch {
    return null
  }
}

/**
 * Read and verify the session from a request's cookies (works for both
 * Web `Request`/`NextRequest` via the Headers object).
 */
export function getSessionFromHeaders(headers: Headers): SessionToken | null {
  const cookies = parseCookies(headers)
  const token = cookies.get(PAYLOAD_TOKEN_COOKIE)
  if (!token) return null
  return verifySessionToken(token)
}

export interface SessionCookieOptions {
  maxAge?: number
}

export function sessionCookieOptions(maxAge: number = 30 * 24 * 60 * 60) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    sameSite: 'lax' as const,
    maxAge,
  }
}
