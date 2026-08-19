import type { Payload } from 'payload'

/**
 * Fetch-and-store for externally hosted background images (compliance-gaps
 * blocker 10, decision 9): admins keep the paste-any-URL convenience, but the
 * server downloads the image once on save and stores a copy in the site's own
 * `media` storage, so no visitor request ever reaches the external host.
 *
 * Used by the Backgrounds `beforeChange` hook and by
 * `scripts/migrate-backgrounds-selfhost.mts` (which converts pre-existing
 * rows without relying on hooks firing).
 */

/** Hard cap on the downloaded image size. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

const FETCH_TIMEOUT_MS = 30_000

export type SelfHostImageFailure =
  | 'invalid-url' // not a parseable http(s) URL
  | 'fetch-failed' // network error / timeout
  | 'bad-status' // non-2xx response
  | 'not-an-image' // content-type is not image/*
  | 'too-large' // over MAX_IMAGE_BYTES

export class SelfHostImageError extends Error {
  reason: SelfHostImageFailure
  /** Short technical detail (status code, content type, …) safe to show an admin. */
  detail: string

  constructor(reason: SelfHostImageFailure, detail: string) {
    super(`self-host image failed (${reason}): ${detail}`)
    this.name = 'SelfHostImageError'
    this.reason = reason
    this.detail = detail
  }
}

/**
 * True for absolute http(s) URLs — the ones that would make a visitor's
 * browser call an external host. Relative URLs (`/bg/mountains-1920.avif`)
 * are already self-hosted and must be left alone.
 */
export const isExternalImageUrl = (url: unknown): url is string =>
  typeof url === 'string' && /^https?:\/\//i.test(url.trim())

const EXTENSION_BY_MIMETYPE: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
}

/** Derive a storage-safe filename from the source URL and content type. */
const filenameFor = (url: URL, mimetype: string): string => {
  const rawBase = url.pathname.split('/').filter(Boolean).pop() ?? ''
  let base = rawBase.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  if (!base) base = 'background'
  const extension = EXTENSION_BY_MIMETYPE[mimetype] ?? ''
  if (extension && !base.toLowerCase().endsWith(extension)) {
    // strip a wrong/duplicate extension only when we know the real one
    base = base.replace(/\.(jpe?g|png|webp|avif|gif|svg)$/i, '') + extension
  }
  return base
}

export interface FetchedImage {
  data: Buffer
  mimetype: string
  name: string
  size: number
}

/**
 * Download an external image server-side, enforcing a 10 MB cap and an
 * image/* content-type check. Throws SelfHostImageError on any failure.
 */
export async function fetchExternalImage(rawUrl: string): Promise<FetchedImage> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new SelfHostImageError('invalid-url', rawUrl)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SelfHostImageError('invalid-url', rawUrl)
  }

  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (err) {
    throw new SelfHostImageError('fetch-failed', err instanceof Error ? err.message : String(err))
  }

  if (!res.ok) {
    res.body?.cancel().catch(() => {})
    throw new SelfHostImageError('bad-status', `HTTP ${res.status}`)
  }

  const mimetype = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!mimetype.startsWith('image/')) {
    res.body?.cancel().catch(() => {})
    throw new SelfHostImageError('not-an-image', mimetype || 'no content-type')
  }

  const declaredLength = Number(res.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    res.body?.cancel().catch(() => {})
    throw new SelfHostImageError('too-large', `${declaredLength} bytes`)
  }

  // Stream with a running cap — the content-length header may be absent or lie.
  const chunks: Uint8Array[] = []
  let received = 0
  if (res.body) {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.byteLength
      if (received > MAX_IMAGE_BYTES) {
        res.body.cancel().catch(() => {})
        throw new SelfHostImageError('too-large', `over ${MAX_IMAGE_BYTES} bytes`)
      }
      chunks.push(chunk)
    }
  }
  const data = Buffer.concat(chunks)
  if (data.length === 0) {
    throw new SelfHostImageError('fetch-failed', 'empty response body')
  }

  return { data, mimetype, name: filenameFor(url, mimetype), size: data.length }
}

/**
 * Fetch an external image and store it as a `media` document.
 * Returns the new media document's id.
 */
export async function selfHostImage(
  payload: Payload,
  { url, alt }: { url: string; alt: string },
): Promise<number> {
  const file = await fetchExternalImage(url)
  const media = await payload.create({
    collection: 'media',
    data: { alt },
    file: {
      data: file.data,
      mimetype: file.mimetype,
      name: file.name,
      size: file.size,
    },
  })
  return media.id
}
