'use client'

// "Pivo" — the chata's shared keg order from Benecentrum (src/lib/beer.ts).
// Signed-in participants pick kegs from the shop's price list
// (src/lib/kegCatalog.ts) and the bar ("výčep"); the banker emails themselves
// the order summary and orders from the shop by phone or email. Anonymous
// visitors read along.
//
// Design: the "Nákup" receipt (ShoppingView) with the shop's name on top.
// The counter on the left is a filterable price list with the price per
// litre beside each keg, so a 50 l keg and a 15 l one compare at a glance;
// the receipt adds up litres and half-litre glasses, and per head.

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Beer, Mail, Phone, Plus, Search, Minus, Trash2, X } from 'lucide-react'
import type { Chata } from '@/payload-types'
import type { AppLocale } from '@/i18n/config'
import type { FinanceViewer } from '@/lib/financeAccess'
import {
  BEER_SHOP,
  TAP_CODE,
  barPlan,
  beerLineCosts,
  beerTotals,
  filterKegs,
  pricePerLiter,
  weekendPriced,
  type BarPlan,
  type BeerItemView,
  type BeerPayload,
  type KegGroup,
  type TapRental,
} from '@/lib/beer'
import { KEG_CATALOG, KEG_CATALOG_PRINTED, type KegEntry } from '@/lib/kegCatalog'
import { formatCurrency, formatDate } from '@/lib/formatCurrency'
import { formatDateRangeShort } from '@/lib/chataSelection'
import { track } from '@/lib/analytics'
import { HintCard, Sheet, SheetHeading } from './SheetUi'
import {
  CloseListButton,
  ItemOptOutControls,
  ListClosedNotice,
  ListExpenseNote,
  ListOptOutPanel,
  QuantityStepper,
  initials,
  useItemOptOutText,
  useListClosing,
  useOptOut,
} from './ListUi'
import { listShares } from '@/lib/listSplit'

interface BeerViewProps {
  chata: Chata
  beer: BeerPayload
  /** every participant of the chata: litres per head, "kdo se skládá" */
  participants: { id: number; name: string }[]
  viewer?: FinanceViewer
  onDataChanged: () => Promise<void> | void
}

// the size chips: every keg size the price list has
const SIZES = [...new Set(KEG_CATALOG.map((keg) => keg.liters))].sort((a, b) => a - b)
const GROUPS: KegGroup[] = ['all', 'beer', 'nonalcoholic', 'other']

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:hover:bg-primary text-white text-[14px] font-semibold px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2'

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-base sm:text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-slate-500'

