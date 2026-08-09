import { NextResponse } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'

/**
 * The middleware calls this on EVERY page request to map Host → chata, which
 * on Vercel is a second function invocation plus a database query in front of
 * every render. Letting the CDN answer it turns that into an edge cache hit in
 * the same region the middleware runs in.
 *
 * The trade-off is that adding a domain to a chata takes effect within an hour
 * rather than instantly — an accepted budget, matched by the middleware's own
 * in-memory TTL. `stale-while-revalidate` keeps serving the old answer while a
 * background request refreshes it, so a miss never blocks a render; the hour
 * mostly buys fewer revalidations rather than lower latency. The payload
 * (id/name/slug/location) is already public data.
 */
const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400'

/**
 * GET /api/domains/:hostname
 * Resolves a domain name to a chata configuration
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ hostname: string }> }
): Promise<NextResponse> {
  try {
    const { hostname } = await params
    const payload = await getPayload({ config })

    // Find chata with matching domain. depth 0: only four scalar fields are
    // returned, so there is nothing to populate.
    const chatasResult = await payload.find({
      collection: 'chatas',
      where: {
        'domains.domain': {
          equals: hostname,
        },
      },
      limit: 1,
      depth: 0,
    })

    if (chatasResult.docs.length > 0) {
      const chata = chatasResult.docs[0]
      return NextResponse.json(
        {
          found: true,
          chata: {
            id: chata.id,
            name: chata.name,
            slug: chata.slug,
            location: chata.location,
          },
        },
        { headers: { 'Cache-Control': CACHE_CONTROL } }
      )
    }

    // No matching domain found. Cached too — the multi-chata hosts
    // (zicha.travel and every preview URL) take this branch on every request.
    return NextResponse.json(
      {
        found: false,
        message: 'No chata found for this domain',
      },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    )
  } catch (error) {
    console.error('Error resolving domain:', error)
    // Never cache a failure — the next request should retry against the DB.
    return NextResponse.json(
      { error: 'Failed to resolve domain' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
