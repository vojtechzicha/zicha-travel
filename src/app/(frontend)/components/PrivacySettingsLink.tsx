'use client'

import type { ReactNode } from 'react'
import { OPEN_CONSENT_EVENT } from './ConsentBanner'

/**
 * Reopens the consent banner (GDPR: withdrawing consent must be as easy as
 * giving it). A tiny client island so the Footer and /soukromi can stay
 * server components; styling comes from the caller.
 */
export function PrivacySettingsLink({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className={className}
    >
      {children}
    </button>
  )
}
