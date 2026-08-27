'use client'

// "Soukromé výdaje · mimo pokladnu" (docs/PRD-soukromy-vydaj.md, design 1c):
// the private layer under the summary box. Debts get a QR straight to the
// payer's own account and a manual "paid" mark; the payer sees who still
// owes; mutual debts collapse into a netting hint; and when the pot moves
// money between the same two people anyway, a one-line tip suggests one
// combined bank transfer. The pot itself never appears here — this card is
// the only place a private expense turns into money.

import { useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Check, EyeOff, Lightbulb, QrCode, RotateCcw } from 'lucide-react'
import { formatCurrency } from '@/lib/formatCurrency'
import { accusativeName } from '@/lib/czechNames'
import { track } from '@/lib/analytics'
import { canSettlePrivateRow } from '@/lib/expenseAuthoring'
import {
  bankerCombineHints,
  buildPrivateLayer,
  nettingHints,
  type PrivateSettleItem,
} from '@/lib/privateExpenses'
import { resolveBankAccount } from '@/utils/czechBankAccount'
import { QRPayment } from './QRPayment'
import type { FinanceViewer } from '@/lib/financeAccess'
import type { AppLocale } from '@/i18n/config'
import type { Expense, Participant } from '@/payload-types'

interface PrivateExpensesCardProps {
  participant: Participant
  allParticipants: Participant[]
  expenses: Expense[]
  viewer: FinanceViewer
  bankerId: number | null
  /** chata-wide pot settlement (names), for the combine-transfer tips */
  potDebtors: Array<{ name: string; amount: number }>
  potCreditors: Array<{ name: string; amount: number }>
  chataShortName: string
  /** POSTs to /api/expenses/private-settle and reloads; throws on failure */
  onSettle: (items: PrivateSettleItem[], settled: boolean) => Promise<void>
}

