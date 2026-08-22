'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Check, ChevronDown, Clock, FileText, Receipt, Wallet, X } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { formatCurrency, getAvatarColor, getInitials } from '@/lib/formatCurrency'
import { track } from '@/lib/analytics'
import type { AppLocale } from '@/i18n/config'

/**
 * Everything behind "Podrobnosti" — the parts of the expense somebody needs
 * to answer "sedí to?" beyond its name and price. All of it is optional;
 * whatever the expense does not carry simply does not render.
 */
export interface DecideExpenseDetails {
  /** "zatím nezaplaceno" — a planned expense, not a payment that happened */
  isPlanned: boolean
  note?: string | null
  /** who shares it: per-person shares, or the headcount of an equal split */
  split:
    | { kind: 'equal'; names: string[]; perPerson: number }
    | { kind: 'weighted'; rows: { name: string; weight: number }[]; asAmounts: boolean }
    | null
  /** receipts, the strongest evidence there is that the sum is real */
  attachments: { id: string; url: string; isImage: boolean; label: string }[]
}

interface DecideExpenseCardProps {
  token: string
  title: string
  amount: number
  payerName: string
  authorLabel: string
  chataName: string
  createdAt: string
  splitSummary: string
  /** the payer is a joint account ("společný účet"), not a person */
  payerIsJointAccount: boolean
  /** the recipient speaks for the payer, rather than deciding as banker/admin */
  decidingAsPayer: boolean
  details: DecideExpenseDetails
}

// API error codes with a dedicated message in messages/{cs,en}/auth.json
// under `expenseDecide.card.errors.*`.
const KNOWN_ERROR_CODES = [
  'expired',
  'invalid',
  'forbidden',
  'already-decided',
  'not-found',
] as const

/**
 * "Sedí to?" — the decision card behind the approval email link for an
 * expense somebody recorded for another payer. Confirm is one click;
 * refusing may carry a reason, which is emailed to the author.
 */
