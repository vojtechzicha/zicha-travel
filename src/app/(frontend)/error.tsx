'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { RotateCcw } from 'lucide-react'
import { reportException } from '@/lib/analytics'

/**
 * Frontend error boundary: a crash on someone's phone used to be invisible —
 * now it reports $exception (production only; the console elsewhere) and
 * offers a retry instead of a white page.
 */
export default function FrontendError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('common.error')

  useEffect(() => {
    reportException(error)
  }, [error])

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
      <div className="relative z-10 max-w-app mx-auto px-5 py-24 text-center text-white">
        <h1 className="font-serif text-4xl font-black mb-3 text-shadow-heading">{t('title')}</h1>
        <p className="text-white/80 mb-8 text-shadow-subheading">{t('message')}</p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white
                     font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          <RotateCcw size={18} />
          {t('retry')}
        </button>
      </div>
    </div>
  )
}
