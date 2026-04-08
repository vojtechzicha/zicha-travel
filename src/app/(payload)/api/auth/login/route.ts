import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isOAuthConfigured } from '@/lib/auth/config'
import { getAuthorizationUrl } from '@/lib/auth/microsoft'

export async function GET(request: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.json({ error: 'OAuth not configured' }, { status: 404 })
  }

  const state = crypto.randomBytes(16).toString('hex')
  const authUrl = getAuthorizationUrl(state)

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('oauth-state', state, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60, // 10 minutes
  })

  return response
}
