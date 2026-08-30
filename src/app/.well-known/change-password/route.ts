import { NextResponse } from 'next/server'
import { requestOrigin } from '@/lib/auth/session'

/**
 * GET /.well-known/change-password (W3C) — password managers and browsers
 * probe this URL to send people to wherever credentials are managed.
 * Production is passwordless (magic link + OAuth), so the login screen IS
 * that place; the redirect keeps the request's own host so a probe on a
 * chata subdomain lands on that subdomain's login.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return NextResponse.redirect(`${requestOrigin(request.headers)}/login`, 303)
}
