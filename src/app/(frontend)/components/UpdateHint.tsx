'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw, X } from 'lucide-react'

/**
 * Post-deploy refresh hint. A tab left open across a deploy keeps running
 * the old bundle: it can miss fields added since, break on renamed chunk
 * files, or save expenses with stale composer logic. This component compares
 * the build id inlined into this bundle (see next.config.mjs) against
 * GET /api/version, and when they diverge shows a persistent toast asking
 * the user to refresh.
 *
 * Checks run when the tab regains focus or becomes visible again — the exact
 * moment someone returns to a long-lived tab — plus a slow background
 * interval. A fresh page load is by definition current, so there is no check
 * on mount. Dismissing hides the hint for that server build only; a later
 * deploy brings it back.
 *
 * Rendered as a direct child of <body> in the frontend layout, like the
 * ConsentBanner (and like it, deliberately light-on-white in both themes —
 * it sits outside the ChataView wrapper that carries `data-app-theme`).
 * Raised above the Finance FAB and centered, so it covers neither the FAB
 * (bottom right) nor the consent banner (bottom left / bottom sheet).
 */

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? null
const CHECK_INTERVAL_MS = 5 * 60 * 1000
/** Minimum gap between checks, so focus + visibilitychange firing together
 *  (or rapid tab switching) don't burst requests. */
const CHECK_DEBOUNCE_MS = 30 * 1000

export function UpdateHint() {
  const t = useTranslations('common.updateHint')
  const [serverBuildId, setServerBuildId] = useState<string | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  useEffect(() => {
    // 'unversioned' means the build had no git commit to derive an id from
    // (see next.config.mjs) — comparisons would be meaningless, so don't poll.
    if (!CLIENT_BUILD_ID || CLIENT_BUILD_ID === 'unversioned') return
    let cancelled = false
    let lastCheck = 0

    const check = async () => {
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastCheck < CHECK_DEBOUNCE_MS) return
      lastCheck = now
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { buildId?: string | null }
        if (!cancelled && data.buildId) setServerBuildId(data.buildId)
      } catch {
        // Offline or transient failure — the next trigger tries again.
      }
    }

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const intervalId = setInterval(check, CHECK_INTERVAL_MS)
    window.addEventListener('focus', onFocusOrVisible)
    document.addEventListener('visibilitychange', onFocusOrVisible)
    return () => {
      cancelled = true
      clearInterval(intervalId)
      window.removeEventListener('focus', onFocusOrVisible)
      document.removeEventListener('visibilitychange', onFocusOrVisible)
    }
  }, [])

  const stale =
    serverBuildId !== null && serverBuildId !== CLIENT_BUILD_ID && serverBuildId !== dismissedId
  if (!stale) return null

  return (
    <div
      role="alert"
      className="fixed z-50 left-1/2 -translate-x-1/2 w-[calc(100vw-2.5rem)] max-w-md
                 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]
                 flex items-center gap-3
                 bg-white/95 backdrop-blur-md shadow-2xl rounded-glass
                 px-4 py-3 motion-safe:animate-slideUp"
    >
      <span className="text-[14px] leading-snug text-gray-700">{t('message')}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[14px] font-semibold
                   bg-primary hover:bg-primary-dark text-white transition-colors"
      >
        <RefreshCw size={14} aria-hidden />
        {t('refresh')}
      </button>
      <button
        type="button"
        aria-label={t('dismiss')}
        title={t('dismiss')}
        onClick={() => setDismissedId(serverBuildId)}
        className="shrink-0 p-1 text-gray-400 hover:text-gray-700 transition-colors"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
