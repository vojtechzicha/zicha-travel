import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import config from '@payload-config'
import { getPayload } from 'payload'
import {
  albumRedirectTarget,
  extractAlbumPhotoUrls,
  isGooglePhotosAlbumUrl,
} from '@/lib/googlePhotosAlbum'

// How long a parsed album is served before the share page is fetched again.
// During a trip new photos show up within a few hours; between trips the
// album barely changes, so anything in that order of magnitude is fine.
const ALBUM_REVALIDATE_SECONDS = 6 * 60 * 60

// One fetch of the share page per album per revalidate window, whoever asks
// (Vercel's data cache is shared across lambdas — a module-level Map would
// not be). The page HTML is megabytes, so only the parsed URL list is
// cached; the fetch itself must opt out of the fetch cache (no-store) or
// Next would try to cache the oversized HTML response too.
// Share links redirect (goo.gl → photos.app.goo.gl → photos.google.com),
// but `redirect: 'follow'` would apply the host allowlist to the FIRST URL
// only — a goo.gl short link can point anywhere, so each hop is validated
// (albumRedirectTarget) before it is fetched.
const MAX_REDIRECT_HOPS = 5

async function fetchAlbumPage(albumUrl: string): Promise<string | null> {
  let url = albumUrl
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const response = await fetch(url, {
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        // Google serves the full share page to browsers; the default
        // node-fetch UA can get a stripped-down variant with no photo data
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'cs,en;q=0.8',
      },
    })
    if (response.status >= 300 && response.status < 400) {
      const next = albumRedirectTarget(response.headers.get('location'), url)
      if (!next) return null
      url = next
      continue
    }
    if (!response.ok) return null
    return response.text()
  }
  return null
}

const cachedAlbumPhotoUrls = unstable_cache(
  async (albumUrl: string): Promise<string[]> => {
    const html = await fetchAlbumPage(albumUrl)
    return html === null ? [] : extractAlbumPhotoUrls(html)
  },
  ['google-photos-album'],
  { revalidate: ALBUM_REVALIDATE_SECONDS },
)

/**
 * GET /api/chatas/:id/album-photos
 * Photo base URLs from the chata's shared Google Photos album, for the
 * "Momentky z alba" strip. Signed-in viewers only — the anonymous
 * (indexable) render deliberately stays photo-free, same reasoning as the
 * participant names. Every failure mode returns an empty list: the widget
 * hides itself and the page carries on with the plain album link.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const payload = await getPayload({ config })

    const { user } = await payload.auth({ headers: request.headers })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const chata = await payload
      .findByID({
        collection: 'chatas',
        id,
        depth: 0,
        context: { triggerAfterRead: false },
      })
      .catch(() => null)
    if (!chata) {
      return NextResponse.json({ error: 'No chata found with this id' }, { status: 404 })
    }

    const albumUrl = chata.sharedAlbumUrl
    // Host allowlist, not just "is a URL": this route fetches the value
    // server-side, and admin-entered text must never point it anywhere but
    // Google's share pages
    if (!albumUrl || !isGooglePhotosAlbumUrl(albumUrl)) {
      return NextResponse.json({ photos: [] })
    }

    const photos = await cachedAlbumPhotoUrls(albumUrl).catch(() => [])
    return NextResponse.json(
      { photos },
      { headers: { 'Cache-Control': 'private, max-age=3600' } },
    )
  } catch (error) {
    console.error('Error loading shared album photos:', error)
    return NextResponse.json({ photos: [] })
  }
}
