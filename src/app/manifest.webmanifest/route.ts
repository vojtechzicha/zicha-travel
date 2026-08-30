import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildManifest } from '@/lib/pwa'

/**
 * GET /manifest.webmanifest — the web app manifest, host-aware.
 *
 * A route handler instead of the app/manifest.ts convention because the
 * content depends on the request: on a single-chata subdomain (the
 * middleware marks those with x-matched-chata-slug) the install must lead
 * back to the apex, so start_url switches to the bridge route — see
 * src/lib/pwa.ts for the whole design. Preview deployments get a
 * "(preview)" name so a preview install is distinguishable from the real
 * app on the same home screen.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const bridged = Boolean(request.headers.get('x-matched-chata-slug'))
  return NextResponse.json(buildManifest({ bridged, vercelEnv: process.env.VERCEL_ENV }), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      // Re-validated on every fetch — a changed manifest (new icons, new
      // start_url) must never be pinned by a CDN or the browser cache.
      'cache-control': 'no-cache',
    },
  })
}
