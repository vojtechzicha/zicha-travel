'use client'

import { useEffect, useState } from 'react'

/**
 * "Install the app" footer link. Renders nothing until the browser says
 * the page is installable (beforeinstallprompt — Chromium only; Safari
 * installs through its own share menu and never fires it), then triggers
 * the native install dialog. Works on chata subdomains too: their
 * manifest routes the installed app to the apex (src/lib/pwa.ts).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export function InstallAppLink({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
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

  if (!installEvent) return null

  return (
    <button type="button" className={className} onClick={() => void installEvent.prompt().catch(() => {})}>
      {children}
    </button>
  )
}
