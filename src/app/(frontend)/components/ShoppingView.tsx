'use client'

// "Nákup" — the chata's shared shopping list (src/lib/shopping.ts). Signed-in
// participants add what they want, picking real Rohlík products through the
// banker's connection or typing free text; the banker sends the whole list
// into their Rohlík cart and finishes the order on rohlik.cz. Anonymous
// visitors read along. Rohlík endpoints: /api/shopping-items/rohlik/*.
//
// Design ("Účtenka z chaty"): the list IS a thermal receipt that prints a
// line whenever somebody adds something; the counter beside it is where you
// add (search, one-tap cottage staples, who wants what). The one loud moment
// is the banker's "V košíku" stamp landing after the send. Receipt styles
// (paper edges, leaders, print/stamp motion) live in styles.css.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Minus, Package, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react'
import type { Chata } from '@/payload-types'
import type { AppLocale } from '@/i18n/config'
import type { FinanceViewer } from '@/lib/financeAccess'
import {
  estimatedTotal,
  type RohlikProduct,
  type ShoppingItemView,
  type ShoppingPayload,
} from '@/lib/shopping'
import { formatCurrency } from '@/lib/formatCurrency'
import { formatDateRangeShort } from '@/lib/chataSelection'
import { track } from '@/lib/analytics'
import { HintCard, Sheet, SheetHeading } from './SheetUi'

interface ShoppingViewProps {
  chata: Chata
  shopping: ShoppingPayload
  viewer?: FinanceViewer
  onDataChanged: () => Promise<void> | void
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; products: RohlikProduct[] }
  | { kind: 'not-connected' }
  | { kind: 'unavailable' }

interface SendResult {
  lines: number
  added: number
  failed: { title: string; reason: string }[]
  skipped: number
  checkoutUrl?: string | null
  /** the "přidej ručně" checklist went out by email */
  manualEmailed?: boolean
}

interface Staple {
  label: string
  /** the Czech keyword Rohlík's search understands */
  q: string
}

const SEARCH_DEBOUNCE_MS = 350
const SEARCH_MIN_CHARS = 2

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-base sm:text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-slate-500'

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:hover:bg-primary text-white text-[14px] font-semibold px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2'

/** Two letters for the "kdo co chce" bubbles: "Martin Procházka" → "MP". */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

const linkButtonClass =
  'rounded-lg border border-primary text-primary-dark dark:text-primary-light text-xs font-bold px-3.5 py-2 whitespace-nowrap hover:bg-primary/10 transition-colors'

function ProductThumb({ product, size = 44 }: { product: RohlikProduct | null; size?: number }) {
  const box = { width: size, height: size }
  if (product?.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt=""
        loading="lazy"
        style={box}
        className="shrink-0 rounded-lg bg-white object-contain border border-gray-100 dark:border-white/10"
      />
    )
  }
  return (
    <span
      style={box}
      className="shrink-0 rounded-lg bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center text-gray-400 dark:text-slate-500"
      aria-hidden="true"
    >
      <Package size={Math.round(size * 0.45)} />
    </span>
  )
}

