'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Check, ChartNoAxesColumn } from 'lucide-react'
import {
  consentCookieString,
  readConsentCookie,
  resolveConsent,
  type ConsentDecision,
} from '@/lib/consent'

/** Fired by PrivacySettingsLink (footer, /soukromi) to reopen the banner. */
export const OPEN_CONSENT_EVENT = 'zt:open-consent'

/** Fired after a decision is stored — AnalyticsProvider flips PostHog
 *  between persistent and cookieless capture on it. */
export const CONSENT_CHANGED_EVENT = 'zt:consent-changed'

interface ConsentBannerProps {
  /** SESSION_COOKIE_DOMAIN, passed from the server layout — one decision
   *  covers the apex and every chata subdomain. Unset = host-only cookie. */
  cookieDomain?: string
  /** The decision resolved server-side from the request's cookie, so the
   *  banner is part of the first server-rendered paint — client-only
   *  mounting made it pop in seconds late on cold loads (hydration). */
  initialDecision: ConsentDecision | null
}

/**
 * The cookie-consent banner (docs/PRD-analytika.md). Non-modal on purpose:
 * no overlay, no focus trap — the chata content must stay readable and
 * usable underneath. Rendered as a direct child of <body> in the layout
 * (NOT portaled — a portal cannot server-render, and there is no ancestor
 * `backdrop-filter` to clip the fixed positioning at that level).
 */
export function ConsentBanner({ cookieDomain, initialDecision }: ConsentBannerProps) {
  const t = useTranslations('common.consent')
  const [open, setOpen] = useState(initialDecision === null)
  const [current, setCurrent] = useState<ConsentDecision | null>(initialDecision)

  // Re-check on the client after hydration: the server verdict may be stale
  // (decision made in another tab, cookie expired between render and now).
  useEffect(() => {
    const decision = resolveConsent(readConsentCookie(document.cookie), new Date())
    setCurrent(decision)
    if (decision === null) setOpen(true)
  }, [])

  // "Nastavení soukromí" in the footer / on /soukromi reopens the banner
  // with the current choice marked — withdrawing must be as easy as giving.
  useEffect(() => {
    const reopen = () => {
      setCurrent(resolveConsent(readConsentCookie(document.cookie), new Date()))
      setOpen(true)
    }
    window.addEventListener(OPEN_CONSENT_EVENT, reopen)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen)
  }, [])

  const decide = useCallback(
    (decision: ConsentDecision) => {
      document.cookie = consentCookieString(decision, new Date(), {
        domain: cookieDomain,
        secure: window.location.protocol === 'https:',
      })
      setCurrent(decision)
      setOpen(false)
      window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT))
    },
    [cookieDomain],
  )

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label={t('title')}
      className="fixed z-50 inset-x-0 bottom-0 sm:inset-x-auto sm:left-5 sm:bottom-5 sm:max-w-sm
                 bg-white/95 backdrop-blur-md shadow-2xl
                 rounded-t-[28px] sm:rounded-glass-lg
                 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-5
                 motion-safe:animate-slideUp"
    >
      <h2 className="flex items-center gap-2.5 font-serif text-lg font-bold text-gray-900 mb-2">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
          <ChartNoAxesColumn size={18} />
        </span>
        {t('title')}
      </h2>
      <p className="text-[14px] leading-relaxed text-gray-600 mb-4">{t('body')}</p>
      {/* Equal prominence is a legal requirement, not a style choice: both
          buttons keep the same size and visual weight, reject included. */}
      <div className="grid grid-cols-2 gap-3">
        <DecisionButton
          label={t('allow')}
          isCurrent={current === 'granted'}
          onClick={() => decide('granted')}
          className="bg-primary hover:bg-primary-dark text-white"
        />
        <DecisionButton
          label={t('essentialOnly')}
          isCurrent={current === 'denied'}
          onClick={() => decide('denied')}
          className="bg-slate-700 hover:bg-slate-800 text-white"
        />
      </div>
      <Link
        href="/soukromi"
        className="inline-block mt-3 text-[13px] text-gray-500 underline underline-offset-2 hover:text-gray-800 transition-colors"
      >
        {t('morePrivacy')}
      </Link>
    </div>
  )
}

function DecisionButton({
  label,
  isCurrent,
  onClick,
  className,
}: {
  label: string
  /** marks the stored choice when the banner is reopened from the footer */
  isCurrent: boolean
  onClick: () => void
  className: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isCurrent}
      className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-[15px] font-semibold
                  transition-colors ${className} ${isCurrent ? 'ring-2 ring-offset-2 ring-primary-light' : ''}`}
    >
      {isCurrent && <Check size={16} aria-hidden />}
      {label}
    </button>
  )
}
