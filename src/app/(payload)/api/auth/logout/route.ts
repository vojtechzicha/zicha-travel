import { NextRequest, NextResponse } from 'next/server'
import { PAYLOAD_TOKEN_COOKIE } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

function clear(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('redirect')
  const redirect = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
  const res = NextResponse.redirect(new URL(redirect, request.nextUrl.origin))
  res.cookies.set(PAYLOAD_TOKEN_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}

export async function GET(request: NextRequest) {
  return clear(request)
}

export async function POST(request: NextRequest) {
  return clear(request)
}