export function DecideExpenseCard({
  token,
  title,
  amount,
  payerName,
  authorLabel,
  chataName,
  createdAt,
  splitSummary,
  payerIsJointAccount,
  decidingAsPayer,
  details,
}: DecideExpenseCardProps) {
  const t = useTranslations('auth')
  const locale = useLocale() as AppLocale
  const [showDetails, setShowDetails] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'approve' | 'reject' | null>(null)

  const errorText = (code: string | undefined): string => {
    if (code && (KNOWN_ERROR_CODES as readonly string[]).includes(code)) {
      return t(`expenseDecide.card.errors.${code}`)
    }
    if (code) console.warn('[expenses] unmapped decide error code:', code)
    return t('expenseDecide.card.errors.generic')
  }

  // Four ways to say the same thing: a person or a shared wallet paid, and
  // the reader either speaks for that payer or is confirming as banker/admin
  const introKey = payerIsJointAccount
    ? decidingAsPayer
      ? 'expenseDecide.card.introJointMember'
      : 'expenseDecide.card.introJoint'
    : decidingAsPayer
      ? 'expenseDecide.card.introPayer'
      : 'expenseDecide.card.intro'

  const createdAtText = new Date(createdAt).toLocaleDateString(
    locale === 'cs' ? 'cs-CZ' : 'en-GB',
    { dateStyle: 'long' },
  )

  const hasDetails =
    details.isPlanned ||
    !!details.note?.trim() ||
    details.split !== null ||
    details.attachments.length > 0

  const renderDetails = () => (
    <div className="mt-2.5 pt-2.5 border-t border-gray-200 flex flex-col gap-3 text-[13px]">
      {details.isPlanned && (
        <div className="flex items-start gap-2 text-amber-800">
          <Clock size={14} className="flex-shrink-0 mt-0.5" />
          <span>{t('expenseDecide.card.plannedNote')}</span>
        </div>
      )}

      {details.split && (
        <div>
          <div className="text-gray-500 mb-1">{t('expenseDecide.card.splitLabel')}</div>
          {details.split.kind === 'equal' ? (
            <div className="text-gray-800">
              {details.split.names.join(', ')}
              <span className="text-gray-500">
                {' · '}
                {t('expenseDecide.card.perPerson', {
                  amount: formatCurrency(details.split.perPerson, locale),
                })}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {details.split.rows.map((row) => (
                <span
                  key={row.name}
                  className="bg-gray-100 text-gray-700 px-2 py-1 rounded-md text-xs"
                >
                  {row.name}:{' '}
                  {details.split!.kind === 'weighted' && details.split!.asAmounts
                    ? formatCurrency(row.weight, locale)
                    : `${row.weight}x`}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {details.note?.trim() && (
        <div>
          <div className="text-gray-500 mb-1">{t('expenseDecide.card.noteLabel')}</div>
          <div className="text-gray-800 break-words whitespace-pre-line">{details.note.trim()}</div>
        </div>
      )}

      {details.attachments.length > 0 && (
        <div>
          <div className="text-gray-500 mb-1">{t('expenseDecide.card.receiptsLabel')}</div>
          <div className="flex flex-wrap gap-1.5">
            {details.attachments.map((att) =>
              att.isImage ? (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-14 h-14 rounded-md overflow-hidden border border-gray-200 hover:border-primary transition-colors"
                  title={att.label}
                >
                  <img
                    src={att.url}
                    alt={att.label}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </a>
              ) : (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-100 text-gray-600 hover:bg-gray-200 px-2 py-1 rounded-md flex items-center gap-1 text-xs transition-colors"
                  title={att.label}
                >
                  <FileText size={12} /> PDF
                </a>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/expenses/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, ...(action === 'reject' ? { reason } : {}) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(errorText(data?.error))
        return
      }
      track('expense_approval_decided', { action, from: 'email' })
      setDone(action)
    } catch {
      setError(t('expenseDecide.card.errors.generic'))
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
          {done === 'approve'
            ? t('expenseDecide.card.approvedTitle')
            : t('expenseDecide.card.rejectedTitle')}
        </h1>
        <p className="text-gray-600">
          {done === 'approve'
            ? t('expenseDecide.card.approvedBody', { title })
            : t('expenseDecide.card.rejectedBody')}
        </p>
      </GlassCard>
    )
  }

  return (
    <GlassCard padding="large" className="w-full max-w-md">
      <h1 className="font-serif text-2xl font-bold text-gray-900 mb-1">
        {t('expenseDecide.card.title')}
      </h1>
      <p className="text-gray-600 text-sm mb-4">
        {t.rich(introKey, {
          chataName,
          author: authorLabel,
          payer: payerName,
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      <div className="bg-white/70 border border-gray-200 rounded-xl px-4 py-3 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Receipt size={20} />
          </div>
          <div className="min-w-0 flex-1">
            {/* the title wraps rather than truncating: on this page the name of
                the thing is half of what the reader is being asked about */}
            <div className="font-semibold text-gray-900 break-words">{title}</div>
            <div className="text-xs text-gray-500">
              {createdAtText} • {splitSummary}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="font-semibold text-gray-900 whitespace-nowrap">
              {formatCurrency(amount, locale)}
            </span>
            {payerIsJointAccount ? (
              <span
                className="w-9 h-9 rounded-full bg-gray-700 text-white flex items-center justify-center"
                title={payerName}
              >
                <Wallet size={16} />
              </span>
            ) : (
              <span
                className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${getAvatarColor(payerName)}`}
                title={payerName}
              >
                {getInitials(payerName)}
              </span>
            )}
          </div>
        </div>
        {hasDetails && (
          <>
            <button
              type="button"
              onClick={() => setShowDetails((open) => !open)}
              aria-expanded={showDetails}
              className="mt-2.5 flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${showDetails ? 'rotate-180' : ''}`}
              />
              {showDetails
                ? t('expenseDecide.card.detailsHide')
                : t('expenseDecide.card.detailsShow')}
            </button>
            {showDetails && renderDetails()}
          </>
        )}
      </div>

      <div className="mb-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
        {t('expenseDecide.card.effect')}
      </div>

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
            placeholder={t('expenseDecide.card.reasonPlaceholder')}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80
                       focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                       text-gray-900 placeholder-gray-400 text-sm"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => decide('reject')}
              disabled={busy}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-3
                         rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? t('expenseDecide.card.sending') : t('expenseDecide.card.rejectConfirm')}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              disabled={busy}
              className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold
                         hover:bg-white/60 transition-colors"
            >
              {t('expenseDecide.card.back')}
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
            {busy ? t('expenseDecide.card.working') : t('expenseDecide.card.approve')}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="flex-1 bg-white border-2 border-red-200 text-red-700 font-semibold px-4 py-3
                       rounded-xl hover:bg-red-50 transition-colors"
          >
            {t('expenseDecide.card.reject')}
          </button>
        </div>
      )}

      <p className="text-center text-gray-500 text-xs mt-5">{t('expenseDecide.card.footnote')}</p>
    </GlassCard>
  )
}
