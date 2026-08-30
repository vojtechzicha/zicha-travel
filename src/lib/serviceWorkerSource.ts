/**
 * The service worker, served by /sw.js (src/app/sw.js/route.ts) with
 * Cache-Control: no-store and registered with updateViaCache: 'none', so
 * the browser re-reads it from the network on every update check — the
 * worker can never wedge itself in a stale state. The build id is baked
 * into the source, which means every deploy changes the file bytes, the
 * browser installs the new worker (skipWaiting + clients.claim take over
 * immediately) and the versioned caches of older builds are deleted on
 * activate.
 *
 * Caching strategy — deliberately allowlist-only, everything else goes
 * straight to the network:
 * - navigations: network first, cached copy as offline fallback, /offline
 *   as the last resort. Auth/decide pages and token links are never
 *   written to the cache.
 * - /_next/static: cache first (content-hashed, immutable).
 * - the chata slug API: network first with cached fallback — this is the
 *   "important data" that keeps Finance/Informace readable offline.
 * - images/fonts/media: stale-while-revalidate with an entry cap.
 * - never cached: non-GET, cross-origin, /admin, /ingest, the rest of
 *   /api (auth, version, writes), Range requests.
 * - pages and chata payloads are personalized per viewer but keyed by URL
 *   only, so any request to an auth-changing endpoint (login landings,
 *   logout) drops both caches — a signed-out or switched account can
 *   never be served the previous identity's data offline. The offline
 *   page precache lives in the static cache to survive that purge.
 *
 * Kept as a template string (not a static public/ file) so the version can
 * be embedded server-side; the source itself has no imports and runs as a
 * classic worker script.
 */
export function serviceWorkerSource(buildId: string): string {
  const version = JSON.stringify(buildId)
  return `/* zicha.travel service worker — build ${buildId} */
const VERSION = ${version}
const OFFLINE_URL = '/offline'
const PAGE_CACHE = 'zt-pages-' + VERSION
const DATA_CACHE = 'zt-data-' + VERSION
const STATIC_CACHE = 'zt-static-' + VERSION
const ASSET_CACHE = 'zt-assets-' + VERSION
const CURRENT_CACHES = [PAGE_CACHE, DATA_CACHE, STATIC_CACHE, ASSET_CACHE]
const PAGE_LIMIT = 40
const DATA_LIMIT = 20
const ASSET_LIMIT = 100

// Navigations that must never land in the cache: sign-in, one-shot token
// links, the admin panel. (They still load from the network as usual.)
const UNCACHED_PAGES = [/^\\/login/, /^\\/admin/, /^\\/expenses\\/decide/, /^\\/claims\\/decide/]

// Hitting any of these means the signed-in identity is about to change:
// sign-out, the OAuth callbacks (Microsoft at /api/auth/callback, Google
// and Apple under it), magic-link verify, and Payload's own local-strategy
// login/logout (dev fallback + admin panel). The pages and chata payloads
// cached so far belong to the PREVIOUS identity, so both caches are
// dropped — an offline fetch must never serve another account's data.
const AUTH_CHANGE_PREFIXES = [
  '/api/auth/logout',
  '/api/auth/callback',
  '/api/auth/magic-link/verify',
  '/api/users/login',
  '/api/users/logout',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch(OFFLINE_URL, { cache: 'no-cache', credentials: 'same-origin' })
        if (res.ok) {
          // The offline page carries no personal data, so it lives in the
          // static cache — the auth-change purge below must not evict it.
          const offlineStore = await caches.open(STATIC_CACHE)
          await offlineStore.put(OFFLINE_URL, res.clone())
          // Grab the CSS/JS chunks the offline page references so it renders
          // styled (and hydrates) even as the very first page served offline.
          const html = await res.text()
          const chunkUrls = [...html.matchAll(/(?:href|src)="(\\/_next\\/static\\/[^"]+)"/g)].map(
            (m) => m[1],
          )
          const statics = await caches.open(STATIC_CACHE)
          await Promise.all(
            chunkUrls.map(async (url) => {
              try {
                const chunk = await fetch(url)
                if (chunk.ok) await statics.put(url, chunk)
              } catch {
                // one missing chunk must not fail the install
              }
            }),
          )
        }
      } catch {
        // offline page precache is best-effort; runtime caching still works
      }
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('zt-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

// Belt and braces next to skipWaiting-on-install: the page can also ask a
// waiting worker to take over (used if the lifecycle ever changes).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - limit; i++) {
    await cache.delete(keys[i])
  }
}

function cacheablePage(url) {
  if (url.searchParams.has('token')) return false
  return !UNCACHED_PAGES.some((re) => re.test(url.pathname))
}

async function networkFirst(request, cacheName, limit, offlineFallback, storable) {
  try {
    const res = await fetch(request)
    if (res.ok && !res.redirected && storable) {
      const cache = await caches.open(cacheName)
      await cache.put(request, res.clone())
      trimCache(cacheName, limit)
    }
    return res
  } catch (err) {
    const cached = await caches.match(request, { ignoreSearch: false })
    if (cached) return cached
    if (offlineFallback) {
      const offline = await caches.match(OFFLINE_URL)
      if (offline) return offline
    }
    throw err
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) {
    const cache = await caches.open(cacheName)
    await cache.put(request, res.clone())
  }
  return res
}

async function staleWhileRevalidate(request, cacheName, limit) {
  const cached = await caches.match(request)
  const refresh = fetch(request)
    .then(async (res) => {
      if (res.ok && !res.redirected) {
        const cache = await caches.open(cacheName)
        await cache.put(request, res.clone())
        trimCache(cacheName, limit)
      }
      return res
    })
    .catch(() => undefined)
  if (cached) return cached
  const res = await refresh
  if (res) return res
  throw new Error('offline')
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Checked before the GET guard — the Apple OAuth callback is a POST.
  // The request itself is not intercepted, only the purge rides along.
  if (AUTH_CHANGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.waitUntil(Promise.all([caches.delete(PAGE_CACHE), caches.delete(DATA_CACHE)]))
    return
  }

  if (request.method !== 'GET' || request.headers.has('range')) return
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/ingest')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, PAGE_CACHE, PAGE_LIMIT, true, cacheablePage(url)).catch(
        () => new Response('Offline', { status: 503, statusText: 'Offline' }),
      ),
    )
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  if (url.pathname.startsWith('/api/chatas/slug/')) {
    event.respondWith(
      networkFirst(request, DATA_CACHE, DATA_LIMIT, false, true).catch(
        () => new Response(null, { status: 503, statusText: 'Offline' }),
      ),
    )
    return
  }

  if (
    url.pathname.startsWith('/_next/image') ||
    url.pathname.startsWith('/bg/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/api/media/file/') ||
    url.pathname === '/favicon.svg'
  ) {
    event.respondWith(
      staleWhileRevalidate(request, ASSET_CACHE, ASSET_LIMIT).catch(
        () => new Response(null, { status: 503, statusText: 'Offline' }),
      ),
    )
    return
  }
  // Everything else (rest of /api, uploads, beacons…) — straight to network.
})
`
}
