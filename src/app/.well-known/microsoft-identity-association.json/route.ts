import { NextResponse } from 'next/server'
import { microsoftIdentityAssociation } from '@/lib/wellKnown'

/**
 * GET /.well-known/microsoft-identity-association.json — publisher-domain
 * verification for the Azure app registration (Entra portal: Branding &
 * properties → Publisher domain). Microsoft's verifier fetches this exact
 * path and requires Content-Type application/json with no redirects.
 * Deployments without Microsoft OAuth configured 404 it.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const body = microsoftIdentityAssociation(process.env.AZURE_CLIENT_ID)
  if (!body) return new Response(null, { status: 404 })
  return NextResponse.json(body, {
    headers: { 'cache-control': 'public, max-age=0, s-maxage=86400' },
  })
}
