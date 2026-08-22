'use client'

// Fullscreen photo viewer for the trip gallery — same portal pattern as the
// receipt lightbox in ExpenseCard (portaled to <body>, so it carries the
// data-app-theme attribute itself). Escape closes, arrow keys and the edge
// buttons move between photos.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Media } from '@/payload-types'
import { useAppTheme } from '../utils/useAppTheme'

interface PhotoLightboxProps {
  photos: Media[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export function PhotoLightbox({ photos, index, onClose, onNavigate }: PhotoLightboxProps) {
  const t = useTranslations('trip')
  const { theme } = useAppTheme()
  const photo = photos[index]
  const hasMany = photos.length > 1

  const prev = () => onNavigate((index - 1 + photos.length) % photos.length)
  const next = () => onNavigate((index + 1) % photos.length)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (hasMany && e.key === 'ArrowLeft') prev()
      if (hasMany && e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, hasMany])

  if (!photo?.url) return null

  return createPortal(
    <div
      data-app-theme={theme}
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white/80 hover:text-white p-2"
        aria-label={t('information.photoClose')}
      >
        <X size={28} aria-hidden="true" />
      </button>
      {hasMany && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              prev()
            }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/25 text-white p-2.5 transition-colors"
            aria-label={t('information.photoPrev')}
          >
            <ChevronLeft size={26} aria-hidden="true" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 hover:bg-white/25 text-white p-2.5 transition-colors"
            aria-label={t('information.photoNext')}
          >
            <ChevronRight size={26} aria-hidden="true" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm tabular-nums">
            {index + 1} / {photos.length}
          </div>
        </>
      )}
      <img
        src={photo.url}
        alt={photo.alt || ''}
        className="max-w-full max-h-full rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  )
}
