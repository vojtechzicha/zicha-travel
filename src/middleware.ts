import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// In-memory cache for domain lookups. One hour: a warm instance then skips the
// /api/domains round-trip entirely for its whole lifetime, which is the only
// way to get the lookup off the critical path completely (the CDN copy behind
// it is cheap but still a network hop). Matches the route's own s-maxage, so
// a new chata domain routes within an hour either way.
const domainCache = new Map<string, { data: DomainInfo; expires: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

interface DomainInfo {
  found: boolean
  chata?: {
    id: number
    name: string
    slug: string
    location: string
  }
}

// Debug logging is OPT-IN (set DEBUG_MIDDLEWARE=1): a log line for every
// request is a request log, and the policy promises we do not keep our own
// request logs with visitor data (compliance blocker 4).
const debugLog = (...args: unknown[]): void => {
  if (process.env.DEBUG_MIDDLEWARE) console.log('[Middleware]', ...args)
}

async function getDomainInfo(hostname: string, origin: string): Promise<DomainInfo> {
  const cached = domainCache.get(hostname)
  if (cached && cached.expires > Date.now()) {
    return cached.data
  }

  try {
    const url = `${origin}/api/domains/${encodeURIComponent(hostname)}`
    debugLog('Fetching:', url)
    const response = await fetch(url)
    debugLog('Response status:', response.status)
    if (!response.ok) {
      return { found: false }
    }
    const data = await response.json()
    debugLog('Domain info:', data)
    domainCache.set(hostname, { data, expires: Date.now() + CACHE_TTL })
    return data
  } catch (error) {
    debugLog('Error:', error)
    return { found: false }
  }
}

/**
 * Origin to call the domains API on, per platform. Each deployment must
 * query its OWN database (not a hardcoded NEXT_PUBLIC_SITE_URL):
 * - Vercel: the middleware runs at the edge, separate from the functions —
 *   call back through the deployment's public origin.
 * - Self-hosted Node (local dev): the same process serves the API, but
 *   request.nextUrl.origin is the bind address (e.g. https://0.0.0.0:3000),
 *   which is unreachable — loop back over plain HTTP instead.
 */
function getApiOrigin(request: NextRequest): string {
  if (process.env.VERCEL) {
    return request.nextUrl.origin
  }
  return `http://127.0.0.1:${process.env.PORT || 3000}`
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0] || ''
  const pathname = request.nextUrl.pathname

  debugLog('Request:', hostname, pathname)

  // Call existing domain resolution API (with cache), targeting this
  // deployment's own origin.
  const domainInfo = await getDomainInfo(hostname, getApiOrigin(request))

  if (domainInfo.found && domainInfo.chata) {
    // SINGLE-CHATA MODE
    const matchedSlug = domainInfo.chata.slug

    // Block access to other chatas: /{any-slug} → redirect to /
    // Match paths that look like chata slugs (lowercase letters, numbers, hyphens)
    // but not special paths like /admin, /api, /login etc.
    const SITE_PATHS = ['/', '/login', '/napoveda', '/soukromi']
    if (pathname.match(/^\/[a-z0-9-]+$/i) && !SITE_PATHS.includes(pathname)) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Set header for downstream components by modifying the request headers
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-matched-chata-slug', matchedSlug)

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  // MULTI-CHATA MODE - allow normal routing
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - admin (Payload admin)
     * - media (uploaded files)
     * - ingest (PostHog proxy — every analytics beacon would otherwise
     *   trigger a domain lookup incl. a fetch back into the deployment)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|admin|media|ingest).*)',
  ],
}
