'use client'

// "Momentky z alba" — a strip of photos pulled from the chata's shared
// Google Photos album (docs: CLAUDE.md, "Shared album"). The thumbnails are
// hotlinked straight from Google; the server only hands over the photo URLs
// (album-photos route, signed-in viewers only) so the anonymous render stays
// photo-free. The strip is a teaser next to the album link, not a
// replacement for the album — and because the URLs come from parsing
// Google's share page, any failure just means the strip doesn't render.

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { albumPhotoSrc, pickMoments } from '@/lib/googlePhotosAlbum'
import { PhotoLightbox } from './PhotoLightbox'
import { SheetHeading } from './SheetUi'

const MOMENT_COUNT = 8
const THUMB_WIDTH = 480
const LIGHTBOX_WIDTH = 2048

interface AlbumMomentsProps {
  chataId: number
  albumUrl: string
}

export function AlbumMoments({ chataId, albumUrl }: AlbumMomentsProps) {
  const t = useTranslations('trip')
  const [photos, setPhotos] = useState<string[]>([])
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/chatas/${chataId}/album-photos`, { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return
        const urls = Array.isArray(data?.photos)
          ? data.photos.filter((url: unknown): url is string => typeof url === 'string')
          : []
        setPhotos(pickMoments(urls, MOMENT_COUNT))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [chataId])

  if (photos.length === 0) return null

  return (
    <div>
      <SheetHeading
        icon={Sparkles}
        title={t('information.albumMomentsTitle')}
        aside={
          <a
            href={albumUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-dark dark:text-primary-light font-semibold hover:underline"
          >
            {t('information.albumMomentsLink')} →
          </a>
        }
      />
      <div className="grid gap-2 grid-cols-4 md:grid-cols-8">
        {photos.map((base, idx) => (
          <button
            key={base}
            type="button"
            onClick={() => setLightboxIdx(idx)}
            className="rounded-xl overflow-hidden border border-gray-200 dark:border-white/[0.07] group cursor-zoom-in hover:shadow-lg dark:hover:border-white/[0.15] transition-shadow"
            aria-label={t('information.photoOpen')}
          >
            <img
              src={albumPhotoSrc(base, THUMB_WIDTH)}
              alt={t('information.albumMomentAlt', { number: idx + 1 })}
              loading="lazy"
              className="w-full h-20 md:h-24 object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>
      {lightboxIdx !== null && (
        <PhotoLightbox
          photos={photos.map((base, idx) => ({
            url: albumPhotoSrc(base, LIGHTBOX_WIDTH),
            alt: t('information.albumMomentAlt', { number: idx + 1 }),
          }))}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onNavigate={setLightboxIdx}
        />
      )}
    </div>
  )
}
