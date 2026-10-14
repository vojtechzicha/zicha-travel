'use client'

// Pieces the chata's shared lists have in common: "Nákup" (ShoppingView)
// and "Pivo" (BeerView).

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Lock, LockOpen, Minus, Plus, Users } from 'lucide-react'
import type { AppLocale } from '@/i18n/config'
import { track } from '@/lib/analytics'
import { formatCurrency } from '@/lib/formatCurrency'
import type { ListKind, OptOutView } from '@/lib/listSplit'

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
  // what closing did in Finance (src/utils/listExpense.ts)
  const [expense, setExpense] = useState<ListExpenseOutcome | null>(null)
  const setClosed = async (closed: boolean) => {
    setBusy(true)
    setFailed(false)
    setExpense(null)
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
      const body = (await res.json().catch(() => ({}))) as { expense?: ListExpenseOutcome }
      if (body.expense) setExpense(body.expense)
      await onDataChanged()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return { busy, failed, expense, setClosed }
}

export type ListExpenseOutcome =
  | { status: 'created' | 'updated'; amount: number }
  | { status: 'skipped'; reason: 'no-banker' | 'empty' }
  | { status: 'failed' }

/** What closing wrote into Finance, said in one line. */
export function ListExpenseNote({ outcome }: { outcome: ListExpenseOutcome }) {
  const t = useTranslations('lists')
  const locale = useLocale() as AppLocale
  const text =
    outcome.status === 'created'
      ? t('expenseCreated', { amount: formatCurrency(outcome.amount, locale) })
      : outcome.status === 'updated'
        ? t('expenseUpdated', { amount: formatCurrency(outcome.amount, locale) })
        : outcome.status === 'skipped'
          ? outcome.reason === 'empty'
            ? t('expenseSkippedEmpty')
            : t('expenseSkippedNoBanker')
          : t('expenseFailed')
  return (
    <p
      role="status"
      className={`text-center text-[13px] ${
        outcome.status === 'failed'
          ? 'text-red-600 dark:text-red-400'
          : 'text-gray-600 dark:text-slate-300'
      }`}
    >
      {text}
    </p>
  )
}

/** "Tohle nechci": sets or clears one participant's opt-out, then reloads. */
export function useOptOut(
  chataId: number,
  list: ListKind,
  onDataChanged: () => Promise<void> | void,
) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const setOut = async (item: number | null, participant: number, out: boolean) => {
    setBusyKey(`${item ?? 'list'}:${participant}`)
    setFailed(false)
    try {
      const res = await fetch('/api/list-opt-outs/set', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chata: chataId, list, item, participant, out }),
      })
      if (!res.ok) {
        track('save_failed', { operation: 'list_opt_out', status: res.status })
        setFailed(true)
        return
      }
      await onDataChanged()
    } catch {
      setFailed(true)
    } finally {
      setBusyKey(null)
    }
  }
  return { busyKey, failed, setOut }
}

type OptOut = ReturnType<typeof useOptOut>
interface Person {
  id: number
  name: string
}

const chipClass = (on: boolean) =>
  `inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50 ${
    on
      ? 'border-primary bg-primary/10 text-primary-dark dark:text-primary-light'
      : 'border-gray-200 text-gray-500 line-through decoration-gray-400 dark:border-white/[0.14] dark:text-slate-400'
  }`

/**
 * Chips for the people this viewer may opt in or out; a ticked chip chips
 * in, an unticked one doesn't.
 */
