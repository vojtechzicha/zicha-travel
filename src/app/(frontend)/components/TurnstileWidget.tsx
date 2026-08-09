'use client'

import { useEffect, useRef } from 'react'

// Cloudflare Turnstile widget (explicit rendering). Renders nothing when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset (local dev) — the server then
// skips verification too (src/lib/turnstile.ts).

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      appearance?: 'always' | 'execute' | 'interaction-only'
      size?: 'normal' | 'compact' | 'flexible'
    },
  ) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SCRIPT_ID = 'cf-turnstile-script'

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''

function ensureScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile)
      return
    }
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script')
      script.id = SCRIPT_ID
      script.src = SCRIPT_SRC
      script.async = true
      script.onerror = () => reject(new Error('Turnstile script failed to load'))
      document.head.appendChild(script)
    }
    // The script may already be loading (another widget) — poll for the API
    const startedAt = Date.now()
    const poll = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(poll)
        resolve(window.turnstile)
      } else if (Date.now() - startedAt > 15000) {
        window.clearInterval(poll)
        reject(new Error('Turnstile script did not initialize'))
      }
    }, 100)
  })
}

interface TurnstileWidgetProps {
  /** fresh token, or null when it expired/errored — tokens are single-use */
  onToken: (token: string | null) => void
  /** "interaction-only": invisible unless Cloudflare wants a challenge */
  appearance?: 'always' | 'interaction-only'
  /** bump to force a fresh token (after every submit — tokens are one-shot) */
  resetSignal?: number
  className?: string
}

export function TurnstileWidget({
  onToken,
  appearance = 'always',
  resetSignal = 0,
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!turnstileSiteKey) return
    let cancelled = false
    ensureScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetIdRef.current !== null) return
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: turnstileSiteKey,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
          appearance,
          size: 'flexible',
        })
      })
      .catch(() => onTokenRef.current(null))
    return () => {
      cancelled = true
      if (widgetIdRef.current !== null) {
        window.turnstile?.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [appearance])

  // Tokens are single-use: the parent bumps resetSignal after each submit
  useEffect(() => {
    if (resetSignal > 0 && widgetIdRef.current !== null) {
      onTokenRef.current(null)
      window.turnstile?.reset(widgetIdRef.current)
    }
  }, [resetSignal])

  if (!turnstileSiteKey) return null
  return <div ref={containerRef} className={className} />
}
