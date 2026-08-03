import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { safeReturnTo, setSessionCookie, signSessionToken } from '@/lib/auth/session'

/**
 * GET /api/auth/magic-link/verify?token=...&returnTo=/...
 *
 * Consumes a one-time login token from the email link, signs the session
 * cookie and redirects to the frontend.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const token = searchParams.get('token')
  const returnTo = safeReturnTo(searchParams.get('returnTo'))

  const loginUrl = new URL('/login', request.nextUrl.origin)
  if (!token) {
    loginUrl.searchParams.set('error', 'invalid_link')
    return NextResponse.redirect(loginUrl)
  }

  const payload = await getPayload({ config })
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const users = await payload.find({
    collection: 'users',
    where: {
      and: [
        { loginToken: { equals: tokenHash } },
        { loginTokenExpires: { greater_than: new Date().toISOString() } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  if (users.docs.length === 0) {
    loginUrl.searchParams.set('error', 'expired_link')
    return NextResponse.redirect(loginUrl)
  }

  const user = users.docs[0]

  // One-time use: clear the token before issuing the session
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { loginToken: null, loginTokenExpires: null },
    overrideAccess: true,
  })

  const { token: sessionToken, maxAge } = signSessionToken(user)
  const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin))
  setSessionCookie(response, sessionToken, maxAge)
  return response
}
