import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// In-memory cache for domain lookups (5 minute TTL)
const domainCache = new Map<string, { data: DomainInfo; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface DomainInfo {
  found: boolean
  chata?: {
    id: number
    name: string
    slug: string
    location: string
  }
}

async function getDomainInfo(hostname: string, origin: string): Promise<DomainInfo> {
  const cached = domainCache.get(hostname)
  if (cached && cached.expires > Date.now()) {
    console.log('[Middleware] Cache hit for:', hostname, cached.data)
    return cached.data
  }

  try {
    const url = `${origin}/api/domains/${encodeURIComponent(hostname)}`
    console.log('[Middleware] Fetching:', url)
    const response = await fetch(url)
    console.log('[Middleware] Response status:', response.status)
    if (!response.ok) {
      console.log('[Middleware] Response not OK')
      return { found: false }
    }
    const data = await response.json()
    console.log('[Middleware] Domain info:', data)
    domainCache.set(hostname, { data, expires: Date.now() + CACHE_TTL })
    return data
  } catch (error) {
    console.log('[Middleware] Error:', error)
    return { found: false }
  }
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0] || ''
  const pathname = request.nextUrl.pathname

  console.log('[Middleware] Request:', hostname, pathname)

  // Call existing domain resolution API (with cache)
  const domainInfo = await getDomainInfo(hostname, request.nextUrl.origin)

  if (domainInfo.found && domainInfo.chata) {
    // SINGLE-CHATA MODE
    const matchedSlug = domainInfo.chata.slug

    // Block access to other chatas: /{any-slug} → redirect to /
    // Match paths that look like chata slugs (lowercase letters, numbers, hyphens)
    // but not special paths like /admin, /api, etc.
    if (pathname.match(/^\/[a-z0-9-]+$/i) && pathname !== '/') {
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
     */
    '/((?!api|_next/static|_next/image|favicon.ico|admin|media).*)',
  ],
}
