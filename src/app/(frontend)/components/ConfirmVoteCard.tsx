'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Vote } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { enabledOAuthProviders, oauthLoginHref } from './oauthProviders'
import { track } from '@/lib/analytics'

// API error codes with a dedicated message under `confirm.errors.*` in
// messages/{cs,en}/planning.json — anything else falls back to a generic one.
const KNOWN_ERROR_CODES = [
  'expired',
  'invalid',
  'not-found',
  'used',
  'rate-limited',
  'superadmin_oauth',
] as const

interface ConfirmVoteCardProps {
  token: string
  voterName: string
  chataName: string
  dates: string[]
  places: string[]
  /** where the chata page lives on this host ("/" or "/<slug>") */
  pagePath: string
}

/**
 * "Potvrď svůj hlas" — the one-button card. The POST signs the voter in
 * and records the vote; on success the browser moves on to the chata page
 * where the vote (or, rarely, the dialog to finish it by hand) is waiting.
 */
export function ConfirmVoteCard({
  token,
  voterName,
  chataName,
  dates,
  places,
  pagePath,
}: ConfirmVoteCardProps) {
  const t = useTranslations('planning')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'confirmed' | 'issue' | null>(null)

  const errorText = (code: string | undefined): string => {
    if (code && (KNOWN_ERROR_CODES as readonly string[]).includes(code)) {
      return t(`confirm.errors.${code}`)
    }
    if (code) console.warn('[planning] unmapped confirm error code:', code)
    return t('confirm.errors.generic')
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/trip-votes/confirm', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        track('save_failed', { operation: 'planning_vote_confirm', status: res.status, code: data?.error })
        setError(errorText(data?.error))
        return
      }
      track('planning_vote_confirmed', {})
      const target = typeof data?.redirectTo === 'string' ? data.redirectTo : pagePath
      if (data?.confirmed) {
        setDone('confirmed')
        window.location.assign(target)
        return
      }
      setDone('issue')
      window.setTimeout(() => window.location.assign(target), 1500)
    } catch {
      setError(t('confirm.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <GlassCard padding="large" className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 text-green-600 mb-3">
          <Check size={28} />
        </div>
        <h1 className="font-serif text-2xl font-bold text-gray-900 mb-2">
          {done === 'confirmed' ? t('confirm.doneTitle') : t('confirm.issueTitle')}
        </h1>
        <p className="text-gray-600">
          {done === 'confirmed' ? t('confirm.doneBody') : t('confirm.issueBody')}
        </p>
        <a
          href={pagePath}
          className="inline-block mt-5 text-primary font-semibold text-sm hover:underline"
        >
          {t('confirm.open')}
        </a>
      </GlassCard>
    )
  }

  return (
    <GlassCard padding="large" className="w-full max-w-md">
      <div className="text-center mb-5">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-3">
          <Vote size={28} />
        </div>
        <h1 className="font-serif text-2xl font-bold text-gray-900 mb-2">{t('confirm.title')}</h1>
        <p className="text-gray-600">
          {t.rich('confirm.intro', {
            name: voterName,
            chata: chataName,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      </div>

      <div className="rounded-xl bg-white/70 border border-gray-200 px-4 py-3 flex flex-col gap-2 text-sm text-gray-800 mb-5">
        <div className="flex gap-3">
          <span className="w-24 shrink-0 text-gray-400">{t('confirm.dates')}</span>
          <span className="font-semibold">{dates.join(' · ')}</span>
        </div>
        <div className="flex gap-3">
          <span className="w-24 shrink-0 text-gray-400">{t('confirm.places')}</span>
          <span className="font-semibold">
            {places.length > 0 ? places.join(', ') : t('confirm.noPlaces')}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white
                   font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-60"
      >
        <Check size={18} aria-hidden="true" />
        {busy ? t('confirm.busy') : t('confirm.button')}
      </button>
      <p className="text-center text-gray-500 text-xs mt-3">{t('confirm.note')}</p>
    </GlassCard>
  )
}

/**
 * The way forward when the link itself is no good (expired, mangled): any
 * sign-in records the pending vote, so offer the sign-in buttons right here.
 */
export function ConfirmVoteSignIn() {
  const t = useTranslations('planning')
  const providers = enabledOAuthProviders()
  return (
    <div className="mt-5 flex flex-col gap-2">
      {providers.map((provider) => (
        <a
          key={provider.id}
          href={oauthLoginHref(provider.id, '/')}
          onClick={() => track('login_started', { method: provider.id })}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl
                     bg-white border border-gray-200 text-gray-800 font-semibold
                     hover:bg-gray-50 transition-colors"
        >
          {provider.icon}
          {t(`dialog.continueWith.${provider.labelKey}`)}
        </a>
      ))}
      <a
        href="/login"
        className="text-primary font-semibold text-sm hover:underline mt-1"
      >
        {providers.length > 0 ? t('confirm.signInEmail') : t('confirm.signIn')}
      </a>
    </div>
  )
}
