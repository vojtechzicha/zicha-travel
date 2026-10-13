'use client'

import { useCallback, useEffect, useState } from 'react'
import { manualInstallGuide, type ManualInstallGuide } from '@/lib/pwa'
import { InstallGuideSheet } from './InstallGuideSheet'

/**
 * "Install the app" footer link. Two ways in, one link:
 *
 * - Chromium fires `beforeinstallprompt`; the event is kept and the click
 *   replays it as the native install dialog.
 * - WebKit never fires it (iPhone/iPad in any browser, Safari on the Mac),
 *   so there the click opens InstallGuideSheet, a walkthrough of the
 *   Share → "Add to Home Screen" / File → "Add to Dock" route. Which one,
 *   and whether at all, is `manualInstallGuide` (src/lib/pwa.ts).
 *
 * Renders nothing anywhere else, and never inside the installed app. Works
 * on chata subdomains too: their manifest routes the installed app to the
 * apex (src/lib/pwa.ts).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function runningStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function InstallAppLink({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [guide, setGuide] = useState<ManualInstallGuide | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  useEffect(() => {
    // Client-only sniff (the footer is server-rendered): decided once per
    // page load, and a later beforeinstallprompt simply takes precedence
    setGuide(
      manualInstallGuide({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: runningStandalone(),
      }),
    )
    const onBeforeInstallPrompt = (event: Event) => {
      // Keep Chrome's own mini-infobar quiet; the footer link is the entry
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstallEvent(null)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const closeGuide = useCallback(() => setGuideOpen(false), [])

  if (!installEvent && !guide) return null

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          if (installEvent) void installEvent.prompt().catch(() => {})
          else setGuideOpen(true)
        }}
      >
        {children}
      </button>
      {guideOpen && guide && <InstallGuideSheet guide={guide} onClose={closeGuide} />}
    </>
  )
}
