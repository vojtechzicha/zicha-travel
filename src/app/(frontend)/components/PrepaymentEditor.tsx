'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { Calendar, X } from 'lucide-react'
import { formatCurrency } from '@/lib/formatCurrency'
import { track } from '@/lib/analytics'
import { getPayerDisplay } from '@/lib/payerRef'
import { isOutgoingType, signedPrepaymentAmount, type PrepaymentType } from '@/lib/prepayments'
import { useAppTheme } from '../utils/useAppTheme'
import type { AppLocale } from '@/i18n/config'
import type { Chata, JointAccount, Participant, Prepayment } from '@/payload-types'

// "Zapsat platbu": the banker (or a chata admin) records money that moved
// between a person and the banker, without the admin panel. A positive
// amount plus the type; the sign is the type's (src/lib/prepayments.ts) and
// the Prepayments hook re-checks who writes. Portaled to <body>, so the
// overlay sets data-app-theme itself.

/** Prefill when opened from a settlement row ("Přišlo" / "Posláno"). */
export interface PrepaymentPrefill {
  participantId?: number
  type?: PrepaymentType
  amount?: number
}

interface PrepaymentEditorProps {
  chata: Chata
  participants: Participant[]
  jointAccounts: JointAccount[]
  bankerId: number | null
  /** null = a new payment */
  prepayment: Prepayment | null
  prefill?: PrepaymentPrefill
  debtors: Array<{ name: string; amount: number }>
  creditors: Array<{ name: string; amount: number }>
  onClose: () => void
  onSaved: () => Promise<void> | void
}

const FIELD_CLASS =
  'w-full border border-gray-200 rounded-xl px-3.5 py-3 text-[15px] text-gray-900 bg-white dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary'
const LABEL_CLASS = 'block text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-1.5'

