'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { ArrowLeft, Crown, LayoutGrid, Table2 } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { formatCurrency, getInitials, getAvatarColor } from '@/lib/formatCurrency'
import { track } from '@/lib/analytics'
import { getPayerDisplay } from '@/lib/payerRef'
import {
  buildExpenseRows,
  overviewOrder,
  prepaymentRow,
  rowSum,
  verdict,
  type PrepaymentRowKind,
} from '@/lib/financeOverview'
import type { AppLocale } from '@/i18n/config'
import type { Chata, Participant, Expense } from '@/payload-types'
import type { ChataStats } from '@/utils/calculateStats'

interface FinanceOverviewProps {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  stats: ChataStats
  onBack?: () => void
}

type Mode = 'table' | 'cards'
const MODE_STORAGE_KEY = 'chata-overview-mode'

const PREPAYMENT_KINDS: PrepaymentRowKind[] = ['advance', 'supplement', 'refund']

type FinanceTranslator = ReturnType<typeof useTranslations>

const podilLabel = (
  t: FinanceTranslator,
  locale: AppLocale,
  weight: number,
  weightIsAmount?: boolean,
): string =>
  weightIsAmount
    ? t('share.amount', { amount: formatCurrency(weight, locale) })
    : t('share.count', { count: weight })

/** "+ 2 500 Kč" green / "− 2 500 Kč" plain, matching PersonView's rows. */
function SignedAmount({ value }: { value: number }) {
  const locale = useLocale() as AppLocale
  if (value > 0) return <strong className="text-green-600">+ {formatCurrency(value, locale)}</strong>
  return <strong className="text-gray-900">− {formatCurrency(Math.abs(value), locale)}</strong>
}

/**
 * A fair-share amount: normally "− 500 Kč"; a negative share (credit — e.g.
 * a refund expense) flips to green "+ 500 Kč", like PersonView's breakdown.
 */
function ShareAmount({ cost }: { cost: number }) {
  const locale = useLocale() as AppLocale
  if (cost < 0) return <span className="text-green-600">+ {formatCurrency(Math.abs(cost), locale)}</span>
  return <>− {formatCurrency(cost, locale)}</>
}

