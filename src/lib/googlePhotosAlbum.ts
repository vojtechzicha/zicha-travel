// "Momentky z alba" — pulling photo thumbnails out of the chata's shared
// Google Photos album (Chata.sharedAlbumUrl). Google retired third-party API
// access to shared albums in 2025, so the server fetches the public share
// page and reads the photo base URLs out of its embedded data instead. That
// is an unofficial path: it can stop working whenever Google changes the
// page, which is why every consumer treats "no photos" as a normal outcome
// and the widget simply doesn't render. Pure logic only — the fetch and its
// cache live in the album-photos route; unit-tested in
// tests/int/googlePhotosAlbum.int.spec.ts.

/** Hosts a shared-album link may point at. Anything else is refused before
 *  the server would fetch it — sharedAlbumUrl is admin-entered text, and the
 *  album route must never become a proxy to arbitrary hosts. */
const ALBUM_HOSTS = new Set(['photos.app.goo.gl', 'photos.google.com', 'goo.gl'])

export function isGooglePhotosAlbumUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'https:' && ALBUM_HOSTS.has(parsed.hostname)
}

// Photo base URLs sit in the share page's embedded JSON as
// https://lh3.googleusercontent.com/pw/<token>. The /pw/ prefix is what
// separates album media from avatars and other lh3 assets on the same page.
const PHOTO_URL_PATTERN = /https:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+/g

/**
 * Every distinct photo base URL on a shared-album page, in page order.
 * Returns [] for a page with no recognizable photos (empty album, or Google
 * changed the markup) — the caller shows nothing in that case.
 */
export function extractAlbumPhotoUrls(html: string, limit = 500): string[] {
  const seen = new Set<string>()
  for (const match of html.matchAll(PHOTO_URL_PATTERN)) {
    seen.add(match[0])
    if (seen.size >= limit) break
  }
  return [...seen]
}

/**
 * An even spread of `count` items across the album — first and last photo
 * included — so the strip samples the whole trip instead of showing the
 * first N shots from the arrival evening. Deterministic: the same album
 * yields the same picks until new photos land.
 */
export function pickMoments<T>(items: T[], count: number): T[] {
  if (count <= 0) return []
  if (items.length <= count) return [...items]
  if (count === 1) return [items[0]]
  const picks: T[] = []
  const step = (items.length - 1) / (count - 1)
  for (let i = 0; i < count; i++) {
    picks.push(items[Math.round(i * step)])
  }
  return picks
}

/**
 * Sized rendition of a photo base URL. Google serves the original scaled to
 * fit `width` when the URL carries a `=w<width>` suffix; without any suffix
 * it serves a tiny default, so the suffix is not optional.
 */
export function albumPhotoSrc(baseUrl: string, width: number): string {
  return `${baseUrl}=w${Math.round(width)}`
}
