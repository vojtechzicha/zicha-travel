'use client'

// The banker connects their Rohlík account (endpoints in
// src/collections/ShoppingItems/rohlikEndpoints.ts). Rohlík only lets apps
// register a localhost redirect, so the login can't come back to us on its
// own: "Propojit" fetches the authorize URL (and sets the signed state
// cookie), the banker signs in on Rohlík in another tab, lands on a
// localhost address that doesn't load, and pastes that address here.

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ExternalLink, ShoppingCart } from 'lucide-react'
import { track } from '@/lib/analytics'

type ConnectError = 'start' | 'invalid-url' | 'denied' | 'expired'

const ERROR_KEYS = {
  start: 'connectErrorStart',
  'invalid-url': 'connectErrorInvalid',
  denied: 'connectErrorDenied',
  expired: 'connectErrorExpired',
} as const

interface RohlikConnectProps {
  chataId: number
  /** "Propojit s Rohlíkem" or, ahead of the connection's end, "Propojit znovu" */
  label: string
  buttonClass: string
  onConnected: () => void | Promise<void>
}

export function RohlikConnect({ chataId, label, buttonClass, onConnected }: RohlikConnectProps) {
  const t = useTranslations('shopping')
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ConnectError | null>(null)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/shopping-items/rohlik/connect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chata: chataId }),
      })
      const body = (await res.json().catch(() => ({}))) as { authorizeUrl?: string }
      if (!res.ok || !body.authorizeUrl) {
        track('save_failed', { operation: 'rohlik_connect_start', status: res.status })
        setError('start')
        return
      }
      setPasted('')
      setAuthorizeUrl(body.authorizeUrl)
    } catch {
      setError('start')
    } finally {
      setBusy(false)
    }
  }

  const finish = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!pasted.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/shopping-items/rohlik/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chata: chataId, url: pasted }),
      })
      if (!res.ok) {
        track('save_failed', { operation: 'rohlik_connect_finish', status: res.status })
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        const code = body.error
        if (code === 'invalid-url' || code === 'denied') {
          setError(code)
        } else if (code === 'expired') {
          // the state is spent: the next attempt needs a new Rohlík login
          setAuthorizeUrl(null)
          setError('expired')
        } else {
          setError('start')
        }
        return
      }
      setAuthorizeUrl(null)
      setPasted('')
      await onConnected()
    } catch {
      setError('start')
    } finally {
      setBusy(false)
    }
  }

  const errorText = error ? (
    <p role="alert" className="text-[13px] leading-relaxed text-red-600 dark:text-red-400">
      {t(ERROR_KEYS[error])}
    </p>
  ) : null

  if (!authorizeUrl) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={start} disabled={busy} className={buttonClass}>
          <ShoppingCart size={16} aria-hidden="true" />
          {busy ? t('connectBusy') : label}
        </button>
        {errorText}
      </div>
    )
  }

  return (
    <form
      onSubmit={finish}
      className="flex flex-col gap-3 rounded-xl bg-white px-4 py-4 text-[13px] leading-relaxed text-gray-700 dark:bg-white/[0.06] dark:text-slate-200"
    >
      <ol className="flex list-decimal flex-col gap-3 pl-5">
        <li>
          <p>{t('connectStep1')}</p>
          <a
            href={authorizeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 font-semibold text-primary-dark underline underline-offset-2 dark:text-primary-light"
          >
            {t('connectOpen')}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </li>
        <li>
          <p>{t('connectStep2')}</p>
          <label className="mt-2 block">
            <span className="sr-only">{t('connectPasteLabel')}</span>
            <input
              // text, not url: Safari on iPhone copies the address without
              // http://, which the browser's url validation would refuse
              type="text"
              inputMode="url"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="http://localhost/zicha-travel-rohlik?code=…"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="h-11 w-full rounded-xl border-2 border-gray-200 bg-white px-3 font-mono text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-slate-500"
            />
          </label>
        </li>
      </ol>
      {errorText}
      <button type="submit" disabled={busy || !pasted.trim()} className={buttonClass}>
        {busy ? t('connectBusy') : t('connectFinish')}
      </button>
      <button
        type="button"
        onClick={() => {
          setAuthorizeUrl(null)
          setError(null)
        }}
        className="text-center text-[12px] text-gray-500 hover:text-gray-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
      >
        {t('connectCancel')}
      </button>
    </form>
  )
}
