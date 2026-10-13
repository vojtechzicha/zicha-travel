import { NextResponse } from 'next/server'
import { serviceWorkerSource } from '@/lib/serviceWorkerSource'

/**
 * GET /sw.js — the service worker script, generated per deploy with the
 * build id baked in (see src/lib/serviceWorkerSource.ts for the whole
 * design). Served with no-store so an update check ALWAYS reads the
 * current deployment's bytes: between that, updateViaCache: 'none' at
 * registration and the explicit update() calls in PwaProvider, a stale
 * worker cannot survive a deploy.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  return new NextResponse(serviceWorkerSource(process.env.NEXT_PUBLIC_BUILD_ID ?? 'unversioned'), {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
    },
  })
}