const linkButtonClass =
  'rounded-lg border border-primary text-primary-dark dark:text-primary-light text-xs font-bold px-3.5 py-2 whitespace-nowrap hover:bg-primary/10 transition-colors'

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
    active
      ? 'border-primary bg-primary text-white'
      : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary-dark dark:border-white/[0.14] dark:bg-white/[0.03] dark:text-slate-300 dark:hover:text-primary-light'
  }`

export function BeerView({ chata, beer, participants, viewer, onDataChanged }: BeerViewProps) {
  const t = useTranslations('beer')
  const tl = useTranslations('lists')
  const locale = useLocale() as AppLocale
  const money = (amount: number) => formatCurrency(amount, locale)
  // receipts print plain numbers; the currency sits in the subtotal row
  const plain = (amount: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'cs-CZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  const decimal = (value: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'cs-CZ', {
      maximumFractionDigits: 1,
    }).format(value)

  const [returnTo, setReturnTo] = useState('')
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'beer')
    setReturnTo(url.pathname + url.search)
  }, [])

  // ─── the price list ─────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<KegGroup>('all')
  const [size, setSize] = useState<number | null>(null)
  const results = useMemo(
    () => filterKegs(KEG_CATALOG, { query, liters: size, group }),
    [query, size, group],
  )

  // ─── add form ───────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<KegEntry | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [participantId, setParticipantId] = useState<number | null>(
    beer.ownParticipants[0]?.id ?? null,
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(false)
  const [printedId, setPrintedId] = useState<number | null>(null)

  const create = async (code: string, count: number, withNote: string) => {
    setSaving(true)
    setFormError(false)
    try {
      const res = await fetch('/api/keg-items', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chata: chata.id,
          code,
          quantity: count,
          ...(withNote.trim() ? { note: withNote.trim() } : {}),
          ...(participantId != null ? { participant: participantId } : {}),
        }),
      })
      if (!res.ok) {
        track('save_failed', { operation: 'keg_item_create', status: res.status })
        setFormError(true)
        return false
      }
      const created = (await res.json().catch(() => null)) as { doc?: { id?: number } } | null
      await onDataChanged()
      if (typeof created?.doc?.id === 'number') setPrintedId(created.doc.id)
      return true
    } catch {
      track('save_failed', { operation: 'keg_item_create' })
      setFormError(true)
      return false
    } finally {
      setSaving(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || saving) return
    if (await create(selected.code, quantity, note)) {
      setSelected(null)
      setQuantity(1)
      setNote('')
    }
  }

  // ─── item edits ─────────────────────────────────────────────────────────
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const changeQuantity = async (item: BeerItemView, next: number) => {
    if (next < 1) return
    setBusyId(item.id)
    try {
      // the bar is shared: one tap more or less, counted on the server, so
      // two people's "+" never collapse into one
      const res =
        item.code === TAP_CODE
          ? await fetch('/api/keg-items/taps', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ item: item.id, delta: next > item.quantity ? 1 : -1 }),
            })
          : await fetch(`/api/keg-items/${item.id}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ quantity: next }),
            })
      if (!res.ok) track('save_failed', { operation: 'keg_item_update', status: res.status })
      await onDataChanged()
    } finally {
      setBusyId(null)
    }
  }

  const deleteItem = async (item: BeerItemView) => {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/keg-items/${item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) track('save_failed', { operation: 'keg_item_delete', status: res.status })
      setConfirmDeleteId(null)
      await onDataChanged()
    } finally {
      setBusyId(null)
    }
  }

  // ─── the banker's summary ───────────────────────────────────────────────
  const [sending, setSending] = useState(false)
  const [sendState, setSendState] = useState<'sent' | 'failed' | null>(null)

  const sendSummary = async () => {
    setSending(true)
    setSendState(null)
    try {
      const res = await fetch('/api/keg-items/order-summary', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chata: chata.id }),
      })
      if (!res.ok) {
        track('save_failed', { operation: 'keg_order_summary', status: res.status })
        setSendState('failed')
        return
      }
      setSendState('sent')
      await onDataChanged()
    } catch {
      setSendState('failed')
    } finally {
      setSending(false)
    }
  }

  // ─── derived ────────────────────────────────────────────────────────────
  const { items, orderer } = beer
  const rental = useMemo<TapRental>(
    () => ({
      days: beer.tapDays,
      weekend: beer.tapWeekend === true,
    }),
    [beer.tapDays, beer.tapWeekend],
  )
  const totals = beerTotals(items, rental)
  // the bar's cost is planned for the whole order (barPlan), so per item
  // costs come for all items at once
  const costById = useMemo(() => {
    const costs = beerLineCosts(beer.items, rental)
    return new Map(beer.items.map((item, index) => [item.id, costs[index]]))
  }, [beer.items, rental])
  // "Výčep se dvěma kohouty a výčep s jedním kohoutem"
  const barLabel = (plan: BarPlan) => {
    const text = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
      plan.bars.map((bar) => t('barPart', { count: bar.count, taps: bar.taps })),
    )
    return text.charAt(0).toUpperCase() + text.slice(1)
  }
  const closing = useListClosing('/api/keg-items/close', chata.id, onDataChanged)
  const optOut = useOptOut(chata.id, 'beer', onDataChanged)
  const itemOptOutText = useItemOptOutText(beer.optOuts, participants)
  const ownIds = useMemo(() => beer.ownParticipants.map((p) => p.id), [beer.ownParticipants])
  const participantCount = participants.length
  // what the viewer's own participants pay from this order so far
  const myShare = useMemo(() => {
    const split = listShares(
      participants.map((p) => p.id),
      beer.items.map((item) => ({ id: item.id, cost: costById.get(item.id) ?? 0 })),
      { list: beer.optOuts.list ?? [], items: beer.optOuts.items ?? {} },
    )
    return ownIds.reduce((sum, id) => sum + (split.shares.get(String(id)) ?? 0), 0)
  }, [participants, beer.items, costById, beer.optOuts, ownIds])
  const changedSinceSummary = beer.summaryChanged
  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'

  // "Kdo co chce": kegs per participant (the bar is everybody's)
  const people = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      if (!item.participantName || item.unit !== 'keg') continue
      counts.set(item.participantName, (counts.get(item.participantName) ?? 0) + item.quantity)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [items])
  const ownNames = new Set(beer.ownParticipants.map((p) => p.name))

  const receiptDates =
    chata.tripDateFrom && !chata.tripDatesTentative
      ? formatDateRangeShort(chata.tripDateFrom, chata.tripDateTo, locale)
      : null
  const kindLabel = (kind: BeerItemView['kind']) =>
    kind === 'nonalcoholic'
      ? t('kindNonalcoholic')
      : kind === 'soft'
        ? t('kindSoft')
        : kind === 'cider'
          ? t('kindCider')
          : kind === 'wine'
            ? t('kindWine')
            : null
  const groupLabel: Record<KegGroup, string> = {
    all: t('groupAll'),
    beer: t('groupBeer'),
    other: t('groupOther'),
    nonalcoholic: t('groupNonalcoholic'),
  }

  return (
    <Sheet>
      <SheetHeading icon={Beer} title={t('title')} />
      <p className="-mt-1 mb-6 max-w-[62ch] text-[14px] leading-relaxed text-gray-600 dark:text-slate-400">
        {orderer.name ? t('intro', { name: orderer.name }) : t('introNoShopper')}
      </p>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-10">
        {/* ─── the counter: price list, tap, who wants what ─── */}
        <div className="flex min-w-0 flex-col gap-6">
          {beer.closedAt ? (
            <ListClosedNotice
              text={t('closedText', { date: formatDate(beer.closedAt, locale) })}
              reopenLabel={t('reopen')}
              failedLabel={t('closeFailed')}
              canReopen={orderer.canManage}
              busy={closing.busy}
              failed={closing.failed}
              onReopen={() => void closing.setClosed(false)}
            />
          ) : beer.canAdd ? (
            <>
              {selected ? (
                <form onSubmit={submit} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-2xl border-2 border-primary/50 bg-primary/[0.05] px-3 py-2.5">
                    <span
                      aria-hidden="true"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-[13px] font-bold tabular-nums text-primary-dark dark:bg-white/[0.06] dark:text-primary-light"
                    >
                      {selected.liters} l
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold leading-snug text-gray-900 dark:text-gray-100">
                        {selected.name}
                      </div>
                      <div className="mt-0.5 text-[13px] text-gray-500 dark:text-slate-400">
                        {t('kegSize', { liters: selected.liters })}, {money(selected.price)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      aria-label={t('clearSelection')}
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <QuantityStepper
                      value={quantity}
                      onChange={setQuantity}
                      lessLabel={t('less')}
                      moreLabel={t('more')}
                    />
                    {beer.ownParticipants.length > 1 && (
                      <label className="flex items-center gap-2 text-[13px] text-gray-500 dark:text-slate-400">
                        {t('forWhom')}
                        <select
                          value={participantId ?? ''}
                          onChange={(e) => setParticipantId(Number(e.target.value))}
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[13px] text-gray-900 dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-gray-100"
                        >
                          {beer.ownParticipants.map((p) => (
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
                </form>
              ) : (
                <div className="flex flex-col gap-3">
                  <label className="relative block">
                    <span className="sr-only">{t('searchLabel')}</span>
                    <Search
                      size={19}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500"
                    />
                    <input
                      type="search"
                      value={query}
                      maxLength={60}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('searchPlaceholder')}
                      autoComplete="off"
                      className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white pl-12 pr-4 text-[17px] font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-primary focus:outline-none dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-slate-500"
                    />
                  </label>
                  <div role="group" aria-label={t('groupLabel')} className="flex flex-wrap gap-1.5">
                    {GROUPS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={group === value}
                        onClick={() => setGroup(value)}
                        className={chipClass(group === value)}
                      >
                        {groupLabel[value]}
                      </button>
                    ))}
                  </div>
                  <div role="group" aria-label={t('sizeLabel')} className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      aria-pressed={size === null}
                      onClick={() => setSize(null)}
                      className={chipClass(size === null)}
                    >
                      {t('sizeAny')}
                    </button>
                    {SIZES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={size === value}
                        onClick={() => setSize(value)}
                        className={chipClass(size === value)}
                      >
                        {value} l
                      </button>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-gray-200 dark:border-white/[0.12]">
                    <div className="border-b border-gray-100 px-3 py-2 text-[12px] text-gray-500 dark:border-white/[0.08] dark:text-slate-400">
                      {t('resultsCount', { count: results.length })}
                    </div>
                    {results.length === 0 ? (
                      <p className="px-3 py-4 text-[13px] text-gray-500 dark:text-slate-400">
                        {t('noResults')}
                      </p>
                    ) : (
                      <ul className="max-h-[22rem] overflow-y-auto p-1.5">
                        {results.map((keg) => {
                          const perLiter = pricePerLiter(keg)
                          const kind = kindLabel(keg.kind)
                          return (
                            <li key={keg.code}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelected(keg)
                                  setQuantity(1)
                                }}
                                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none dark:hover:bg-white/[0.05] dark:focus-visible:bg-white/[0.05]"
                              >
                                <span
                                  aria-hidden="true"
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[12px] font-bold tabular-nums text-gray-700 dark:bg-white/[0.06] dark:text-slate-200"
                                >
                                  {keg.liters} l
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[14px] leading-snug text-gray-900 dark:text-gray-100">
                                    {keg.name}
                                  </span>
                                  <span className="block text-xs text-gray-500 dark:text-slate-400">
                                    {[
                                      t('kegSize', { liters: keg.liters }),
                                      perLiter != null
                                        ? t('perLiter', { price: money(perLiter) })
                                        : null,
                                      kind,
                                      keg.inStock ? null : t('outOfStock'),
                                    ]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </span>
                                </span>
                                <span className="shrink-0 font-[family-name:var(--font-receipt)] text-[13px] tabular-nums text-gray-800 dark:text-slate-200">
                                  {money(keg.price)}
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
              {formError && (
                <p className="text-[13px] text-red-600 dark:text-red-400">{t('saveFailed')}</p>
              )}

              {/* the bar: until somebody adds one; then the receipt shows it */}
              {totals.taps === 0 && (
                <section className="rounded-2xl bg-gray-50 px-4 py-4 dark:bg-white/[0.04]">
                  <h4 className="text-[14px] font-semibold text-gray-900 dark:text-gray-100">
                    {t('tapTitle')}
                  </h4>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-600 dark:text-slate-400">
                    {t('tapText', {
                      price: money(barPlan(1, rental).cost),
                      days: rental.days,
                    })}{' '}
                    {orderer.name ? t('tapPriceBy', { name: orderer.name }) : t('tapPriceByShop')}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void create(TAP_CODE, 1, '')}
                      className={linkButtonClass}
                    >
                      {t('tapAdd')}
                    </button>
                  </div>
                </section>
              )}
            </>
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

          {closing.expense && <ListExpenseNote outcome={closing.expense} />}
          <ListOptOutPanel optOuts={beer.optOuts} participants={participants} optOut={optOut} />

          {people.length > 0 && (
            <section aria-label={t('peopleTitle')}>
              <h4 className="mb-2.5 text-[13px] font-semibold text-gray-700 dark:text-slate-300">
                {t('peopleTitle')}
              </h4>
              <ul className="flex flex-wrap gap-x-4 gap-y-3">
                {people.map((person) => (
                  <li key={person.name} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold ${
                        ownNames.has(person.name)
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
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ─── the receipt ─── */}
        <div className="flex flex-col items-center gap-6 rounded-[22px] bg-[#eef1f4] px-4 py-10 dark:bg-white/[0.04] sm:px-8">
          <div className="receipt-paper w-full max-w-[440px] px-5 pb-6 pt-7 sm:px-7">
            {beer.closedAt && (
              <div
                aria-hidden="true"
                className="receipt-stamp pointer-events-none absolute right-3 top-16 rounded-md border-[3px] border-primary px-2.5 py-1 text-[15px] font-extrabold uppercase tracking-[0.06em] text-primary"
              >
                {t('stamp')}
              </div>
            )}
            <header className="text-center">
              <div className="text-[15px] font-bold tracking-[0.08em]">
                {BEER_SHOP.name.toUpperCase()}
              </div>
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
                  const busy = busyId === item.id
                  const isTap = item.unit === 'day'
                  // "ve shrnutí" only while the emailed summary still matches
                  // the order (any edit since, notes included, clears it)
                  const summarized =
                    !beer.summaryChanged &&
                    item.summaryQuantity != null &&
                    item.summaryQuantity === item.quantity
                  const meta = [
                    isTap ? t('tapCount', { count: item.quantity }) : kindLabel(item.kind),
                    isTap ? t('days', { count: rental.days }) : null,
                    isTap && weekendPriced(rental) ? t('weekendPrice') : null,
                    // the bar is everybody's: no "chce" on it
                    item.participantName && !isTap
                      ? t('wantedBy', { name: item.participantName })
                      : null,
                    summarized ? t('summarized') : null,
                    itemOptOutText(item.id),
                  ].filter(Boolean)
                  return (
                    <li
                      key={item.id}
                      className={`group py-2 ${busy ? 'opacity-50' : ''} ${
                        printedId === item.id ? 'receipt-print' : ''
                      }`}
                    >
                      <div className="grid grid-cols-[2.4em_minmax(0,1fr)] text-[13px] leading-snug">
                        {/* the bar's quantity is taps: its name says what that makes */}
                        <span className="shrink-0 tabular-nums">
                          {isTap ? '' : `${item.quantity}×`}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-end">
                            <span className="min-w-0 break-words">
                              {isTap ? barLabel(barPlan(item.quantity, rental)) : item.name}
                              {item.liters ? ` ${item.liters} l` : ''}
                            </span>
                            <span className="receipt-leader" aria-hidden="true" />
                            <span className="shrink-0 tabular-nums">
                              {plain(costById.get(item.id) ?? 0)}
                            </span>
                          </div>
                          {meta.length > 0 && (
                            <div className="text-[11px] leading-snug text-[#8b9099]">
                              {meta.join(', ')}
                              {summarized && <span aria-hidden="true"> ✓</span>}
                            </div>
                          )}
                          {item.note && (
                            <div className="text-[11px] italic leading-snug text-[#5d626b]">
                              {item.note}
                            </div>
                          )}
                          {confirmDeleteId === item.id ? (
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
                            (item.canEdit ||
                              item.canChangeTaps ||
                              beer.optOuts.canSetFor.length > 0) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1 transition-opacity lg:opacity-40 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                                {(item.canEdit || item.canChangeTaps) && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => changeQuantity(item, item.quantity - 1)}
                                      disabled={busy || item.quantity <= 1}
                                      aria-label={isTap ? t('lessTaps') : t('less')}
                                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#5d626b] hover:bg-[#eef1f4] disabled:opacity-30"
                                    >
                                      <Minus size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => changeQuantity(item, item.quantity + 1)}
                                      disabled={busy}
                                      aria-label={isTap ? t('moreTaps') : t('more')}
                                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#5d626b] hover:bg-[#eef1f4]"
                                    >
                                      <Plus size={13} />
                                    </button>
                                    {item.canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteId(item.id)}
                                        disabled={busy}
                                        aria-label={t('delete')}
                                        className="flex h-7 w-7 items-center justify-center rounded-md text-[#5d626b] hover:bg-red-50 hover:text-red-600"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </>
                                )}
                                <ItemOptOutControls
                                  itemId={item.id}
                                  optOuts={beer.optOuts}
                                  participants={participants}
                                  ownIds={ownIds}
                                  optOut={optOut}
                                />
                              </div>
                            )
                          )}
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
                    {locale === 'en' ? `CZK ${plain(totals.total)}` : `${plain(totals.total)} Kč`}
                  </span>
                </div>
                {totals.liters > 0 && (
                  <div className="mt-1 text-[13px]">
                    {t('liters', { liters: totals.liters, pints: totals.pints })}
                  </div>
                )}
                {ownIds.length > 0 && (
                  <div className="mt-1 text-[13px]">
                    {myShare > 0
                      ? tl('yourShare', { amount: money(myShare) })
                      : tl('yourShareNone')}
                  </div>
                )}
                <div className="mt-2 text-[11px] leading-relaxed text-[#8b9099]">
                  {totals.liters > 0 && participantCount > 0 && (
                    <div>{t('perHead', { liters: decimal(totals.liters / participantCount) })}</div>
                  )}
                  <div>
                    {t('estimateNote', {
                      date: formatDate(`${KEG_CATALOG_PRINTED}T12:00:00.000Z`, locale),
                    })}
                  </div>
                  {totals.taps > 0 && <div>{t('tapEstimate')}</div>}
                </div>
              </>
            )}
            <div className="mt-6 text-center text-[12px] tracking-[0.04em] text-[#5d626b]">
              {t('thanks')}
            </div>
          </div>

          {/* ─── the banker's till ─── */}
          {orderer.canManage && (
            <div className="flex w-full max-w-[440px] flex-col gap-3">
              <p className="text-[13px] leading-relaxed text-gray-600 dark:text-slate-300">
                {t('ordererIntro')}
              </p>
              <button
                type="button"
                onClick={sendSummary}
                disabled={sending || items.length === 0}
                className={primaryButtonClass}
              >
                <Mail size={16} aria-hidden="true" />
                {sending ? t('sending') : t('send')}
              </button>
              <div
                className="text-center text-[12px] text-gray-500 dark:text-slate-400"
                role="status"
              >
                {sendState === 'sent' ? (
                  <p className="font-medium text-green-700 dark:text-green-400">{t('sent')}</p>
                ) : sendState === 'failed' ? (
                  <p className="text-red-600 dark:text-red-400">{t('sendFailed')}</p>
                ) : items.length === 0 ? (
                  <p>{t('nothingToSend')}</p>
                ) : beer.summarySentAt ? (
                  <p>
                    {t('lastSent', { date: formatDate(beer.summarySentAt, locale) })}
                    {changedSinceSummary ? ` ${t('changedSince')}` : ''}
                  </p>
                ) : null}
              </div>
              {!beer.closedAt && (
                <CloseListButton
                  label={t('close')}
                  confirmText={t('closeConfirm')}
                  yesLabel={t('closeYes')}
                  noLabel={t('closeNo')}
                  failedLabel={t('closeFailed')}
                  busy={closing.busy}
                  failed={closing.failed}
                  onClose={() => void closing.setClosed(true)}
                />
              )}
              <div className="rounded-xl bg-white px-4 py-3 text-[13px] leading-relaxed text-gray-700 dark:bg-white/[0.06] dark:text-slate-200">
                <div className="font-semibold">{t('shopTitle')}</div>
                <div className="text-gray-500 dark:text-slate-400">{BEER_SHOP.address}</div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  <a
                    href={`tel:${BEER_SHOP.phone.replace(/\s/g, '')}`}
                    className="inline-flex items-center gap-1.5 font-medium text-primary-dark underline-offset-2 hover:underline dark:text-primary-light"
                  >
                    <Phone size={13} aria-hidden="true" />
                    {BEER_SHOP.phone}
                  </a>
                  <a
                    href={`mailto:${BEER_SHOP.email}`}
                    className="inline-flex items-center gap-1.5 font-medium text-primary-dark underline-offset-2 hover:underline dark:text-primary-light"
                  >
                    <Mail size={13} aria-hidden="true" />
                    {BEER_SHOP.email}
                  </a>
                </div>
                <a
                  href={BEER_SHOP.priceListUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {t('shopPriceList')}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
