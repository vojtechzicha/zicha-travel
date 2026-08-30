import type { Metadata } from 'next'
import { WifiOff } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { OfflineRetryButton } from './OfflineRetryButton'
import '../styles.css'

/**
 * Offline fallback, served by the service worker when a navigation fails
 * with nothing usable in the cache (precached at worker install — see
 * src/lib/serviceWorkerSource.ts). Rendered per-locale like any other
 * page; the worker caches whichever locale the visitor had at install
 * time. Deliberately free of data fetching: it must render even when the
 * database is unreachable.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.offline')
  return {
    title: t('title'),
    // A service-worker fallback is nothing to index.
    robots: { index: false, follow: false },
  }
}

export default async function OfflinePage() {
  const t = await getTranslations('common.offline')

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 z-0 pointer-events-none" />
      <div className="relative z-10 max-w-app mx-auto px-5 py-10 flex items-center justify-center min-h-screen">
        <div className="bg-white/95 rounded-glass-lg shadow-2xl px-8 py-10 max-w-md text-center">
          <WifiOff size={40} aria-hidden className="mx-auto text-gray-400" />
          <h1 className="font-serif text-2xl font-bold text-gray-900 mt-5">{t('title')}</h1>
          <p className="text-gray-600 mt-3 leading-relaxed">{t('body')}</p>
          <OfflineRetryButton label={t('retry')} />
        </div>
      </div>
    </div>
  )
}
