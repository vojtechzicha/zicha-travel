import { NextRequest, NextResponse } from 'next/server'
import { googleProvider } from '@/lib/auth/google'
import { handleOAuthCallback } from '@/lib/auth/oauthCallback'

// Google's registered redirect URI.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  return handleOAuthCallback(googleProvider, request, {
    code: searchParams.get('code'),
    state: searchParams.get('state'),
    error: searchParams.get('error'),
    errorDescription: searchParams.get('error_description'),
  })
}
