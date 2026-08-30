import { describe, it, expect } from 'vitest'
import {
  albumPhotoSrc,
  extractAlbumPhotoUrls,
  isGooglePhotosAlbumUrl,
  pickMoments,
} from '@/lib/googlePhotosAlbum'

describe('isGooglePhotosAlbumUrl', () => {
  it('accepts the share-link hosts Google hands out', () => {
    expect(isGooglePhotosAlbumUrl('https://photos.app.goo.gl/AbCd123')).toBe(true)
    expect(isGooglePhotosAlbumUrl('https://photos.google.com/share/AF1Qip?key=xyz')).toBe(true)
    expect(isGooglePhotosAlbumUrl('https://goo.gl/photos/AbCd123')).toBe(true)
  })

  it('refuses anything the server must not fetch', () => {
    // the album route fetches this URL server-side, so admin-entered text
    // must never be able to point it at an arbitrary host
    expect(isGooglePhotosAlbumUrl('https://evil.example/photos.app.goo.gl')).toBe(false)
    expect(isGooglePhotosAlbumUrl('http://photos.app.goo.gl/AbCd123')).toBe(false)
    expect(isGooglePhotosAlbumUrl('https://photos.app.goo.gl.evil.example/x')).toBe(false)
    expect(isGooglePhotosAlbumUrl('not a url')).toBe(false)
    expect(isGooglePhotosAlbumUrl('')).toBe(false)
  })
})

describe('extractAlbumPhotoUrls', () => {
  const page = `
    <html><script>AF_initDataCallback({data:[
      ["https://lh3.googleusercontent.com/pw/ABCphoto-one_x",1200,800],
      ["https://lh3.googleusercontent.com/pw/DEFphoto-two",900,1600],
      ["https://lh3.googleusercontent.com/pw/ABCphoto-one_x",1200,800],
      ["https://lh3.googleusercontent.com/a/avatar-not-a-photo",64,64]
    ]});</script></html>`

  it('finds the /pw/ photo URLs, deduplicated, in page order', () => {
    expect(extractAlbumPhotoUrls(page)).toEqual([
      'https://lh3.googleusercontent.com/pw/ABCphoto-one_x',
      'https://lh3.googleusercontent.com/pw/DEFphoto-two',
    ])
  })

  it('ignores avatars and pages with no photos', () => {
    expect(extractAlbumPhotoUrls('<html>no photos here</html>')).toEqual([])
    expect(
      extractAlbumPhotoUrls('https://lh3.googleusercontent.com/a/some-avatar'),
    ).toEqual([])
  })

  it('caps the number of extracted URLs', () => {
    const big = Array.from(
      { length: 20 },
      (_, i) => `https://lh3.googleusercontent.com/pw/photo${i}`,
    ).join(' ')
    expect(extractAlbumPhotoUrls(big, 5)).toHaveLength(5)
  })
})

describe('pickMoments', () => {
  it('returns everything when the album is small', () => {
    expect(pickMoments([1, 2, 3], 8)).toEqual([1, 2, 3])
  })

  it('spreads the picks across the whole album, ends included', () => {
    const album = Array.from({ length: 15 }, (_, i) => i)
    const picks = pickMoments(album, 4)
    expect(picks).toHaveLength(4)
    expect(picks[0]).toBe(0)
    expect(picks[picks.length - 1]).toBe(14)
    // strictly increasing — no duplicate picks from rounding
    expect([...new Set(picks)]).toEqual(picks)
  })

  it('handles the degenerate counts', () => {
    expect(pickMoments([1, 2, 3], 0)).toEqual([])
    expect(pickMoments([1, 2, 3], 1)).toEqual([1])
    expect(pickMoments([], 4)).toEqual([])
  })
})

describe('albumPhotoSrc', () => {
  it('appends the width rendition suffix', () => {
    expect(albumPhotoSrc('https://lh3.googleusercontent.com/pw/ABC', 480)).toBe(
      'https://lh3.googleusercontent.com/pw/ABC=w480',
    )
  })
})
