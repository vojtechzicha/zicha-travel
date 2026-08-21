import { NextResponse } from 'next/server'

/**
 * GET /api/version — the build id of the deployment currently serving
 * requests. The id is inlined at build time (see next.config.mjs), so
 * whatever build produced the running server code is the id this route
 * returns. A browser tab whose own inlined id differs was loaded from an
 * older deploy — the UpdateHint component polls this route and asks the
 * user to refresh in that case.
 *
 * Deliberately public: it exposes nothing but an opaque commit-derived id
 * (the footer already shows the same commit), and the hint must work for
 * anonymous visitors too. Static routes under (payload)/api win over the
 * [...slug] catch-all, same as the auth routes.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    // Explicit no-store so no CDN in front of the app ever pins a stale id.
    { headers: { 'cache-control': 'no-store' } },
  )
}
