import { NextRequest, NextResponse } from 'next/server'
import { appleProvider } from '@/lib/auth/apple'
import { handleOAuthCallback } from '@/lib/auth/oauthCallback'

// Apple's registered redirect URI. Because the scopes include name/email,
// Apple requires response_mode=form_post: success AND error responses arrive
// as a cross-site POST with form-encoded fields (the state cookie travels
// thanks to SameSite=None — set by the login route for this provider).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData().catch(() => null)
  const field = (name: string): string | null => {
    const value = form?.get(name)
    return typeof value === 'string' ? value : null
  }
  return handleOAuthCallback(appleProvider, request, {
    code: field('code'),
    state: field('state'),
    error: field('error'),
    errorDescription: field('error_description'),
  })
}

// Safety net: a hand-typed or re-navigated callback URL arrives as GET with
// no parameters — hand it to the same handler, which reports missing_params
// on the right error page instead of a bare 405.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  return handleOAuthCallback(appleProvider, request, {
    code: searchParams.get('code'),
    state: searchParams.get('state'),
    error: searchParams.get('error'),
    errorDescription: searchParams.get('error_description'),
  })
}