const toDateInput = (value: string | Date): string => {
  const d = typeof value === 'string' ? new Date(value) : value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "participants:12" / "joint-accounts:3" — one select for both kinds. */
const senderKey = (ref: Prepayment['from']): string => {
  if (!ref) return ''
  const info = getPayerDisplay(ref)
  if (info.id === null) return ''
  return `${info.kind === 'jointAccount' ? 'joint-accounts' : 'participants'}:${info.id}`
}

export function PrepaymentEditor({
  chata,
  participants,
  jointAccounts,
  bankerId,
  prepayment,
  prefill,
  debtors,
  creditors,
  onClose,
  onSaved,
}: PrepaymentEditorProps) {
  const t = useTranslations('finance.prepayments')
  const locale = useLocale() as AppLocale
  const { theme } = useAppTheme()

  const [type, setType] = useState<PrepaymentType>(prepayment?.type ?? prefill?.type ?? 'advance')
  const [sender, setSender] = useState<string>(
    prepayment
      ? senderKey(prepayment.from)
      : prefill?.participantId != null
        ? `participants:${prefill.participantId}`
        : '',
  )
  const [amountText, setAmountText] = useState<string>(
    prepayment
      ? String(Math.round(Math.abs(prepayment.amount)))
      : prefill?.amount != null
        ? String(Math.round(prefill.amount))
        : '',
  )
  const [dateStr, setDateStr] = useState(toDateInput(prepayment?.createdAt ?? new Date()))
  const [note, setNote] = useState(prepayment?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The banker's own payment to the pot is pot-internal, so the banker is
  // left out of the picker (unless an existing row already names them)
  const people = useMemo(
    () =>
      participants.filter(
        (p) => p.id !== bankerId || sender === `participants:${p.id}`,
      ),
    [participants, bankerId, sender],
  )

  // "distribution" is a legacy admin type: offered only to keep such a row
  const types: PrepaymentType[] =
    prepayment?.type === 'distribution'
      ? ['advance', 'supplement', 'refund', 'distribution']
      : ['advance', 'supplement', 'refund']
  const outgoing = isOutgoingType(type)

  // One tap for the whole open balance of the chosen person: their debt for
  // money coming in, their overpayment for a refund
  const selectedParticipant = sender.startsWith('participants:')
    ? participants.find((p) => `participants:${p.id}` === sender)
    : undefined
  const openBalance = selectedParticipant
    ? (outgoing ? creditors : debtors).find((row) => row.name === selectedParticipant.name)
    : undefined
  const openAmount = openBalance ? Math.round(openBalance.amount) : null

  const amount = /^\d+$/.test(amountText) ? Number(amountText) : null

  const save = async () => {
    if (!sender) return setError(t('errors.person'))
    if (!amount) return setError(t('errors.amount'))
    setSaving(true)
    setError(null)
    // keep the original time of day; new payments stamp "now"
    const baseDate = prepayment ? new Date(prepayment.createdAt) : new Date()
    const [y, m, d] = dateStr.split('-').map(Number)
    if (y && m && d) baseDate.setFullYear(y, m - 1, d)
    const [relationTo, value] = sender.split(':')
    const body = {
      chata: chata.id,
      from: { relationTo, value: Number(value) },
      type,
      amount: signedPrepaymentAmount(type, amount),
      note: note.trim() || null,
      createdAt: baseDate.toISOString(),
    }
    try {
      const res = await fetch(prepayment ? `/api/prepayments/${prepayment.id}` : '/api/prepayments', {
        method: prepayment ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        track('save_failed', { operation: prepayment ? 'prepayment_update' : 'prepayment_create', status: res.status })
        setError(res.status === 403 ? t('errors.forbidden') : t('errors.generic'))
        return
      }
      await onSaved()
    } catch {
      setError(t('errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!prepayment) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/prepayments/${prepayment.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        track('save_failed', { operation: 'prepayment_delete', status: res.status })
        setError(res.status === 403 ? t('errors.forbidden') : t('errors.generic'))
        return
      }
      await onSaved()
    } catch {
      setError(t('errors.generic'))
    } finally {
      setSaving(false)
    }
  }

  const heading = prepayment ? t('titleEdit') : t('titleNew')

  return createPortal(
    <div
      data-app-theme={theme}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => !saving && onClose()} />
      <div className="relative bg-white dark:bg-[#1b212c] dark:border dark:border-white/[0.06] rounded-t-[28px] sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[92vh] flex flex-col overflow-hidden animate-slideUp sm:animate-none">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/[0.07] flex-shrink-0">
          <h2 className="font-serif text-[22px] font-bold text-gray-900 dark:text-gray-100">{heading}</h2>
          <button
            type="button"
            aria-label={t('close')}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-white/[0.07] dark:hover:bg-white/[0.1] dark:text-slate-400 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* type */}
          <div>
            <div
              role="radiogroup"
              aria-label={t('typeLabel')}
              className={`grid gap-1 p-1 rounded-xl bg-gray-100 dark:bg-white/[0.06] ${types.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}
            >
              {types.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={type === option}
                  onClick={() => setType(option)}
                  className={`rounded-lg px-2 py-2 text-sm font-semibold leading-tight transition-colors ${
                    type === option
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-white/[0.14] dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {t(`types.${option}`)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">{t(`hints.${type}`)}</p>
          </div>

          {/* who */}
          <div>
            <label htmlFor="prepayment-person" className={LABEL_CLASS}>
              {outgoing ? t('toLabel') : t('fromLabel')}
            </label>
            <select
              id="prepayment-person"
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">{t('pickPerson')}</option>
              {people.map((p) => (
                <option key={p.id} value={`participants:${p.id}`}>
                  {p.name}
                </option>
              ))}
              {jointAccounts.length > 0 && (
                <optgroup label={t('jointAccounts')}>
                  {jointAccounts.map((ja) => (
                    <option key={ja.id} value={`joint-accounts:${ja.id}`}>
                      {ja.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* amount + date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="prepayment-amount" className={LABEL_CLASS}>
                {t('amountLabel')}
              </label>
              <div className="relative">
                <input
                  id="prepayment-amount"
                  type="text"
                  inputMode="numeric"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="0"
                  className={`${FIELD_CLASS} pr-10 text-lg font-bold`}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-slate-500 pointer-events-none">
                  {t('currencySuffix')}
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="prepayment-date" className={LABEL_CLASS}>
                {t('dateLabel')}
              </label>
              <div className="relative">
                <Calendar
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none"
                />
                <input
                  id="prepayment-date"
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className={`${FIELD_CLASS} pl-9 dark:[color-scheme:dark]`}
                />
              </div>
            </div>
          </div>
          {openAmount != null && openAmount !== amount && (
            <button
              type="button"
              onClick={() => setAmountText(String(openAmount))}
              className="-mt-2 self-start rounded-full border border-primary/30 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5 dark:text-primary-light dark:border-primary-light/30 dark:hover:bg-primary-light/10 transition-colors"
            >
              {outgoing
                ? t('fullCredit', { amount: formatCurrency(openAmount, locale) })
                : t('fullDebt', { amount: formatCurrency(openAmount, locale) })}
            </button>
          )}

          {/* note */}
          <div>
            <label htmlFor="prepayment-note" className={LABEL_CLASS}>
              {t('noteLabel')}
            </label>
            <input
              id="prepayment-note"
              type="text"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('notePlaceholder')}
              className={FIELD_CLASS}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center gap-3 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-100 dark:border-white/[0.07] flex-shrink-0">
          {prepayment && !confirmDelete && (
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirmDelete(true)}
              className="text-sm font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
            >
              {t('delete')}
            </button>
          )}
          {confirmDelete ? (
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-sm text-gray-700 dark:text-slate-300">{t('deleteConfirm')}</span>
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmDelete(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
              >
                {t('deleteNo')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void remove()}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t('deleteYes')}
              </button>
            </div>
          ) : (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
              >
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
