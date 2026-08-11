'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Check, X } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import type { AppLocale } from '@/i18n/config'

interface DecideClaimCardProps {
  token: string
  participantName: string
  chataName: string
  requesterEmail: string
  requestedAt: string
  otherPendingCount: number
  requesterLinkedCount: number
  /** approving replaces an admin-created, never-used account link */
  replacesInactiveAccount: boolean
}

// API error codes with a dedicated message in messages/{cs,en}/auth.json
// under `decide.card.errors.*` — anything else falls back to a generic one.
const KNOWN_ERROR_CODES = [
  'expired',
  'invalid',
  'forbidden',
  'already-decided',
  'conflict',
  'reason-required',
  'not-found',
] as const

/**
 * "Někdo říká, že je Katka" — the admin decision card. Approve is one
 * click; reject asks for a mandatory reason that is emailed to the
 * requester.
 */
export function DecideClaimCard({
  token,
  participantName,
  chataName,
  requesterEmail,
  requestedAt,
  otherPendingCount,
  requesterLinkedCount,
  replacesInactiveAccount,
}: DecideClaimCardProps) {
  const t = useTranslations('auth')
  const locale = useLocale() as AppLocale
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'approve' | 'reject' | null>(null)

  // Translate a known API error code; unknown codes get a generic localized
  // message (the raw code is only logged — never rendered to the user).
  const errorText = (code: string | undefined): string => {
    if (code && (KNOWN_ERROR_CODES as readonly string[]).includes(code)) {
      return t(`decide.card.errors.${code}`)
    }
    if (code) console.warn('[auth] unmapped decide error code:', code)
    return t('decide.card.errors.generic')
  }

  const requestedAtText = new Date(requestedAt).toLocaleString(
    locale === 'cs' ? 'cs-CZ' : 'en-GB',
    {
      dateStyle: 'long',
      timeStyle: 'short',
    }
  )

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/claim-requests/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, ...(action === 'reject' ? { reason } : {}) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(errorText(data?.error))
        return
      }
      setDone(action)
    } catch {
      setError(t('decide.card.errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <GlassCard padding="large" className="w-full max-w-md text-center">
        <div
          className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-4 ${
            done === 'approve' ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-500'
          }`}
        >
          {done === 'approve' ? <Check size={28} /> : <X size={28} />}
        </div>
        <h1 className="font-serif text-2xl font-bold text-gray-900 mb-2">
          {done === 'approve' ? t('decide.card.approvedTitle') : t('decide.card.rejectedTitle')}
        </h1>
        <p className="text-gray-600">
          {done === 'approve'
            ? t('decide.card.approvedBody', { name: participantName, email: requesterEmail })
            : t('decide.card.rejectedBody')}
        </p>
      </GlassCard>
    )
  }

  return (
    <GlassCard padding="large" className="w-full max-w-md">
      <h1 className="font-serif text-2xl font-bold text-gray-900 mb-1">
        {t('decide.card.title', { name: participantName })}
      </h1>
      <p className="text-gray-600 text-sm mb-4">
        {t.rich('decide.card.intro', {
          chataName,
          email: requesterEmail,
          linkedCount: requesterLinkedCount,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      <div className="flex items-center gap-3 bg-white/70 border border-gray-200 rounded-xl px-4 py-3 mb-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${getAvatarColor(participantName)}`}
        >
          {getInitials(participantName)}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 truncate">
            {participantName} → {requesterEmail}
          </div>
          <div className="text-xs text-gray-500">
            {t('decide.card.requestMeta', { date: requestedAtText })} •{' '}
            {t('decide.card.otherPending', { count: otherPendingCount })}
          </div>
        </div>
      </div>

      {replacesInactiveAccount && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {t('decide.card.replacesInactive')}
        </div>
      )}

      {error && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {rejecting ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t('decide.card.reasonPlaceholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80
                       focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                       text-gray-900 placeholder-gray-400 text-sm"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => decide('reject')}
              disabled={busy || !reason.trim()}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-3
                         rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? t('decide.card.sending') : t('decide.card.rejectWithReason')}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              disabled={busy}
              className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold
                         hover:bg-white/60 transition-colors"
            >
              {t('decide.card.back')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => decide('approve')}
            disabled={busy}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-3
                       rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? t('decide.card.working') : t('decide.card.approve')}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="flex-1 bg-white border-2 border-red-200 text-red-700 font-semibold px-4 py-3
                       rounded-xl hover:bg-red-50 transition-colors"
          >
            {t('decide.card.reject')}
          </button>
        </div>
      )}

      <p className="text-center text-gray-500 text-xs mt-5">{t('decide.card.footnote')}</p>
    </GlassCard>
  )
}
