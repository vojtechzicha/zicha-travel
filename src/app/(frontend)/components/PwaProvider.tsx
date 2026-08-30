'use client'

import { useEffect } from 'react'

/**
 * PWA lifecycle, mounted once in the frontend layout. Two jobs:
 *
 * 1. Service worker registration with the anti-stale ritual: register
 *    /sw.js with updateViaCache: 'none' (the browser never trusts its HTTP
 *    cache for the script), then explicitly re-check for a new worker on
 *    focus/visibility and on a slow interval — the same moments UpdateHint
 *    checks the build id. The route itself serves no-store, and the worker
 *    skipWaiting()s on install, so a deploy reaches every open client
 *    within one update check. Skipped in dev and in unversioned builds
 *    (their caches could never be invalidated across deploys).
 *
 * 2. Session keepalive: a throttled POST /api/auth/refresh, which rolls
 *    the session cookie forward so an installed app that is opened now and
 *    then stays signed in (see src/lib/auth/sessionRefresh.ts). Runs
 *    whether or not service workers exist — long-lived login is not tied
 *    to the install.
 */

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? null
const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000
/** Focus + visibilitychange can fire together; don't burst update checks. */
const SW_UPDATE_DEBOUNCE_MS = 5 * 60 * 1000
const SESSION_PING_KEY = 'zt_session_refreshed_at'
const SESSION_PING_MIN_GAP_MS = 6 * 60 * 60 * 1000

export function PwaProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!BUILD_ID || BUILD_ID === 'unversioned') return
    if (!('serviceWorker' in navigator)) return

    let registration: ServiceWorkerRegistration | null = null
    let lastCheck = Date.now()

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        registration = reg
      })
      .catch(() => {
        // Registration failing (private mode, storage pressure) just means
        // no offline support this visit — the site works as before.
      })

    const check = () => {
      if (!registration || document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastCheck < SW_UPDATE_DEBOUNCE_MS) return
      lastCheck = now
      registration.update().catch(() => {})
    }
    const intervalId = setInterval(check, SW_UPDATE_INTERVAL_MS)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  useEffect(() => {
    // Throttled across tabs via localStorage; anonymous visitors get a 401
    // and the same throttle. localStorage can throw (private mode) — then
    // the ping simply runs each load, which the endpoint shrugs off.
    let last = 0
    try {
      last = Number(window.localStorage.getItem(SESSION_PING_KEY)) || 0
    } catch {
      // unreadable storage — treat as never pinged
    }
    if (Date.now() - last < SESSION_PING_MIN_GAP_MS) return
    try {
      window.localStorage.setItem(SESSION_PING_KEY, String(Date.now()))
    } catch {
      // unwritable storage — ping anyway
    }
    fetch('/api/auth/refresh', { method: 'POST' }).catch(() => {})
  }, [])

  return null
}
