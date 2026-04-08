import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getAuthConfig } from '@/lib/auth/config'
import { exchangeCodeForTokens, decodeIdToken } from '@/lib/auth/microsoft'

function buildRedirect(location: string): NextResponse {
  return NextResponse.redirect(location)
}

export async function GET(request: NextRequest) {
  const authConfig = getAuthConfig()
  const origin = authConfig.azureRedirectOrigin
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    const description = searchParams.get('error_description') || error
    console.error('OAuth error from Microsoft:', description)
    return buildRedirect(`${origin}/admin/login?error=oauth`)
  }

  if (!code || !state) {
    return buildRedirect(`${origin}/admin/login?error=missing_params`)
  }

  const storedState = request.cookies.get('oauth-state')?.value
  if (!storedState || storedState !== state) {
    return buildRedirect(`${origin}/admin/login?error=invalid_state`)
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    const userInfo = tokens.id_token ? decodeIdToken(tokens.id_token) : {}

    if (!userInfo.email) {
      return buildRedirect(`${origin}/admin/login?error=no_email`)
    }

    const payload = await getPayload({ config })

    const users = await payload.find({
      collection: 'users',
      where: { email: { equals: userInfo.email.toLowerCase() } },
      limit: 1,
    })

    if (users.docs.length === 0) {
      return buildRedirect(`${origin}/admin/login?error=unauthorized`)
    }

    const user = users.docs[0]

    const token = jwt.sign(
      { id: user.id, email: user.email, collection: 'users' },
      process.env.PAYLOAD_SECRET!,
      { expiresIn: '2h' },
    )

    const response = buildRedirect(`${origin}/admin`)
    response.cookies.set('payload-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    })
    response.cookies.set('oauth-state', '', {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
    })

    return response
  } catch (err) {
    console.error('OAuth callback error:', err)
    return buildRedirect(`${origin}/admin/login?error=callback_failed`)
  }
}