function QuantityStepper({
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

export function ShoppingView({ chata, shopping, viewer, onDataChanged }: ShoppingViewProps) {
  const t = useTranslations('shopping')
  const locale = useLocale() as AppLocale
  const money = (amount: number) => formatCurrency(amount, locale)

  // ─── banner from the Rohlík OAuth round trip (?rohlik=connected|error) ──
  const [banner, setBanner] = useState<'connected' | 'error' | null>(null)
  const [returnTo, setReturnTo] = useState<string>('')
  useEffect(() => {
    const url = new URL(window.location.href)
    const flag = url.searchParams.get('rohlik')
    if (flag === 'connected' || flag === 'error') {
      setBanner(flag)
      url.searchParams.delete('rohlik')
      window.history.replaceState({}, '', url)
    }
    url.searchParams.set('view', 'shopping')
    setReturnTo(url.pathname + url.search)
  }, [])

  // ─── add form ───────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<RohlikProduct | null>(null)
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' })
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [participantId, setParticipantId] = useState<number | null>(
    shopping.ownParticipants[0]?.id ?? null,
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(false)
  const searchAbort = useRef<AbortController | null>(null)
  const searchInput = useRef<HTMLInputElement | null>(null)
  // the line that just printed onto the receipt (plays receipt-print once)
  const [printedId, setPrintedId] = useState<number | null>(null)

  useEffect(() => {
    const text = query.trim()
    if (selected || text.length < SEARCH_MIN_CHARS) {
      searchAbort.current?.abort()
      setSearch({ kind: 'idle' })
      return
    }
    const timer = window.setTimeout(async () => {
      searchAbort.current?.abort()
      const controller = new AbortController()
      searchAbort.current = controller
      setSearch({ kind: 'loading' })
      try {
        const res = await fetch(
          `/api/shopping-items/rohlik/search?chata=${chata.id}&q=${encodeURIComponent(text)}`,
          { credentials: 'include', signal: controller.signal },
        )
        const body = (await res.json().catch(() => ({}))) as {
          products?: RohlikProduct[]
          error?: string
        }
        if (controller.signal.aborted) return
        if (body.error === 'not-connected') setSearch({ kind: 'not-connected' })
        else if (!res.ok || !Array.isArray(body.products)) setSearch({ kind: 'unavailable' })
        else setSearch({ kind: 'done', products: body.products })
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setSearch({ kind: 'unavailable' })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, selected, chata.id])

  const pickStaple = (staple: Staple) => {
    setSelected(null)
    setQuery(staple.q)
    setDropdownOpen(true)
    searchInput.current?.focus()
  }

  const pickProduct = (product: RohlikProduct) => {
    setSelected(product)
    setQuery(product.name)
    setDropdownOpen(false)
  }

  const clearSelection = () => {
    setSelected(null)
    setQuery('')
  }

  const title = selected ? selected.name : query.trim()

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!title || saving) return
    setSaving(true)
    setFormError(false)
    try {
      const res = await fetch('/api/shopping-items', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chata: chata.id,
          title,
          quantity,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(participantId != null ? { participant: participantId } : {}),
          ...(selected ? { rohlik: selected } : {}),
        }),
      })
      if (!res.ok) {
        track('save_failed', { operation: 'shopping_item_create', status: res.status })
        setFormError(true)
        return
      }
      const created = (await res.json().catch(() => null)) as { doc?: { id?: number } } | null
      setSelected(null)
      setQuery('')
      setQuantity(1)
      setNote('')
      setDropdownOpen(false)
      await onDataChanged()
      if (typeof created?.doc?.id === 'number') setPrintedId(created.doc.id)
    } catch {
      track('save_failed', { operation: 'shopping_item_create' })
      setFormError(true)
    } finally {
      setSaving(false)
    }
  }

  // ─── item edits ─────────────────────────────────────────────────────────
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const changeQuantity = async (item: ShoppingItemView, next: number) => {
    if (next < 1) return
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/shopping-items/${item.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: next }),
      })
      if (!res.ok) track('save_failed', { operation: 'shopping_item_update', status: res.status })
      await onDataChanged()
    } finally {
      setBusyId(null)
    }
  }

  const deleteItem = async (item: ShoppingItemView) => {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/shopping-items/${item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) track('save_failed', { operation: 'shopping_item_delete', status: res.status })
      setConfirmDeleteId(null)
      await onDataChanged()
    } finally {
      setBusyId(null)
    }
  }

  // ─── shopper panel ──────────────────────────────────────────────────────
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const [sendError, setSendError] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnectError, setDisconnectError] = useState(false)
  // the stamp animates only right after a send, not on every visit
  const [justSent, setJustSent] = useState(false)

  const sendToCart = async () => {
    setSending(true)
    setSendError(false)
    setSendResult(null)
    try {
      const res = await fetch('/api/shopping-items/rohlik/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chata: chata.id }),
      })
      if (!res.ok) {
        track('save_failed', { operation: 'shopping_send_to_cart', status: res.status })
        setSendError(true)
        return
      }
      const result = (await res.json()) as SendResult
      setSendResult(result)
      await onDataChanged()
      if (result.added > 0) setJustSent(true)
    } catch {
      setSendError(true)
    } finally {
      setSending(false)
    }
  }

  const disconnect = async () => {
    setDisconnectError(false)
    try {
      const res = await fetch('/api/shopping-items/rohlik/disconnect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chata: chata.id }),
      })
      if (!res.ok) {
        setDisconnectError(true)
        return
      }
      setConfirmDisconnect(false)
      setSendResult(null)
      await onDataChanged()
    } catch {
      setDisconnectError(true)
    }
  }

  // ─── derived ────────────────────────────────────────────────────────────
  const { items, shopper } = shopping
  const { total, unpriced } = estimatedTotal(items)
  // sent = in the banker's Rohlík cart, or (free text) on the checklist
  // email they got, in the current amounts
  const isSent = (item: ShoppingItemView) =>
    Boolean(item.sentToCartAt && (item.sentQuantity ?? 0) >= item.quantity)
  const pendingCount = items.filter((item) => !isSent(item)).length
  const allSent = items.length > 0 && pendingCount === 0
  const allFromRohlik = items.every((item) => item.rohlik?.productId)
  const showDropdown =
    dropdownOpen && !selected && query.trim().length >= SEARCH_MIN_CHARS && search.kind !== 'idle'
  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'
  const connectHref = `/api/shopping-items/rohlik/connect?chata=${chata.id}&returnTo=${encodeURIComponent(returnTo || '/')}`
  const staples = t.raw('staples') as Staple[]

  // "Kdo co chce": how many lines each participant has on the receipt
  const people = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      if (!item.participantName) continue
      counts.set(item.participantName, (counts.get(item.participantName) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [items])
  const ownNames = new Set(shopping.ownParticipants.map((p) => p.name))

  const receiptTitle = (chata.destinationName || chata.shortName || chata.name).toUpperCase()
  const receiptDates =
    chata.tripDateFrom && !chata.tripDatesTentative
      ? formatDateRangeShort(chata.tripDateFrom, chata.tripDateTo, locale)
      : null
  // receipts print plain numbers; the currency sits in the subtotal row
  const plain = (amount: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'cs-CZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)

  const searchHint =
    search.kind === 'not-connected'
      ? shopper.name
        ? t('searchNotConnected', { name: shopper.name })
        : t('searchNotConnectedNoName')
      : search.kind === 'unavailable'
        ? t('searchUnavailable')
        : null

  return (
    <Sheet>
      <SheetHeading icon={ShoppingCart} title={t('title')} />
      <p className="-mt-1 mb-6 max-w-[62ch] text-[14px] leading-relaxed text-gray-600 dark:text-slate-400">
        {shopper.name ? t('intro', { name: shopper.name }) : t('introNoShopper')}
      </p>

      {banner && (
        <div
          role="status"
          className={`mb-6 flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-[13px] ${
            banner === 'connected'
              ? 'bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300'
              : 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300'
          }`}
        >
          <span>{banner === 'connected' ? t('connectedToast') : t('connectErrorToast')}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label={t('dismiss')}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10">
        {/* ─── the counter: add, staples, who wants what ─── */}
        <div className="flex min-w-0 flex-col gap-6">
          {shopping.canAdd ? (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="relative">
                {selected ? (
                  <div className="flex items-center gap-3 rounded-2xl border-2 border-primary/50 bg-primary/[0.05] px-3 py-2.5">
                    <ProductThumb product={selected} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold leading-snug text-gray-900 dark:text-gray-100">
                        {selected.name}
                      </div>
                      <div className="mt-0.5 text-[13px] text-gray-500 dark:text-slate-400">
                        {selected.amount}
                        {selected.amount && selected.price != null ? ', ' : ''}
                        {selected.price != null ? money(selected.price) : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearSelection}
                      aria-label={t('clearSelection')}
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="relative block">
                    <span className="sr-only">{t('addLabel')}</span>
                    <Search
                      size={19}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500"
                    />
                    <input
                      ref={searchInput}
                      type="text"
                      value={query}
                      maxLength={120}
                      onChange={(e) => {
                        setQuery(e.target.value)
                        setDropdownOpen(true)
                      }}
                      onFocus={() => setDropdownOpen(true)}
                      onBlur={() => window.setTimeout(() => setDropdownOpen(false), 150)}
                      placeholder={t('searchPlaceholder')}
                      autoComplete="off"
                      className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white pl-12 pr-4 text-[17px] font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-primary focus:outline-none dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-slate-500"
                    />
                  </label>
                )}

                {showDropdown && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-[22rem] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_40px_-12px_rgba(23,28,38,0.35)] dark:border-white/[0.12] dark:bg-[#232a36]">
                    {search.kind === 'loading' && (
                      <div className="px-3 py-3 text-[13px] text-gray-500 dark:text-slate-400">
                        {t('searching')}
                      </div>
                    )}
                    {search.kind === 'done' && search.products.length === 0 && (
                      <div className="px-3 py-3 text-[13px] text-gray-500 dark:text-slate-400">
                        {t('noResults')}
                      </div>
                    )}
                    {search.kind === 'done' &&
                      search.products.map((product) => {
                        const soldOut = product.inStock === false
                        return (
                          <button
                            key={product.productId}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickProduct(product)}
                            className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none dark:hover:bg-white/[0.05] ${
                              soldOut ? 'opacity-55' : ''
                            }`}
                          >
                            <ProductThumb product={product} size={48} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[14px] leading-snug text-gray-900 dark:text-gray-100">
                                {product.name}
                              </span>
                              <span className="block text-xs text-gray-500 dark:text-slate-400">
                                {soldOut ? t('soldOut') : product.amount}
                              </span>
                            </span>
                            {product.price != null && (
                              <span className="shrink-0 font-[family-name:var(--font-receipt)] text-[13px] tabular-nums text-gray-800 dark:text-slate-200">
                                {money(product.price)}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    {searchHint && (
                      <div className="px-3 py-3 text-[13px] leading-relaxed text-gray-500 dark:text-slate-400">
                        {searchHint}
                      </div>
                    )}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setDropdownOpen(false)
                        void submit()
                      }}
                      className="mt-1 block w-full rounded-xl border-t border-gray-100 px-3 py-2.5 text-left text-[13px] font-semibold text-primary-dark hover:bg-gray-50 dark:border-white/[0.08] dark:text-primary-light dark:hover:bg-white/[0.05]"
                    >
                      {t('addAsText', { text: query.trim() })}
                    </button>
                  </div>
                )}
              </div>

              {/* one-tap cottage staples: each runs a Rohlík search */}
              {!selected && (
                <div className="flex flex-wrap gap-1.5">
                  {staples.map((staple) => (
                    <button
                      key={staple.q}
                      type="button"
                      onClick={() => pickStaple(staple)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[13px] text-gray-700 transition-colors hover:border-primary hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-white/[0.14] dark:bg-white/[0.03] dark:text-slate-300 dark:hover:text-primary-light"
                    >
                      {staple.label}
                    </button>
                  ))}
                </div>
              )}

              {/* the rest of the form appears once there is something to add */}
              {title && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <QuantityStepper
                      value={quantity}
                      onChange={setQuantity}
                      lessLabel={t('less')}
                      moreLabel={t('more')}
                    />
                    {shopping.ownParticipants.length > 1 && (
                      <label className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-slate-400">
                        {t('forWhom')}
                        <select
                          value={participantId ?? ''}
                          onChange={(e) => setParticipantId(Number(e.target.value))}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px] text-gray-900 dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-gray-100"
                        >
                          {shopping.ownParticipants.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <input
                    type="text"
                    value={note}
                    maxLength={200}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('notePlaceholder')}
                    className={inputClass}
                  />
                  <button type="submit" disabled={saving} className={primaryButtonClass}>
                    <Plus size={16} aria-hidden="true" />
                    {saving ? t('saving') : t('submit')}
                  </button>
                </div>
              )}
              {formError && (
                <p className="text-[13px] text-red-600 dark:text-red-400">{t('saveFailed')}</p>
              )}
            </form>
          ) : (
            <HintCard>
              {viewer?.authenticated ? (
                <span>{t('noParticipantHint')}</span>
              ) : (
                <>
                  <span>{t('anonHint')}</span>
                  <a href={loginHref} className={linkButtonClass}>
                    {t('signIn')}
                  </a>
                </>
              )}
            </HintCard>
          )}

          {people.length > 0 && (
            <section aria-label={t('peopleTitle')}>
              <h4 className="mb-2.5 text-[13px] font-semibold text-gray-700 dark:text-slate-300">
                {t('peopleTitle')}
              </h4>
              <ul className="flex flex-wrap gap-x-4 gap-y-3">
                {people.map((person) => {
                  const own = ownNames.has(person.name)
                  return (
                    <li key={person.name} className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold ${
                          own
                            ? 'bg-primary text-white'
                            : 'bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-slate-200'
                        }`}
                      >
                        {initials(person.name)}
                      </span>
                      <span className="leading-tight">
                        <span className="block text-[13px] font-medium text-gray-800 dark:text-slate-200">
                          {person.name}
                        </span>
                        <span className="block text-[12px] text-gray-500 dark:text-slate-400">
                          {t('peopleCount', { count: person.count })}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>

        {/* ─── the receipt ─── */}
        <div className="flex flex-col items-center gap-6 rounded-[22px] bg-[#eef1f4] px-4 py-10 dark:bg-white/[0.04] sm:px-8">
          <div className="receipt-paper w-full max-w-[440px] px-5 pb-6 pt-7 sm:px-7">
            {allSent && (
              <div
                aria-hidden="true"
                className={`receipt-stamp pointer-events-none absolute right-3 top-16 rounded-md border-[3px] border-primary px-2.5 py-1 text-[15px] font-extrabold uppercase tracking-[0.06em] text-primary ${
                  justSent ? 'receipt-stamp-land' : ''
                }`}
              >
                {allFromRohlik ? t('stamp') : t('stampSent')}
              </div>
            )}

            <header className="text-center">
              <div className="text-[15px] font-bold tracking-[0.08em]">{receiptTitle}</div>
              <div className="mt-1 text-[12px] text-[#8b9099]">
                {t('receiptSubtitle')}
                {receiptDates ? `, ${receiptDates}` : ''}
              </div>
            </header>
            <div className="my-4 border-t-2 border-dashed border-[#c4c8cf]" />

            {items.length === 0 ? (
              <p className="py-6 text-center text-[13px] leading-relaxed text-[#8b9099]">
                {t('receiptEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col">
                {items.map((item) => {
                  const linePrice =
                    item.rohlik?.price != null
                      ? item.rohlik.price * Math.max(1, item.quantity)
                      : null
                  const busy = busyId === item.id
                  const sent = isSent(item)
                  const meta = [
                    item.rohlik ? item.rohlik.amount : t('ownItem'),
                    // set by the daily price check: the banker picks a substitute
                    item.rohlik?.inStock === false ? t('soldOut') : null,
                    item.participantName ? t('wantedBy', { name: item.participantName }) : null,
                    sent ? (item.rohlik ? t('inCart') : t('handedOver')) : null,
                  ].filter(Boolean)
                  return (
                    <li
                      key={item.id}
                      className={`group py-2 ${busy ? 'opacity-50' : ''} ${
                        printedId === item.id ? 'receipt-print' : ''
                      }`}
                    >
                      <div className="grid grid-cols-[2.4em_minmax(0,1fr)] text-[13px] leading-snug">
                        <span className="shrink-0 tabular-nums">{item.quantity}×</span>
                        <div className="min-w-0">
                          <div className="flex items-end">
                            <span className="min-w-0 break-words">{item.title}</span>
                            <span className="receipt-leader" aria-hidden="true" />
                            <span
                              className={`shrink-0 tabular-nums ${linePrice == null ? 'text-[#8b9099]' : ''}`}
                            >
                              {linePrice != null ? plain(linePrice) : '?'}
                            </span>
                          </div>
                          <div className="text-[11px] leading-snug text-[#8b9099]">
                            {meta.join(', ')}
                            {sent && <span aria-hidden="true"> ✓</span>}
                          </div>
                          {item.note && (
                            <div className="text-[11px] italic leading-snug text-[#5d626b]">
                              {item.note}
                            </div>
                          )}
                          {item.canEdit &&
                            (confirmDeleteId === item.id ? (
                              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px]">
                                {t('deleteConfirm')}
                                <button
                                  type="button"
                                  onClick={() => deleteItem(item)}
                                  disabled={busy}
                                  className="font-bold text-red-600 hover:underline"
                                >
                                  {t('deleteYes')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="font-bold hover:underline"
                                >
                                  {t('deleteNo')}
                                </button>
                              </div>
                            ) : (
                              <div className="mt-1 flex items-center gap-1 transition-opacity lg:opacity-40 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => changeQuantity(item, item.quantity - 1)}
                                  disabled={busy || item.quantity <= 1}
                                  aria-label={t('less')}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#5d626b] hover:bg-[#eef1f4] disabled:opacity-30"
                                >
                                  <Minus size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => changeQuantity(item, item.quantity + 1)}
                                  disabled={busy}
                                  aria-label={t('more')}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#5d626b] hover:bg-[#eef1f4]"
                                >
                                  <Plus size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(item.id)}
                                  disabled={busy}
                                  aria-label={t('delete')}
                                  className="flex h-7 w-7 items-center justify-center rounded-md text-[#5d626b] hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {items.length > 0 && (
              <>
                <div className="my-4 border-t-2 border-dashed border-[#c4c8cf]" />
                <div className="flex items-baseline justify-between text-[15px] font-bold">
                  <span>{t('subtotal')}</span>
                  <span className="tabular-nums">
                    {locale === 'en' ? `CZK ${plain(total)}` : `${plain(total)} Kč`}
                  </span>
                </div>
                <div className="mt-2 text-[11px] leading-relaxed text-[#8b9099]">
                  <div>{t('itemsCount', { count: items.length })}</div>
                  <div>{t('estimateNote')}</div>
                  {unpriced > 0 && (
                    <div>
                      {t('unpriced', { count: unpriced })}. {t('unknownPrice')}
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="mt-6 text-center text-[12px] tracking-[0.04em] text-[#5d626b]">
              {t('thanks')}
            </div>
          </div>

          {/* ─── the banker's till ─── */}
          {shopper.isMe && (
            <div className="flex w-full max-w-[440px] flex-col gap-3">
              {!shopper.connected ? (
                <>
                  <p className="text-[13px] leading-relaxed text-gray-600 dark:text-slate-300">
                    {t('shopperConnectIntro')}
                  </p>
                  <a href={connectHref} className={primaryButtonClass}>
                    <ShoppingCart size={16} aria-hidden="true" />
                    {t('connect')}
                  </a>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={sendToCart}
                    disabled={sending || pendingCount === 0}
                    className={primaryButtonClass}
                  >
                    <ShoppingCart size={16} aria-hidden="true" />
                    {sending ? t('sending') : t('send')}
                  </button>
                  <p className="text-center text-[12px] text-gray-500 dark:text-slate-400">
                    {items.length === 0
                      ? t('nothingToSend')
                      : pendingCount === 0
                        ? t('allSent')
                        : t('sendHint')}
                  </p>
                  {sendError && (
                    <p className="text-center text-[13px] text-red-600 dark:text-red-400">
                      {t('sendFailed')}
                    </p>
                  )}
                  {sendResult && (
                    <div
                      role="status"
                      className="rounded-xl bg-white px-4 py-3 text-[13px] leading-relaxed text-gray-700 dark:bg-white/[0.06] dark:text-slate-200"
                    >
                      <p>{t('sendAdded', { count: sendResult.added })}</p>
                      {sendResult.failed.length > 0 && (
                        <p className="text-red-700 dark:text-red-300">
                          {t('sendFailedLines', {
                            titles: sendResult.failed.map((f) => f.title).join(', '),
                          })}
                        </p>
                      )}
                      {sendResult.skipped > 0 && (
                        <p>{t('sendSkipped', { count: sendResult.skipped })}</p>
                      )}
                      {sendResult.manualEmailed && <p>{t('sendEmailed')}</p>}
                      <a
                        href={sendResult.checkoutUrl || 'https://www.rohlik.cz/'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-block font-semibold text-primary-dark underline underline-offset-2 dark:text-primary-light"
                      >
                        {t('finishOrder')}
                      </a>
                    </div>
                  )}
                  <div className="text-center text-[12px]">
                    {confirmDisconnect ? (
                      <span className="inline-flex flex-wrap items-center justify-center gap-2 text-gray-600 dark:text-slate-300">
                        {t('disconnectConfirm')}
                        <button
                          type="button"
                          onClick={disconnect}
                          className="font-semibold text-red-600 hover:underline dark:text-red-400"
                        >
                          {t('disconnectYes')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDisconnect(false)}
                          className="font-semibold hover:underline"
                        >
                          {t('disconnectNo')}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnect(true)}
                        className="text-gray-500 hover:text-gray-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
                      >
                        {t('disconnect')}
                      </button>
                    )}
                    {disconnectError && (
                      <p className="mt-1 text-red-600 dark:text-red-400">{t('disconnectFailed')}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