export function FinanceOverview({ chata, participants, expenses, stats, onBack }: FinanceOverviewProps) {
  const t = useTranslations('finance')
  const locale = useLocale() as AppLocale
  // Table is the default on desktop, cards on mobile; a manual switch is
  // remembered per browser
  const [mode, setMode] = useState<Mode | null>(null)
  useEffect(() => {
    const stored = localStorage.getItem(MODE_STORAGE_KEY)
    const initial =
      stored === 'table' || stored === 'cards'
        ? stored
        : window.matchMedia('(min-width: 1024px)').matches
          ? 'table'
          : 'cards'
    setMode(initial)
    track('overview_opened', { layout: initial })
  }, [])
  const switchMode = (next: Mode) => {
    setMode(next)
    localStorage.setItem(MODE_STORAGE_KEY, next)
  }

  const bankerId = typeof chata.banker === 'object' && chata.banker !== null ? chata.banker.id : chata.banker
  const bankerName = participants.find((p) => p.id === bankerId)?.name || ''

  const names = useMemo(
    () =>
      overviewOrder(
        participants.map((p) => p.name).filter((n) => stats.participants[n]),
        bankerName,
      ),
    [participants, stats, bankerName],
  )

  const actualExpenses = useMemo(() => expenses.filter((e) => !e.isPlanned), [expenses])

  const expenseRows = useMemo(() => {
    const payerLabels: Record<string, string> = {}
    for (const e of actualExpenses) {
      const info = getPayerDisplay(e.payer)
      payerLabels[String(e.id)] =
        info.name || participants.find((p) => p.id === info.id)?.name || ''
    }
    return buildExpenseRows(actualExpenses, payerLabels, stats)
  }, [actualExpenses, participants, stats])

  const p = (name: string) => stats.participants[name]
  const paidRow = Object.fromEntries(names.map((n) => [n, p(n).paidExternal]))
  const prepayRows = PREPAYMENT_KINDS.map((kind) => ({
    kind,
    label: t(`overview.prepaymentRows.${kind}`),
    values: prepaymentRow(kind, stats),
  })).filter((r) => r.values !== null) as Array<{
    kind: PrepaymentRowKind
    label: string
    values: Record<string, number>
  }>
  // Planned expenses stay out of the per-expense listing (approved design),
  // but their aggregates must appear whenever they exist — otherwise the
  // visible rows would not add up to the result
  const hasPlanned = names.some((n) => p(n).plannedCost > 0 || p(n).plannedPaidExternal > 0)
  const totalActual = actualExpenses.reduce((sum, e) => sum + e.amount, 0)
  const collected = bankerName ? Math.abs(Math.min(0, p(bankerName)?.prepaidAdvance ?? 0)) : 0
  const zeroSum = names.reduce((sum, n) => sum + p(n).balance, 0)

  if (mode === null) return null

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Toolbar: back + mode switch */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border border-white/30"
          >
            <ArrowLeft size={15} />
            {t('overview.backToFinance')}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-1 p-1 rounded-xl backdrop-blur-md bg-white/15 border border-white/20">
          <button
            onClick={() => switchMode('table')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg font-semibold text-sm transition-all ${
              mode === 'table' ? 'bg-primary text-white shadow-lg shadow-primary/40' : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <Table2 size={15} /> {t('overview.table')}
          </button>
          <button
            onClick={() => switchMode('cards')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg font-semibold text-sm transition-all ${
              mode === 'cards' ? 'bg-primary text-white shadow-lg shadow-primary/40' : 'text-white/80 hover:text-white hover:bg-white/15'
            }`}
          >
            <LayoutGrid size={15} /> {t('overview.cards')}
          </button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap justify-center gap-2 text-[13px]">
        {[
          t.rich('overview.chipTotal', {
            amount: formatCurrency(totalActual, locale),
            strong: (chunks) => <strong className="text-white">{chunks}</strong>,
          }),
          t.rich('overview.chipExpenses', {
            count: actualExpenses.length,
            strong: (chunks) => <strong className="text-white">{chunks}</strong>,
          }),
          t.rich('overview.chipParticipants', {
            count: names.length,
            strong: (chunks) => <strong className="text-white">{chunks}</strong>,
          }),
          ...(collected > 0
            ? [
                t.rich('overview.chipCollected', {
                  amount: formatCurrency(collected, locale),
                  strong: (chunks) => <strong className="text-white">{chunks}</strong>,
                }),
              ]
            : []),
          t.rich('overview.chipZeroSum', {
            amount: formatCurrency(Math.round(Math.abs(zeroSum)), locale),
            strong: (chunks) => <strong className="text-green-300">{chunks}</strong>,
          }),
        ].map((content, i) => (
          <span
            key={i}
            className="px-4 py-1.5 rounded-full bg-white/15 border border-white/20 text-white/90 backdrop-blur-sm tabular-nums"
          >
            {content}
          </span>
        ))}
      </div>

      {mode === 'table' ? (
        <OverviewTable
          names={names}
          bankerName={bankerName}
          paidRow={paidRow}
          prepayRows={prepayRows}
          expenseRows={expenseRows}
          stats={stats}
          hasPlanned={hasPlanned}
          totalActual={totalActual}
          zeroSum={zeroSum}
        />
      ) : (
        <OverviewCards names={names} bankerName={bankerName} stats={stats} />
      )}
    </div>
  )
}

/* ------------------------------- table mode ------------------------------- */

function OverviewTable({
  names,
  bankerName,
  paidRow,
  prepayRows,
  expenseRows,
  stats,
  hasPlanned,
  totalActual,
  zeroSum,
}: {
  names: string[]
  bankerName: string
  paidRow: Record<string, number>
  prepayRows: Array<{ kind: PrepaymentRowKind; label: string; values: Record<string, number> }>
  expenseRows: ReturnType<typeof buildExpenseRows>
  stats: ChataStats
  hasPlanned: boolean
  totalActual: number
  zeroSum: number
}) {
  const t = useTranslations('finance')
  const locale = useLocale() as AppLocale
  const p = (name: string) => stats.participants[name]
  const bankerCol = (n: string) => (n === bankerName ? 'bg-blue-50/70' : '')
  const labelCell =
    'sticky left-0 z-[2] bg-[#faf7f2] text-left font-semibold text-gray-800 px-3 py-2 max-w-[280px] border-b border-gray-200'
  const numCell = 'px-3 py-2 text-right whitespace-nowrap tabular-nums border-b border-gray-100'
  const totCell =
    'px-3 py-2 text-right whitespace-nowrap tabular-nums font-bold border-b border-gray-100 bg-amber-50/80 border-l-2 border-l-amber-300'

  return (
    <GlassCard padding="small" className="w-full">
      <div className="overflow-x-auto rounded-xl">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className={`${labelCell} z-[3] align-bottom text-gray-500 text-xs font-semibold`}>{t('overview.item')}</th>
              {names.map((n) => (
                <th key={n} className={`${numCell} ${bankerCol(n)} align-bottom border-b-2 border-gray-300`}>
                  <span className="inline-flex flex-col items-end gap-1">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-extrabold ${getAvatarColor(n)}`}
                    >
                      {getInitials(n)}
                    </span>
                    <span className="font-serif font-extrabold text-sm text-gray-900 flex items-center gap-1">
                      {n}
                      {n === bankerName && <Crown size={12} className="text-primary" />}
                    </span>
                  </span>
                </th>
              ))}
              <th className={`${totCell} align-bottom text-amber-800 border-b-2 border-gray-300`}>{t('overview.sumCheck')}</th>
            </tr>
          </thead>
          <tbody>
            {/* Zaplaceno za ostatní */}
            <tr>
              <td className={labelCell}>💳 {t('overview.paidForOthers')}</td>
              {names.map((n) => (
                <td key={n} className={`${numCell} ${bankerCol(n)}`}>
                  {paidRow[n] ? formatCurrency(paidRow[n], locale) : <span className="text-gray-300">—</span>}
                </td>
              ))}
              <td className={totCell}>{formatCurrency(rowSum(paidRow), locale)}</td>
            </tr>

            {/* Zálohy / doplatky / vrácené přeplatky (signed → Σ = 0) */}
            {prepayRows.map(({ kind, label, values }) => (
              <tr key={kind}>
                <td className={labelCell}>
                  📤 {label}
                  <small className="block font-normal text-gray-400 text-[11px]">
                    {t('overview.prepaymentNote')}
                  </small>
                </td>
                {names.map((n) => (
                  <td key={n} className={`${numCell} ${bankerCol(n)}`}>
                    {values[n] !== undefined ? (
                      <SignedAmount value={values[n]} />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                ))}
                <td className={totCell}>{formatCurrency(Math.round(Math.abs(rowSum(values))), locale)}</td>
              </tr>
            ))}

            {/* Útrata — one row per expense */}
            <tr>
              <td className={`${labelCell} bg-[#f3efe7] uppercase tracking-wider text-[11px] text-gray-500`}>
                👤 {t('overview.fairShareHeader')}
              </td>
              <td
                colSpan={names.length}
                className={`${numCell} bg-gray-50/80 text-left uppercase tracking-wider text-[11px] text-gray-500`}
              >
                {t('overview.fairShareNote')}
              </td>
              <td className={`${totCell} uppercase tracking-wider text-[11px] text-amber-800`}>{t('overview.expensePrice')}</td>
            </tr>
            {expenseRows.map((row) => (
              <tr key={row.id}>
                <td className={labelCell}>
                  <span className="font-medium">{row.title}</span>
                  <small className="block font-normal text-gray-400 text-[11px] whitespace-normal">
                    {t('overview.paidBy', { name: row.payerLabel || '—' })}
                  </small>
                </td>
                {names.map((n) => {
                  const cell = row.cells[n]
                  if (!cell)
                    return (
                      <td key={n} className={`${numCell} ${bankerCol(n)}`}>
                        <span className="text-gray-300">—</span>
                      </td>
                    )
                  if (cell.invitedBy)
                    return (
                      <td key={n} className={`${numCell} ${bankerCol(n)} text-green-600`}>
                        {formatCurrency(0, locale)}
                        <span className="block text-[10.5px] text-green-600 font-normal">
                          {cell.auto
                            ? t('invitation.paysForYou', { name: cell.invitedBy })
                            : t('overview.pays', { name: cell.invitedBy })}
                        </span>
                      </td>
                    )
                  return (
                    <td key={n} className={`${numCell} ${bankerCol(n)}`}>
                      <ShareAmount cost={cell.cost} />
                      {(cell.weightIsAmount || cell.weight !== 1) && (
                        <span className="block text-[10.5px] text-gray-400 font-normal">
                          {podilLabel(t, locale, cell.weight, cell.weightIsAmount)}
                        </span>
                      )}
                      {cell.invitedGuests.length > 0 && (
                        <span className="block text-[10.5px] text-pink-600 font-normal">
                          {t('overview.plusFor', { names: cell.invitedGuests.join(', ') })}
                        </span>
                      )}
                    </td>
                  )
                })}
                <td className={totCell}>{formatCurrency(row.amount, locale)}</td>
              </tr>
            ))}

            {/* Útrata celkem */}
            <tr>
              <td className={`${labelCell} bg-[#f7f3ec] border-t-2 border-gray-300`}>{t('overview.totalFairShare')}</td>
              {names.map((n) => (
                <td key={n} className={`${numCell} ${bankerCol(n)} font-bold border-t-2 border-gray-300`}>
                  <ShareAmount cost={p(n).cost} />
                </td>
              ))}
              <td className={`${totCell} border-t-2 border-gray-300`}>{formatCurrency(totalActual, locale)}</td>
            </tr>

            {/* Aggregated planned rows — only when planned data exists, so the
                visible rows always add up to the result */}
            {hasPlanned && (
              <>
                <tr>
                  <td className={labelCell}>
                    🕑 {t('overview.plannedExpenses')}
                    <small className="block font-normal text-gray-400 text-[11px]">{t('overview.plannedNote')}</small>
                  </td>
                  {names.map((n) => (
                    <td key={n} className={`${numCell} ${bankerCol(n)} text-amber-700`}>
                      {p(n).plannedPaidExternal > 0 ? (
                        formatCurrency(p(n).plannedPaidExternal, locale)
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className={totCell}>
                    {formatCurrency(names.reduce((s, n) => s + p(n).plannedPaidExternal, 0), locale)}
                  </td>
                </tr>
                <tr>
                  <td className={labelCell}>🕑 {t('overview.plannedFairShare')}</td>
                  {names.map((n) => (
                    <td key={n} className={`${numCell} ${bankerCol(n)} text-amber-700`}>
                      {p(n).plannedCost > 0 ? (
                        <>− {formatCurrency(p(n).plannedCost, locale)}</>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  ))}
                  <td className={totCell}>{formatCurrency(names.reduce((s, n) => s + p(n).plannedCost, 0), locale)}</td>
                </tr>
              </>
            )}

            {/* Výsledek */}
            <tr>
              <td className={`${labelCell} bg-[#f7f3ec] border-t-2 border-gray-400 text-sm`}>{t('overview.result')}</td>
              {names.map((n) => {
                const v = verdict(p(n).balance)
                return (
                  <td
                    key={n}
                    className={`${numCell} ${bankerCol(n)} border-t-2 border-gray-400 font-extrabold text-sm ${
                      v === 'get' ? 'text-green-600' : v === 'owe' ? 'text-red-600' : 'text-gray-500'
                    }`}
                  >
                    {v === 'settled'
                      ? formatCurrency(0, locale)
                      : `${p(n).balance > 0 ? '+ ' : ''}${formatCurrency(Math.round(p(n).balance), locale)}`}
                  </td>
                )
              })}
              <td className={`${totCell} border-t-2 border-gray-400`}>
                {formatCurrency(Math.round(Math.abs(zeroSum)), locale)} ✓
              </td>
            </tr>

            {/* Verdict pills */}
            <tr>
              <td className={`${labelCell} border-b-0`} />
              {names.map((n) => {
                const v = verdict(p(n).balance)
                return (
                  <td key={n} className={`${numCell} ${bankerCol(n)} border-b-0 pt-0`}>
                    {n === bankerName ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-100 text-blue-700">
                        {t('overview.pillBanker')}
                      </span>
                    ) : v === 'settled' ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-gray-200 text-gray-600">
                        {t('overview.pillSettled')}
                      </span>
                    ) : v === 'get' ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-green-100 text-green-700">
                        {t('overview.pillGets')}
                      </span>
                    ) : (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-red-100 text-red-700">
                        {t('overview.pillOwes')}
                      </span>
                    )}
                  </td>
                )
              })}
              <td className={`${totCell} border-b-0`} />
            </tr>
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}

/* ------------------------------- cards mode ------------------------------- */

function OverviewCards({
  names,
  bankerName,
  stats,
}: {
  names: string[]
  bankerName: string
  stats: ChataStats
}) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 items-start">
      {names.map((n) => (
        <ParticipantCard key={n} name={n} isBanker={n === bankerName} stats={stats.participants[n]} />
      ))}
    </div>
  )
}

function ParticipantCard({
  name,
  isBanker,
  stats,
}: {
  name: string
  isBanker: boolean
  stats: ChataStats['participants'][string]
}) {
  const t = useTranslations('finance')
  const locale = useLocale() as AppLocale
  const v = verdict(stats.balance)
  const cardBg = isBanker
    ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'
    : v === 'owe'
      ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'
      : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
  const breakdown = stats.costBreakdown.filter((i) => !i.isPlanned)

  return (
    <div className={`rounded-2xl p-4 border shadow-lg ${cardBg}`}>
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-extrabold flex-none ${getAvatarColor(name)}`}
        >
          {getInitials(name)}
        </div>
        <div className="font-serif text-lg font-extrabold text-gray-900 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{name}</span>
          {isBanker && <Crown size={15} className="text-primary flex-none" />}
        </div>
        <div className="ml-auto text-right text-[11px] text-gray-500 flex-none">
          {v === 'settled' ? t('overview.pillSettled') : v === 'get' ? t('overview.pillGets') : t('overview.pillOwes')}
          <strong
            className={`block text-[15px] tabular-nums ${
              v === 'get' ? 'text-green-600' : v === 'owe' ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {formatCurrency(Math.round(Math.abs(v === 'settled' ? 0 : stats.balance)), locale)}
          </strong>
        </div>
      </div>

      <div className="space-y-1.5 text-[13px]">
        <div className="flex justify-between gap-3 text-gray-600">
          <span>💳 {t('overview.cardPaidForOthers')}</span>
          <strong className="text-gray-900 tabular-nums">{formatCurrency(stats.paidExternal, locale)}</strong>
        </div>
        {stats.plannedPaidExternal > 0 && (
          <div className="flex justify-between gap-3 text-amber-700">
            <span>🕑 {t('overview.cardStillToPay')}</span>
            <strong className="tabular-nums">{formatCurrency(stats.plannedPaidExternal, locale)}</strong>
          </div>
        )}
        {Math.abs(stats.prepaidAdvance) > 0.005 && (
          <div className="flex justify-between gap-3 text-gray-600">
            <span>📤 {isBanker ? t('overview.cardCollectedAdvances') : t('overview.cardAdvance')}</span>
            <SignedAmount value={stats.prepaidAdvance} />
          </div>
        )}
        {Math.abs(stats.prepaidSupplement) > 0.005 && (
          <div className="flex justify-between gap-3 text-gray-600">
            <span>📤 {isBanker ? t('overview.cardCollectedSupplements') : t('overview.cardSupplement')}</span>
            <SignedAmount value={stats.prepaidSupplement} />
          </div>
        )}
        {Math.abs(stats.prepaidRefund) > 0.005 && (
          <div className="flex justify-between gap-3 text-gray-600">
            <span>📤 {isBanker ? t('overview.cardRefundedOverpayments') : t('overview.cardRefundedOverpayment')}</span>
            <SignedAmount value={stats.prepaidRefund} />
          </div>
        )}
        <div className="flex justify-between gap-3 bg-white/50 -mx-1.5 px-1.5 py-1.5 rounded-lg text-gray-600">
          <span>👤 {t('overview.cardFairShare')}</span>
          <strong className="text-gray-900 tabular-nums">
            <ShareAmount cost={stats.cost} />
          </strong>
        </div>
        {breakdown.length > 0 && (
          <div className="bg-white/40 -mx-1.5 px-2 py-1.5 rounded-lg space-y-1">
            {breakdown.map((item, idx) => (
              <div key={idx} className="flex justify-between gap-2 text-[11.5px] text-gray-600">
                <span className="min-w-0">
                  {item.title} <small className="text-gray-400">({podilLabel(t, locale, item.weight, item.weightIsAmount)})</small>
                  {item.invitedGuest && (
                    <small className="text-pink-600"> · {item.auto ? t('invitation.youPayFor', { name: item.invitedGuest }) : t('invitation.invitationFor', { name: item.invitedGuest })}</small>
                  )}
                  {item.invitedBy && (
                    <small className="text-green-600"> · {item.auto ? t('invitation.paysForYou', { name: item.invitedBy }) : t('invitation.invitedYou', { name: item.invitedBy })}</small>
                  )}
                </span>
                <span className={`tabular-nums flex-none ${item.invitedBy ? 'text-green-600' : ''}`}>
                  {item.invitedBy ? formatCurrency(0, locale) : <ShareAmount cost={item.cost} />}
                </span>
              </div>
            ))}
          </div>
        )}
        {stats.plannedCost > 0 && (
          <div className="flex justify-between gap-3 text-amber-700">
            <span>🕑 {t('overview.cardPlannedFairShare')}</span>
            <strong className="tabular-nums">− {formatCurrency(stats.plannedCost, locale)}</strong>
          </div>
        )}
        <div
          className={`flex justify-between gap-3 items-center border-t border-dashed border-gray-300 mt-2 pt-2 text-gray-600`}
        >
          <span>{t('overview.cardResult')}</span>
          <strong
            className={`text-[15px] tabular-nums ${
              v === 'get' ? 'text-green-600' : v === 'owe' ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {v === 'settled'
              ? formatCurrency(0, locale)
              : `${stats.balance > 0 ? '+ ' : ''}${formatCurrency(Math.round(stats.balance), locale)}`}
          </strong>
        </div>
      </div>
    </div>
  )
}
