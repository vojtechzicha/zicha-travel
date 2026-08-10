'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import posthog from 'posthog-js'
import {
  isCaptureEnvironment,
  registerAnalyticsClient,
  sanitizeUrl,
  referrerHost,
  track,
  trackPageview,
} from '@/lib/analytics'
import { readConsentCookie, resolveConsent } from '@/lib/consent'
import { CONSENT_CHANGED_EVENT } from './ConsentBanner'

/**
 * Initialises PostHog once and keeps it in sync with the consent state.
 * Renders nothing. Mounted only in the frontend layout (never /admin) and
 * only when NEXT_PUBLIC_POSTHOG_KEY is set.
 *
 * Consent model (docs/PRD-analytika.md): capture ALWAYS runs; without
 * consent PostHog's `cookieless_mode: 'on_reject'` keeps it cookieless with
 * a daily-rotating pseudonymous id, after "Povolit" it persists a stable
 * anonymous id. Real network capture happens only on Vercel production —
 * everywhere else src/lib/analytics.ts logs events to the console instead.
 */
export function AnalyticsProvider() {
  const pathname = usePathname()
  const initialised = useRef(false)

  useEffect(() => {
    if (initialised.current) return
    initialised.current = true

    if (isCaptureEnvironment()) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || '/ingest',
        ui_host: 'https://eu.posthog.com',
        // consent maps onto opt-in/out below; rejected = cookieless capture
        cookieless_mode: 'on_reject',
        cross_subdomain_cookie: true,
        // the app renders names and amounts as plain text — autocapture
        // would ship element content (PRD privacy rule 6)
        autocapture: false,
        capture_pageview: false, // manual — history rewrites would produce phantoms
        capture_pageleave: true,
        capture_exceptions: true, // $exception autocapture (phase 4)
        capture_performance: { web_vitals: true }, // $web_vitals (phase 4)
        persistence: 'localStorage+cookie',
        before_send: (event) => {
          // PRD privacy rule 4: strip identifying params from every URL-ish
          // property on every event, whatever produced it
          if (event?.properties) {
            const p = event.properties
            if (typeof p.$current_url === 'string') p.$current_url = sanitizeUrl(p.$current_url)
            if (typeof p.$referrer === 'string') p.$referrer = referrerHost(p.$referrer)
            if (typeof p.$pathname === 'string') p.$pathname = sanitizeUrl(p.$pathname)
          }
          return event
        },
      })
      registerAnalyticsClient(posthog)
      applyConsent()
    }

    // login_completed: the auth routes set a one-shot marker cookie on the
    // redirect after a successful sign-in — read it, fire, clear it
    const marker = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('zt_login_evt='))
    if (marker) {
      const method = decodeURIComponent(marker.slice('zt_login_evt='.length))
      document.cookie = 'zt_login_evt=; Max-Age=0; Path=/'
      track('login_completed', { method })
    }
  }, [])

  // consent decisions (banner) flip PostHog between persistent and
  // cookieless capture immediately — opt-out also clears its cookies
  useEffect(() => {
    const onChange = () => {
      if (isCaptureEnvironment()) applyConsent()
    }
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange)
  }, [])

  // one manual $pageview per real navigation (Next router only — the chata
  // view's history.replaceState participant switches never land here)
  useEffect(() => {
    trackPageview()
  }, [pathname])

  return null
}

function applyConsent(): void {
  const decision = resolveConsent(readConsentCookie(document.cookie), new Date())
  if (decision === 'granted') {
    if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing()
  } else {
    // denied AND undecided both mean: no cookies, cookieless capture only
    if (!posthog.has_opted_out_capturing()) posthog.opt_out_capturing()
  }
}