export function PrivateExpensesCard({
  participant,
  allParticipants,
  expenses,
  viewer,
  bankerId,
  potDebtors,
  potCreditors,
  chataShortName,
  onSettle,
}: PrivateExpensesCardProps) {
  const t = useTranslations('finance')
  const locale = useLocale() as AppLocale
  const [openQr, setOpenQr] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => {
    const map = new Map<string, Participant>()
    for (const p of allParticipants) map.set(String(p.id), p)
    return map
  }, [allParticipants])
  const nameOf = (id: string | null) => (id != null ? (byId.get(id)?.name ?? '') : '')
  // "Pošli 800 Kč pro Martina" — the receiving name sits in the accusative
  const nameForPayment = (id: string | null) => {
    const found = id != null ? byId.get(id) : undefined
    return found ? accusativeName(found, locale) : ''
  }

  const layer = useMemo(() => buildPrivateLayer(expenses, participant.id), [expenses, participant.id])
  const hints = useMemo(() => nettingHints(expenses, participant.id), [expenses, participant.id])

  // pot transfer partners, for the banker combine tips (stats are name-keyed)
  const combineHints = useMemo(() => {
    const idsByNames = (rows: Array<{ name: string }>) =>
      rows.flatMap((row) => {
        const found = allParticipants.find((p) => p.name === row.name)
        return found ? [found.id] : []
      })
    return bankerCombineHints({
      viewerParticipantId: participant.id,
      bankerParticipantId: bankerId,
      debts: layer.debts,
      potDebtorIds: idsByNames(potDebtors),
      potCreditorIds: idsByNames(potCreditors),
    })
  }, [participant.id, bankerId, layer.debts, potDebtors, potCreditors, allParticipants])
  const combineByCounterpart = new Map(combineHints.map((h) => [h.counterpartId, h]))

  if (layer.debts.length === 0 && layer.paid.length === 0) return null

  const expenseById = new Map(expenses.map((e) => [String(e.id), e]))
  const isSuperadminUser = viewer.role === 'superadmin'

  const mayMark = (expenseId: string, participantId: string): boolean => {
    const expense = expenseById.get(expenseId)
    const member = byId.get(participantId)
    return canSettlePrivateRow({
      userId: viewer.userId,
      isSuperadminUser,
      payerAccountId: expense?.payerAccount != null ? Number(expense.payerAccount) : null,
      participantAccountId:
        member?.account != null
          ? typeof member.account === 'object'
            ? member.account.id
            : member.account
          : null,
    })
  }

  const settleRole = (items: PrivateSettleItem[]): 'payer' | 'member' | 'admin' => {
    const own = new Set(viewer.linkedParticipantIds.map(String))
    if (items.some((i) => own.has(i.participantId))) return 'member'
    const paysOne = items.some((i) => {
      const expense = expenseById.get(i.expenseId)
      return expense?.payerAccount != null && Number(expense.payerAccount) === viewer.userId
    })
    return paysOne ? 'payer' : 'admin'
  }

  const mark = async (items: PrivateSettleItem[], settled: boolean, key: string) => {
    if (savingKey !== null) return
    setSavingKey(key)
    setError(null)
    try {
      await onSettle(items, settled)
      track('private_settlement_marked', {
        role: settleRole(items),
        netted: items.length > 1,
        settled,
      })
    } catch {
      setError(t('privateLayer.saveFailed'))
    } finally {
      setSavingKey(null)
    }
  }

  const markButton = (items: PrivateSettleItem[], settled: boolean, key: string, label: string) => (
    <button
      type="button"
      disabled={savingKey !== null}
      onClick={() => mark(items, settled, key)}
      className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-full px-3 py-1.5 transition-colors disabled:opacity-50 ${
        settled
          ? 'bg-purple-600 text-white hover:bg-purple-700'
          : 'text-purple-700 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-400/15'
      }`}
    >
      {savingKey === key ? (
        t('privateLayer.saving')
      ) : settled ? (
        <>
          <Check size={13} strokeWidth={2.5} /> {label}
        </>
      ) : (
        <>
          <RotateCcw size={12} /> {label}
        </>
      )}
    </button>
  )

  const statusBadge = (settled: boolean) =>
    settled ? (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-500/15 px-2 py-0.5 rounded-full">
        <Check size={11} strokeWidth={3} /> {t('privateLayer.settled')}
      </span>
    ) : (
      <span className="text-[11.5px] font-bold text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-400/15 px-2 py-0.5 rounded-full">
        {t('privateLayer.waiting')}
      </span>
    )

  const qrBlock = (payeeId: string, amount: number, key: string) => {
    const payee = byId.get(payeeId)
    const bank = payee ? resolveBankAccount(payee.accountNumber, payee.iban) : null
    if (!bank?.accountNumber) {
      return (
        <p className="text-[12.5px] text-purple-700 dark:text-purple-300">
          {t('privateLayer.noBankDetails', { name: payee?.name ?? '' })}
        </p>
      )
    }
    const open = openQr === key
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpenQr(open ? null : key)}
          className="inline-flex items-center gap-1.5 self-start bg-purple-600 hover:bg-purple-700 text-white text-[13px] font-bold px-3.5 py-2 rounded-full shadow-md shadow-purple-600/30 transition-colors"
        >
          <QrCode size={14} /> {open ? t('privateLayer.qrHide') : t('privateLayer.qrButton')}
        </button>
        {open && (
          <div className="flex flex-col gap-1.5">
            <QRPayment
              amount={amount}
              accountNumber={bank.accountNumber}
              message={t('settlement.qrMessage', { name: chataShortName })}
            />
            <span className="text-[11.5px] text-purple-700 dark:text-purple-300">
              {t('settlement.accountNumber')}: {bank.accountNumber}
            </span>
          </div>
        )}
      </div>
    )
  }

  const displayName = (id: string) =>
    viewer.linkedParticipantIds.map(String).includes(id) ? t('privateLayer.you') : nameOf(id)

  return (
    <div className="rounded-2xl p-6 bg-gradient-to-br from-purple-50 to-violet-100 border border-purple-200 dark:from-purple-500/10 dark:to-purple-500/15 dark:border-purple-400/25">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <EyeOff size={16} className="text-purple-700 dark:text-purple-300" />
        <h3 className="font-serif text-lg font-bold text-purple-950 dark:text-purple-100">
          {t('privateLayer.title')}
        </h3>
        <span className="text-[11px] font-bold uppercase text-purple-700 bg-purple-100 border border-purple-200 dark:text-purple-200 dark:bg-purple-400/15 dark:border-purple-400/30 px-2 py-0.5 rounded-full">
          {t('privateLayer.outsidePot')}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {/* what this person owes the payers, expense by expense */}
        {layer.debts.map((debt) => {
          const key = `debt-${debt.expenseId}`
          const canMark = mayMark(debt.expenseId, String(participant.id))
          const combine = debt.payerParticipantId
            ? combineByCounterpart.get(debt.payerParticipantId)
            : undefined
          return (
            <div
              key={key}
              className="bg-white/60 dark:bg-white/[0.06] rounded-xl px-4 py-3 flex flex-col gap-2"
            >
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-[14px] font-semibold text-purple-950 dark:text-purple-100 min-w-0 break-words">
                  {debt.title}
                </span>
                <strong className="text-[14px] text-purple-950 dark:text-purple-100 flex-shrink-0">
                  − {formatCurrency(Math.round(debt.amount), locale)}
                </strong>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[12.5px] text-purple-800 dark:text-purple-300">
                <span>
                  {t(debt.isPlanned ? 'privateLayer.willPayDetail' : 'privateLayer.paidByDetail', {
                    name: nameOf(debt.payerParticipantId),
                  })}
                </span>
                {debt.isPlanned ? (
                  <span className="text-[11.5px] font-bold text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-400/15 px-2 py-0.5 rounded-full">
                    {t('privateLayer.plannedBadge')}
                  </span>
                ) : (
                  statusBadge(debt.settled)
                )}
              </div>
              {debt.isPlanned ? (
                <p className="text-[12px] text-purple-700 dark:text-purple-300">
                  {t('privateLayer.plannedHint')}
                </p>
              ) : (
                <>
                  {!debt.settled && debt.payerParticipantId && (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-[13px] text-purple-900 dark:text-purple-200">
                        {t('privateLayer.toPay', {
                          amount: formatCurrency(Math.round(debt.amount), locale),
                          name: nameForPayment(debt.payerParticipantId),
                        })}
                      </span>
                      {qrBlock(debt.payerParticipantId, Math.round(debt.amount), key)}
                    </div>
                  )}
                  {combine && (
                    <p className="flex items-start gap-1.5 text-[12px] text-purple-700 dark:text-purple-300">
                      <Lightbulb size={13} className="flex-shrink-0 mt-0.5" />
                      {combine.potTransfer === 'refund'
                        ? t('privateLayer.bankerCombineRefund', {
                            name: nameOf(debt.payerParticipantId),
                          })
                        : t('privateLayer.bankerCombineTopup')}
                    </p>
                  )}
                  {canMark &&
                    markButton(
                      [{ expenseId: debt.expenseId, participantId: String(participant.id) }],
                      !debt.settled,
                      key,
                      debt.settled ? t('privateLayer.unmark') : t('privateLayer.markPaid'),
                    )}
                </>
              )}
            </div>
          )
        })}

        {/* netting: mutual debts with one counterpart shrink to a difference */}
        {hints.map((hint) => {
          const key = `net-${hint.counterpartId}`
          const name = nameOf(hint.counterpartId)
          const amount = formatCurrency(Math.round(hint.difference), locale)
          const canMarkAll = hint.items.every((item) => mayMark(item.expenseId, item.participantId))
          return (
            <div
              key={key}
              className="border border-purple-300 dark:border-purple-400/40 rounded-xl px-4 py-3 flex flex-col gap-2"
            >
              <p className="flex items-start gap-1.5 text-[13px] text-purple-900 dark:text-purple-200">
                <Lightbulb size={14} className="flex-shrink-0 mt-0.5" />
                {hint.direction === 'even'
                  ? t('privateLayer.nettingEven', { name })
                  : hint.direction === 'send'
                    ? t('privateLayer.nettingSend', { name, amount })
                    : t('privateLayer.nettingReceive', { name, amount })}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                {hint.direction === 'send' &&
                  qrBlock(hint.counterpartId, Math.round(hint.difference), key)}
                {canMarkAll &&
                  markButton(hint.items, true, key, t('privateLayer.nettingMarkAll'))}
              </div>
            </div>
          )
        })}

        {/* what this person fronted, member by member */}
        {layer.paid.map((row) => {
          const key = `paid-${row.expenseId}`
          return (
            <div
              key={key}
              className="bg-white/60 dark:bg-white/[0.06] rounded-xl px-4 py-3 flex flex-col gap-2"
            >
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-[14px] font-semibold text-purple-950 dark:text-purple-100 min-w-0 break-words">
                  {row.title}
                </span>
                {/* a planned expense has not been paid, so nothing is owed
                    back yet — amber and future tense until it is real */}
                <strong
                  className={`text-[14px] flex-shrink-0 ${
                    row.isPlanned
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-green-700 dark:text-green-400'
                  }`}
                >
                  + {formatCurrency(Math.round(row.net), locale)}
                </strong>
              </div>
              <div className="text-[12.5px] text-purple-800 dark:text-purple-300 flex items-center gap-2 flex-wrap">
                <span>
                  {t(
                    row.isPlanned
                      ? row.ownShare > 0
                        ? 'privateLayer.willPaySummary'
                        : 'privateLayer.willPaySummaryNoShare'
                      : row.ownShare > 0
                        ? 'privateLayer.paidSummary'
                        : 'privateLayer.paidSummaryNoShare',
                    {
                      paid: formatCurrency(Math.round(row.paidTotal), locale),
                      share: formatCurrency(Math.round(row.ownShare), locale),
                    },
                  )}
                </span>
                {row.isPlanned && (
                  <span className="text-[11.5px] font-bold text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-400/15 px-2 py-0.5 rounded-full">
                    {t('privateLayer.plannedBadge')}
                  </span>
                )}
              </div>
              {row.isPlanned && (
                <p className="text-[12px] text-purple-700 dark:text-purple-300">
                  {t('privateLayer.plannedHint')}
                </p>
              )}
              {!row.isPlanned && (
                <div className="flex flex-col gap-1.5">
                  {row.members.map((member) => {
                    const memberKey = `${key}-${member.participantId}`
                    const canMark = mayMark(row.expenseId, member.participantId)
                    return (
                      <div
                        key={memberKey}
                        className="flex items-center justify-between gap-2 bg-white/70 dark:bg-white/[0.05] rounded-lg px-3 py-2"
                      >
                        <span className="text-[13px] text-purple-950 dark:text-purple-100">
                          {displayName(member.participantId)} ·{' '}
                          {formatCurrency(Math.round(member.amount), locale)}
                        </span>
                        <span className="flex items-center gap-2">
                          {statusBadge(member.settled)}
                          {canMark &&
                            markButton(
                              [{ expenseId: row.expenseId, participantId: member.participantId }],
                              !member.settled,
                              memberKey,
                              member.settled
                                ? t('privateLayer.unmark')
                                : t('privateLayer.markPaid'),
                            )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {error && (
          <p className="text-[12.5px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <p className="text-[12px] text-purple-700 dark:text-purple-300 leading-relaxed">
          {layer.paid.length > 0 ? t('privateLayer.payerFooter') : t('privateLayer.debtFooter')}
        </p>
      </div>
    </div>
  )
}
