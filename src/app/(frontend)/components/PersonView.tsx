'use client'

import { useMemo, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import {
  Crown,
  ChevronDown,
  ChevronUp,
  Wallet,
  User,
  ArrowRight,
  ArrowDownLeft,
  Banknote,
  CheckCircle2,
  Receipt,
  ArrowLeft,
  Clock,
} from 'lucide-react'
import { GlassCard } from './GlassCard'
import { SettlementActions } from './SettlementActions'
import { PrivateExpensesCard } from './PrivateExpensesCard'
import { formatCurrency, getInitials, getAvatarColor } from '@/lib/formatCurrency'
import { track } from '@/lib/analytics'
import { getPayerDisplay, attributedShare } from '@/lib/payerRef'
import { isCountedExpense } from '@/lib/expenseAuthoring'
import { akuzativByName } from '@/lib/czechNames'
import { resolveBankAccount } from '@/utils/czechBankAccount'
import type { AppLocale } from '@/i18n/config'
import type { Participant, Chata, Prepayment, Expense } from '@/payload-types'
import type { ParticipantStats } from '@/utils/calculateStats'
import type { FinanceViewer } from '@/lib/financeAccess'
import type { PrivateSettleItem } from '@/lib/privateExpenses'

interface PersonViewProps {
  participant: Participant
  stats: ParticipantStats
  isBanker: boolean
  chata: Chata
  allParticipants: Participant[]
  creditors: Array<{ name: string; amount: number }>
  debtors: Array<{ name: string; amount: number }>
  prepayments: Prepayment[]
  expenses: Expense[]
  showHeader?: boolean
  /** creditor bank fields were withheld from this viewer (not admin/banker) */
  creditorAccountsHidden?: boolean
  /** who is looking — drives the private layer's settle buttons */
  viewer?: FinanceViewer | null
  /** marks direct payments on private expenses (docs/PRD-soukromy-vydaj.md) */
  onPrivateSettle?: (items: PrivateSettleItem[], settled: boolean) => Promise<void>
}

export function PersonView({
  participant,
  stats,
  isBanker,
  chata,
  allParticipants,
  creditors,
  debtors,
  prepayments,
  expenses,
  showHeader = true,
  creditorAccountsHidden = false,
  viewer = null,
  onPrivateSettle,
}: PersonViewProps) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)
  const [isPlannedBreakdownOpen, setIsPlannedBreakdownOpen] = useState(false)
  const t = useTranslations('finance')
  const locale = useLocale() as AppLocale

  const avatarColor = getAvatarColor(participant.name)
  const balance = stats.balance

  // Breakdown entries carry plain names; "platíš za …" / "pozvání pro …"
  // need the guest in the accusative case ("za Katku")
  const akuzativNames = useMemo(
    () => akuzativByName(allParticipants, locale),
    [allParticipants, locale]
  )
  const inAkuzativ = (name: string) => akuzativNames.get(name) ?? name

  // Settlement threshold: 1 Kč to avoid small rounding differences
  const isSettled = Math.abs(balance) <= 1
  const isPositive = balance >= 0

  // Get banker info - handle both number and Participant types
  const bankerId = typeof chata.banker === 'number' ? chata.banker : chata.banker?.id
  const bankerParticipant = allParticipants.find((p) => p.id === bankerId)
  const bankerName = bankerParticipant?.name || ''
  // Participants often fill only one of account number / IBAN — derive the
  // missing side so QR codes and manual-entry rows always have what they need
  const bankerBank = bankerParticipant
    ? resolveBankAccount(bankerParticipant.accountNumber, bankerParticipant.iban)
    : null
  const bankerAccount = bankerBank
    ? { number: bankerBank.accountNumber, iban: bankerBank.iban }
    : undefined

  // Determine summary box background color
  let summaryBgClass =
    'bg-gradient-to-br from-red-50 to-red-100 border border-red-200 dark:from-red-500/10 dark:to-red-500/15 dark:border-red-500/25'
  if (isBanker) {
    summaryBgClass =
      'bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 dark:from-sky-400/10 dark:to-sky-400/15 dark:border-sky-400/25'
  } else if (isSettled || isPositive) {
    summaryBgClass =
      'bg-gradient-to-br from-green-50 to-green-100 border border-green-200 dark:from-emerald-500/10 dark:to-emerald-500/15 dark:border-emerald-500/25'
  }

  // Helper to get display name from a payer/from ref (participant or joint
  // account), falling back to a participant lookup for bare IDs
  const getPayerName = (ref: unknown): string => {
    const info = getPayerDisplay(ref)
    if (info.name) return info.name
    if (info.id !== null) {
      const p = allParticipants.find((part) => part.id === info.id)
      return p?.name || ''
    }
    return ''
  }

  // Filter prepayments and expenses for history (exclude planned expenses,
  // and expenses somebody recorded for another payer that nobody has
  // confirmed yet — the numbers above ignore those as well).
  // Joint-account ("společný účet") payments count for each member.
  const myExpenses = expenses.filter((e) => {
    if (!isCountedExpense(e.approvalStatus)) return false
    // private expenses live in their own card — keeping them out here keeps
    // the history summing to "Zaplaceno za ostatní" above
    if (e.isPrivate === true) return false
    return getPayerDisplay(e.payer).memberIds.includes(participant.id) && !e.isPlanned
  })
  const myPrepayments = prepayments.filter((p) => {
    const info = getPayerDisplay(p.from)
    if (info.kind === 'participant') return info.memberIds.includes(participant.id)
    // A joint-account prepayment shows the member's own share — except for
    // the banker, whose share is pot-internal (the same prepayment already
    // appears in the incoming list with the counted part)
    return !isBanker && info.memberIds.includes(participant.id)
  })
  const incomingPrepayments = isBanker
    ? prepayments.filter((p) => {
        const info = getPayerDisplay(p.from)
        // Everything except the banker's own personal prepayments; a
        // joint-account prepayment stays even when the banker is a member
        // (the co-members' shares are real income for the pot)
        return info.kind === 'jointAccount' || !info.memberIds.includes(participant.id)
      })
    : []

  return (
    <div className="space-y-6">
      {/* Header with avatar and name - conditionally rendered */}
      {showHeader && (
        <GlassCard padding="medium">
          <div className="flex items-center gap-4">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold ${avatarColor}`}
            >
              {getInitials(participant.name)}
            </div>
            <div className="flex-1">
              <h2 className="font-serif text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {participant.name}
                {isBanker && <Crown className="text-primary dark:text-primary-light" size={28} />}
              </h2>
              {isBanker && (
                <span className="inline-block bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300 text-xs font-bold px-2 py-1 rounded-md mt-1 uppercase tracking-wide">
                  {t('personView.bankerBadge')}
                </span>
              )}
            </div>
          </div>
        </GlassCard>
      )}

      {/* Summary Box - Original style with colored background */}
      <div className={`rounded-2xl p-6 ${summaryBgClass}`}>
        <div className="space-y-3">
          {/* Row: Zaplaceno za ostatní */}
          <div className="flex justify-between items-center text-sm">
            <span className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
              <Wallet size={14} /> {t('personView.paidForOthers')}
            </span>
            <strong className="text-gray-900 dark:text-gray-100">{formatCurrency(stats.paidExternal, locale)}</strong>
          </div>

          {/* Row: Kolik ještě musíš zaplatit (planned expenses) - only if > 0 */}
          {stats.plannedPaidExternal > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <Clock size={14} /> {t('personView.stillToPay')}
              </span>
              <strong className="text-amber-700 dark:text-amber-300">
                {formatCurrency(stats.plannedPaidExternal, locale)}
              </strong>
            </div>
          )}

          {/* Prepayment rows - different for banker vs regular user */}
          {isBanker ? (
            <>
              {stats.prepaidAdvance !== 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
                    <ArrowDownLeft size={14} /> {t('personView.collectedAdvances')}
                  </span>
                  <strong className="text-gray-900 dark:text-gray-100">
                    - {formatCurrency(Math.abs(stats.prepaidAdvance), locale)}
                  </strong>
                </div>
              )}
              {stats.prepaidSupplement !== 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
                    <ArrowDownLeft size={14} /> {t('personView.collectedSupplements')}
                  </span>
                  <strong className="text-gray-900 dark:text-gray-100">
                    - {formatCurrency(Math.abs(stats.prepaidSupplement), locale)}
                  </strong>
                </div>
              )}
              {stats.prepaidRefund !== 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
                    <ArrowRight size={14} /> {t('personView.refundedOverpayments')}
                  </span>
                  <strong className="text-green-600 dark:text-green-400">
                    + {formatCurrency(Math.abs(stats.prepaidRefund), locale)}
                  </strong>
                </div>
              )}
            </>
          ) : (
            <>
              {stats.prepaidAdvance > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
                    <ArrowRight size={14} /> {t('personView.advance')}
                  </span>
                  <strong className="text-green-600 dark:text-green-400">
                    + {formatCurrency(stats.prepaidAdvance, locale)}
                  </strong>
                </div>
              )}
              {stats.prepaidSupplement > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
                    <ArrowRight size={14} /> {t('personView.supplement')}
                  </span>
                  <strong className="text-green-600 dark:text-green-400">
                    + {formatCurrency(stats.prepaidSupplement, locale)}
                  </strong>
                </div>
              )}
              {stats.prepaidRefund < 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
                    <ArrowDownLeft size={14} /> {t('personView.refundedOverpayment')}
                  </span>
                  <strong className="text-gray-900 dark:text-gray-100">
                    - {formatCurrency(Math.abs(stats.prepaidRefund), locale)}
                  </strong>
                </div>
              )}
            </>
          )}

          {/* Row: Fair Share (expandable) - only actual costs */}
          <div
            className="flex justify-between items-center text-sm bg-white/50 dark:bg-white/[0.06] -mx-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/80 dark:hover:bg-white/[0.1] transition-colors"
            onClick={() => {
              if (!isBreakdownOpen) track('breakdown_expanded', {})
              setIsBreakdownOpen(!isBreakdownOpen)
            }}
          >
            <div className="flex items-center gap-2 text-gray-600 dark:text-slate-300">
              <User size={14} /> {t('personView.fairShare')}
              {isBreakdownOpen ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </div>
            <strong className="text-gray-900 dark:text-gray-100">- {formatCurrency(stats.cost, locale)}</strong>
          </div>

          {/* Breakdown list for actual costs (expanded) */}
          {isBreakdownOpen && stats.costBreakdown && stats.costBreakdown.filter(item => !item.isPlanned).length > 0 && (
            <div className="bg-white/40 dark:bg-white/[0.04] -mx-2 px-2 py-2 rounded-lg space-y-1 animate-in slide-in-from-top-2 duration-200">
              {stats.costBreakdown.filter(item => !item.isPlanned).map((item, idx) => {
                const isCredit = item.cost < 0
                return (
                  <div key={idx} className="flex justify-between text-xs text-gray-600 dark:text-slate-300">
                    <span>
                      {item.title}
                      {' '}<small className="text-gray-500 dark:text-slate-400">({item.weightIsAmount ? t('share.amount', { amount: formatCurrency(item.weight, locale) }) : t('share.count', { count: item.weight })})</small>
                      {item.invitedGuest && (
                        <small className="text-pink-600 dark:text-pink-400">
                          {' '}· {item.auto ? t('invitation.youPayFor', { name: inAkuzativ(item.invitedGuest) }) : t('invitation.invitationFor', { name: inAkuzativ(item.invitedGuest) })}
                        </small>
                      )}
                      {item.invitedBy && (
                        <small className="text-green-600 dark:text-green-400">
                          {' '}· {item.auto ? t('invitation.paysForYou', { name: item.invitedBy }) : t('invitation.invitedYou', { name: item.invitedBy })}
                        </small>
                      )}
                    </span>
                    <span className={isCredit || item.invitedBy ? 'text-green-600 dark:text-green-400' : ''}>
                      {item.invitedBy
                        ? formatCurrency(0, locale)
                        : `${isCredit ? '+' : '-'} ${formatCurrency(Math.abs(item.cost), locale)}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Row: Planned Fair Share (expandable) - only if there are planned costs */}
          {stats.plannedCost > 0 && (
            <div
              className="flex justify-between items-center text-sm bg-amber-50/70 dark:bg-amber-400/10 -mx-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-amber-100/70 dark:hover:bg-amber-400/15 transition-colors"
              onClick={() => setIsPlannedBreakdownOpen(!isPlannedBreakdownOpen)}
            >
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <Clock size={14} /> {t('personView.plannedFairShare')}
                {isPlannedBreakdownOpen ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </div>
              <strong className="text-amber-700 dark:text-amber-300">- {formatCurrency(stats.plannedCost, locale)}</strong>
            </div>
          )}

          {/* Breakdown list for planned costs (expanded) */}
          {isPlannedBreakdownOpen && stats.costBreakdown && stats.costBreakdown.filter(item => item.isPlanned).length > 0 && (
            <div className="bg-white/60 dark:bg-white/[0.04] -mx-2 px-2 py-2 rounded-lg space-y-1 animate-in slide-in-from-top-2 duration-200">
              {stats.costBreakdown.filter(item => item.isPlanned).map((item, idx) => {
                const isCredit = item.cost < 0
                return (
                  <div key={idx} className="flex justify-between text-xs text-amber-800 dark:text-amber-200">
                    <span>
                      {item.title}
                      {' '}<small className="text-amber-700/80 dark:text-amber-300/80">({item.weightIsAmount ? t('share.amount', { amount: formatCurrency(item.weight, locale) }) : t('share.count', { count: item.weight })})</small>
                      {item.invitedGuest && (
                        <small className="text-pink-700 dark:text-pink-300">
                          {' '}· {item.auto ? t('invitation.youPayFor', { name: inAkuzativ(item.invitedGuest) }) : t('invitation.invitationFor', { name: inAkuzativ(item.invitedGuest) })}
                        </small>
                      )}
                      {item.invitedBy && (
                        <small className="text-green-700 dark:text-green-300">
                          {' '}· {item.auto ? t('invitation.paysForYou', { name: item.invitedBy }) : t('invitation.invitedYou', { name: item.invitedBy })}
                        </small>
                      )}
                    </span>
                    <span className={isCredit || item.invitedBy ? 'text-green-700 dark:text-green-300' : ''}>
                      {item.invitedBy
                        ? formatCurrency(0, locale)
                        : `${isCredit ? '+' : '-'} ${formatCurrency(Math.abs(item.cost), locale)}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Dashed separator */}
        <hr className="border-0 border-t-2 border-dashed border-black/10 dark:border-white/15 my-5" />

        {/* Result Section */}
        <div className="text-center">
          {/* Banker result - settled */}
          {isBanker && isSettled && (
            <div className="flex flex-col items-center text-green-600 dark:text-emerald-300">
              <CheckCircle2 size={48} className="mb-2" />
              <div className="text-2xl font-bold font-serif">{t('personView.allSettled')}</div>
            </div>
          )}

          {/* Banker result - not settled */}
          {isBanker && !isSettled && (
            <>
              <span className="uppercase text-xs font-bold tracking-wider text-gray-500 dark:text-slate-400">
                {balance < 0 ? t('personView.surplusToDistribute') : t('personView.missingToCollect')}
              </span>
              <div
                className={`text-5xl font-black font-serif mt-1 ${
                  balance < 0 ? 'text-blue-600 dark:text-sky-300' : 'text-red-600 dark:text-red-300'
                }`}
              >
                {formatCurrency(Math.abs(balance), locale)}
              </div>
            </>
          )}

          {/* Regular user - settled */}
          {!isBanker && isSettled && (
            <div className="flex flex-col items-center text-green-600 dark:text-emerald-300">
              <CheckCircle2 size={48} className="mb-2" />
              <div className="text-2xl font-bold font-serif">{t('personView.allSettled')}</div>
            </div>
          )}

          {/* Regular user - not settled */}
          {!isBanker && !isSettled && (
            <>
              <span className="uppercase text-xs font-bold tracking-wider text-gray-500 dark:text-slate-400">
                {isPositive ? t('personView.youGetBack') : t('personView.youOwe')}
              </span>
              <div className="text-5xl font-black font-serif mt-1 text-gray-900 dark:text-gray-100">
                {formatCurrency(Math.abs(balance), locale)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Private layer ("soukromé výdaje") — a separate purple card right
          under the pot summary: what this person owes payers directly and
          what others owe them, settled outside the pot. Renders nothing
          when no private expense reaches this viewer. */}
      {viewer && onPrivateSettle && (
        <PrivateExpensesCard
          participant={participant}
          allParticipants={allParticipants}
          expenses={expenses}
          viewer={viewer}
          bankerId={typeof bankerId === 'number' ? bankerId : null}
          potDebtors={debtors}
          potCreditors={creditors}
          chataShortName={chata.shortName || chata.name}
          onSettle={onPrivateSettle}
        />
      )}

      {/* Settlement Actions - only show if not settled OR if banker */}
      {(!isSettled || isBanker) && (
        <GlassCard padding="medium">
          <h3 className="flex items-center gap-2 text-gray-500 dark:text-slate-400 text-lg font-semibold border-b-2 border-gray-100 dark:border-white/[0.07] pb-2 mb-4">
            <Banknote size={20} /> {t('personView.howToSettle')}
          </h3>
          <SettlementActions
            participant={participant}
            balance={balance}
            isBanker={isBanker}
            bankerAccount={bankerAccount}
            chataShortName={chata.shortName || chata.name}
            creditors={creditors}
            debtors={debtors}
            participants={allParticipants}
            creditorAccountsHidden={creditorAccountsHidden}
          />
        </GlassCard>
      )}

      {/* History Section */}
      <GlassCard padding="medium">
        <h3 className="font-serif text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">{t('personView.paymentHistory')}</h3>
        <div className="divide-y divide-gray-100 dark:divide-white/[0.07]">
          {/* Banker's incoming prepayments */}
          {isBanker &&
            incomingPrepayments.map((p, i) => {
              const isRefund = p.type === 'refund' || p.type === 'distribution'
              const fromInfo = getPayerDisplay(p.from)
              const fromName = getPayerName(p.from) || t('personView.unknown')
              const isJointAccount = fromInfo.kind === 'jointAccount'
              // For a joint-account prepayment, only the non-banker members'
              // shares move money into the pot (the banker's share is
              // pot-internal) — show the counted part
              const countedAmount =
                isJointAccount && fromInfo.memberIds.length > 0
                  ? (p.amount * fromInfo.memberIds.filter((id) => id !== participant.id).length) /
                    fromInfo.memberIds.length
                  : p.amount
              return (
                <div key={`inc-${i}`} className="flex items-center gap-4 py-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isRefund ? 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                    }`}
                  >
                    {isRefund ? <ArrowRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="flex-1 font-medium text-gray-700 dark:text-slate-300">
                    {isRefund
                      ? t('personView.refundReturned', { name: fromName })
                      : p.type === 'supplement'
                        ? t('personView.receivedSupplement', { name: fromName })
                        : t('personView.receivedAdvance', { name: fromName })}
                    {isJointAccount && (
                      <span className="text-gray-400 dark:text-slate-500 text-sm"> {t('personView.jointAccountSuffix')}</span>
                    )}
                  </div>
                  <span className={isRefund ? 'text-red-600 dark:text-red-400 font-bold' : 'text-green-600 dark:text-green-400 font-bold'}>
                    {isRefund ? '-' : '+'} {formatCurrency(Math.abs(countedAmount), locale)}
                  </span>
                </div>
              )
            })}

          {/* User's prepayments */}
          {myPrepayments.map((p, i) => {
            const isRefund = p.type === 'refund' || p.type === 'distribution'
            const isJointAccount = getPayerDisplay(p.from).kind === 'jointAccount'
            // A joint-account prepayment counts the member's equal share only
            const myShare = attributedShare(p.from, p.amount)
            return (
              <div key={`prep-${i}`} className="flex items-center gap-4 py-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isRefund ? 'bg-green-100 text-green-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-green-100 text-green-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                  }`}
                >
                  {isRefund ? (
                    <ArrowDownLeft size={16} />
                  ) : (
                    <ArrowRight size={16} className="-rotate-45" />
                  )}
                </div>
                <div className="flex-1 font-medium text-gray-700 dark:text-slate-300">
                  {isRefund
                    ? t('personView.refundReturned', { name: bankerName })
                    : p.type === 'supplement'
                      ? t('personView.sentSupplement', { name: bankerName })
                      : t('personView.sentAdvance', { name: bankerName })}
                  {isJointAccount && (
                    <span className="text-gray-400 dark:text-slate-500 text-sm"> {t('personView.jointAccountYourShare')}</span>
                  )}
                </div>
                <span className="text-green-600 dark:text-green-400 font-bold">
                  {isRefund ? `${t('personView.received')} ` : '+'} {formatCurrency(Math.abs(myShare), locale)}
                </span>
              </div>
            )
          })}

          {/* User's expenses */}
          {myExpenses.map((e) => {
            const isRefund = e.amount < 0
            const isJointAccount = getPayerDisplay(e.payer).kind === 'jointAccount'
            // A joint-account payment counts the member's equal share only
            const myShare = attributedShare(e.payer, e.amount)
            return (
              <div key={e.id} className="flex items-center gap-4 py-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isRefund ? 'bg-green-100 text-green-600 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                  }`}
                >
                  {isRefund ? (
                    <ArrowLeft size={16} />
                  ) : (
                    <Receipt size={16} />
                  )}
                </div>
                <div className="flex-1 font-medium text-gray-700 dark:text-slate-300">
                  {e.title}
                  {isJointAccount && (
                    <span className="text-gray-400 dark:text-slate-500 text-sm">
                      {' '}
                      {t('personView.jointAccountYourShareTotal', {
                        amount: formatCurrency(Math.abs(e.amount), locale),
                      })}
                    </span>
                  )}
                </div>
                <span className={isRefund ? 'text-green-600 dark:text-green-400 font-bold' : 'text-red-600 dark:text-red-400 font-bold'}>
                  {isRefund ? `${t('personView.refunded')} ` : `${t('personView.payment')} `} {formatCurrency(Math.abs(myShare), locale)}
                </span>
              </div>
            )
          })}

          {/* Empty state */}
          {myExpenses.length === 0 && myPrepayments.length === 0 && incomingPrepayments.length === 0 && (
            <div className="text-center text-gray-500 dark:text-slate-400 py-4">{t('personView.noTransactions')}</div>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
