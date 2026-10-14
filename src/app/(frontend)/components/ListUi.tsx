'use client'

// Pieces the chata's shared lists have in common: "Nákup" (ShoppingView)
// and "Pivo" (BeerView).

import { useState } from 'react'
import { Lock, LockOpen, Minus, Plus } from 'lucide-react'
import { track } from '@/lib/analytics'

/** Two letters for the "kdo co chce" bubbles: "Martin Procházka" → "MP". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

export function QuantityStepper({
  value,
  onChange,
  disabled,
  lessLabel,
  moreLabel,
}: {
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  lessLabel: string
  moreLabel: string
}) {
  const buttonClass =
    'w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-white/[0.08]'
  return (
    <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-white/[0.14]">
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 1}
        aria-label={lessLabel}
      >
        <Minus size={14} />
      </button>
      <span className="min-w-7 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {value}
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        aria-label={moreLabel}
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

/**
 * "Uzavřít objednávku": the banker closes the list after ordering (or opens
 * it again) through POST <endpoint> { chata, closed }; the page reloads its
 * data afterwards.
 */
export function useListClosing(
  endpoint: string,
  chataId: number,
  onDataChanged: () => Promise<void> | void,
) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const setClosed = async (closed: boolean) => {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chata: chataId, closed }),
      })
      if (!res.ok) {
        track('save_failed', {
          operation: closed ? 'list_close' : 'list_reopen',
          status: res.status,
        })
        setFailed(true)
        return
      }
      await onDataChanged()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return { busy, failed, setClosed }
}

/** The closed list's notice, in place of the add form; the banker may reopen. */
export function ListClosedNotice({
  text,
  reopenLabel,
  failedLabel,
  canReopen,
  busy,
  failed,
  onReopen,
}: {
  text: string
  reopenLabel: string
  failedLabel: string
  canReopen: boolean
  busy: boolean
  failed: boolean
  onReopen: () => void
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl border-2 border-primary/40 bg-primary/[0.05] px-4 py-4"
    >
      <p className="flex items-start gap-2.5 text-[14px] leading-relaxed text-gray-800 dark:text-slate-200">
        <Lock
          size={17}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-primary-dark dark:text-primary-light"
        />
        <span>{text}</span>
      </p>
      {canReopen && (
        <div>
          <button
            type="button"
            onClick={onReopen}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3.5 py-2 text-xs font-bold text-primary-dark transition-colors hover:bg-primary/10 disabled:opacity-50 dark:text-primary-light"
          >
            <LockOpen size={14} aria-hidden="true" />
            {reopenLabel}
          </button>
          {failed && (
            <p className="mt-2 text-[13px] text-red-600 dark:text-red-400">{failedLabel}</p>
          )}
        </div>
      )}
    </div>
  )
}

/** The banker's "Uzavřít objednávku", with an inline confirmation. */
export function CloseListButton({
  label,
  confirmText,
  yesLabel,
  noLabel,
  failedLabel,
  busy,
  failed,
  onClose,
}: {
  label: string
  confirmText: string
  yesLabel: string
  noLabel: string
  failedLabel: string
  busy: boolean
  failed: boolean
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="text-center text-[13px]">
      {confirming ? (
        <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-gray-700 dark:text-slate-300">
          {confirmText}
          <button
            type="button"
            onClick={() => {
              setConfirming(false)
              onClose()
            }}
            disabled={busy}
            className="font-bold text-primary-dark hover:underline dark:text-primary-light"
          >
            {yesLabel}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="font-bold hover:underline"
          >
            {noLabel}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3.5 py-2 text-xs font-bold text-gray-700 transition-colors hover:border-primary hover:text-primary-dark disabled:opacity-50 dark:border-white/[0.2] dark:text-slate-200 dark:hover:text-primary-light"
        >
          <Lock size={14} aria-hidden="true" />
          {label}
        </button>
      )}
      {failed && <p className="mt-2 text-red-600 dark:text-red-400">{failedLabel}</p>}
    </div>
  )
}