function OptOutChips({
  people,
  isOut,
  item,
  optOut,
  lockedOut,
}: {
  people: Person[]
  isOut: (participant: number) => boolean
  item: number | null
  optOut: OptOut
  /** out of the whole list: shown, not toggled per item */
  lockedOut?: Set<number>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {people.map((person) => {
        const out = isOut(person.id)
        return (
          <button
            key={person.id}
            type="button"
            aria-pressed={!out}
            disabled={
              lockedOut?.has(person.id) || optOut.busyKey === `${item ?? 'list'}:${person.id}`
            }
            onClick={() => void optOut.setOut(item, person.id, !out)}
            className={chipClass(!out)}
          >
            {!out && <Check size={12} aria-hidden="true" />}
            {person.name}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The whole-list opt-out ("na tohle se neskládám", items added later
 * included): your own participants, or everyone for the banker. Others
 * read who opted out.
 */
export function ListOptOutPanel({
  optOuts,
  participants,
  optOut,
}: {
  optOuts: OptOutView
  participants: Person[]
  optOut: OptOut
}) {
  const t = useTranslations('lists')
  const outIds = new Set(optOuts.list ?? [])
  const settable = participants.filter((p) => optOuts.canSetFor.includes(p.id))
  const outNames = participants.filter((p) => outIds.has(p.id)).map((p) => p.name)
  if (settable.length === 0 && optOuts.listCount === 0) return null
  return (
    <section aria-label={t('listTitle')} className="flex flex-col gap-2">
      <h4 className="text-[13px] font-semibold text-gray-700 dark:text-slate-300">
        {t('listTitle')}
      </h4>
      {settable.length > 0 && (
        <>
          <p className="text-[12px] leading-relaxed text-gray-500 dark:text-slate-400">
            {t('listIntro')}
          </p>
          <OptOutChips
            people={settable}
            isOut={(id) => outIds.has(id)}
            item={null}
            optOut={optOut}
          />
        </>
      )}
      {outNames.length > 0 && settable.length < participants.length && (
        <p className="text-[12px] text-gray-500 dark:text-slate-400">
          {t('listOutNames', { names: outNames.join(', ') })}
        </p>
      )}
      {optOuts.list == null && optOuts.listCount > 0 && (
        <p className="text-[12px] text-gray-500 dark:text-slate-400">
          {t('listOutCount', { count: optOuts.listCount })}
        </p>
      )}
      {optOut.failed && (
        <p className="text-[12px] text-red-600 dark:text-red-400">{t('optOutFailed')}</p>
      )}
    </section>
  )
}

/** Who skips one receipt line, said plainly; null when everybody chips in. */
export function useItemOptOutText(optOuts: OptOutView, participants: Person[]) {
  const t = useTranslations('lists')
  return (itemId: number): string | null => {
    const ids = optOuts.items?.[String(itemId)]
    if (ids) {
      const names = participants.filter((p) => ids.includes(p.id)).map((p) => p.name)
      return names.length > 0
        ? t('optedOutNames', { count: names.length, names: names.join(', ') })
        : null
    }
    const count = optOuts.itemCounts[String(itemId)] ?? 0
    return count > 0 ? t('optedOutCount', { count }) : null
  }
}

/**
 * A receipt line's opt-out controls: one tap for the viewer's own
 * participant ("Nechci" / "Chci taky"), plus "Kdo se skládá" chips when they
 * may set it for more people (the banker, a parent).
 */
export function ItemOptOutControls({
  itemId,
  optOuts,
  participants,
  ownIds,
  optOut,
}: {
  itemId: number
  optOuts: OptOutView
  participants: Person[]
  ownIds: number[]
  optOut: OptOut
}) {
  const t = useTranslations('lists')
  const [open, setOpen] = useState(false)
  const settable = participants.filter((p) => optOuts.canSetFor.includes(p.id))
  if (settable.length === 0) return null
  const outOfItem = new Set(optOuts.items?.[String(itemId)] ?? [])
  const outOfList = new Set(optOuts.list ?? [])
  const isOut = (id: number) => outOfItem.has(id) || outOfList.has(id)
  const me = settable.find((p) => ownIds.includes(p.id))
  const more = settable.length > (me ? 1 : 0)
  const buttonClass =
    'inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[#5d626b] hover:bg-[#eef1f4] disabled:opacity-40'
  return (
    <>
      {me && (
        <button
          type="button"
          disabled={outOfList.has(me.id) || optOut.busyKey === `${itemId}:${me.id}`}
          title={outOfList.has(me.id) ? t('listOutHint') : undefined}
          onClick={() => void optOut.setOut(itemId, me.id, !outOfItem.has(me.id))}
          className={buttonClass}
        >
          {outOfItem.has(me.id) ? t('wantedAgain') : t('notWanted')}
        </button>
      )}
      {more && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={buttonClass}
        >
          <Users size={12} aria-hidden="true" />
          {t('whoChipsIn')}
        </button>
      )}
      {open && (
        <div className="basis-full pt-1">
          <OptOutChips
            people={settable}
            isOut={isOut}
            item={itemId}
            optOut={optOut}
            lockedOut={outOfList}
          />
        </div>
      )}
    </>
  )
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
