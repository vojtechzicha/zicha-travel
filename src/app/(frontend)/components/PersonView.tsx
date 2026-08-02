'use client'

import { useMemo, useState } from 'react'
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
import { formatCurrency, getInitials, getAvatarColor } from '@/lib/formatCurrency'
import { getPayerDisplay, attributedShare } from '@/lib/payerRef'
import { akuzativByName } from '@/lib/czechNames'
import { resolveBankAccount } from '@/utils/czechBankAccount'
import type { Participant, Chata, Prepayment, Expense } from '@/payload-types'
import type { ParticipantStats } from '@/utils/calculateStats'

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
}: PersonViewProps) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)
  const [isPlannedBreakdownOpen, setIsPlannedBreakdownOpen] = useState(false)

  const avatarColor = getAvatarColor(participant.name)
  const balance = stats.balance

  // Breakdown entries carry plain names; "platíš za …" / "pozvání pro …"
  // need the guest in the accusative case ("za Katku")
  const akuzativNames = useMemo(() => akuzativByName(allParticipants), [allParticipants])
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
    ? resolveBankAccount(
        bankerParticipant.accountNumber || chata.bankerAccountNumber,
        bankerParticipant.iban || chata.bankerIban
      )
    : null
  const bankerAccount = bankerBank
    ? { number: bankerBank.accountNumber, iban: bankerBank.iban }
    : undefined

  // Determine summary box background color
  let summaryBgClass = 'bg-gradient-to-br from-red-50 to-red-100 border border-red-200'
  if (isBanker) {
    summaryBgClass = 'bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200'
  } else if (isSettled || isPositive) {
    summaryBgClass = 'bg-gradient-to-br from-green-50 to-green-100 border border-green-200'
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

  // Filter prepayments and expenses for history (exclude planned expenses).
  // Joint-account ("společný účet") payments count for each member.
  const myExpenses = expenses.filter((e) => {
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
              <h2 className="font-serif text-3xl font-bold text-gray-900 flex items-center gap-2">
                {participant.name}
                {isBanker && <Crown className="text-primary" size={28} />}
              </h2>
              {isBanker && (
                <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-md mt-1 uppercase tracking-wide">
                  Pokladník
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
            <span className="flex items-center gap-2 text-gray-600">
              <Wallet size={14} /> Zaplaceno za ostatní:
            </span>
            <strong className="text-gray-900">{formatCurrency(stats.paidExternal)}</strong>
          </div>

          {/* Row: Kolik ještě musíš zaplatit (planned expenses) - only if > 0 */}
          {stats.plannedPaidExternal > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2 text-amber-700">
                <Clock size={14} /> Kolik ještě musíš zaplatit:
              </span>
              <strong className="text-amber-700">{formatCurrency(stats.plannedPaidExternal)}</strong>
            </div>
          )}

          {/* Prepayment rows - different for banker vs regular user */}
          {isBanker ? (
            <>
              {stats.prepaidAdvance !== 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <ArrowDownLeft size={14} /> Vybráno na zálohách:
                  </span>
                  <strong className="text-gray-900">
                    - {formatCurrency(Math.abs(stats.prepaidAdvance))}
                  </strong>
                </div>
              )}
              {stats.prepaidSupplement !== 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <ArrowDownLeft size={14} /> Vybráno na doplatcích:
                  </span>
                  <strong className="text-gray-900">
                    - {formatCurrency(Math.abs(stats.prepaidSupplement))}
                  </strong>
                </div>
              )}
              {stats.prepaidRefund !== 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <ArrowRight size={14} /> Vráceno přeplatky:
                  </span>
                  <strong className="text-green-600">
                    + {formatCurrency(Math.abs(stats.prepaidRefund))}
                  </strong>
                </div>
              )}
            </>
          ) : (
            <>
              {stats.prepaidAdvance > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <ArrowRight size={14} /> Záloha:
                  </span>
                  <strong className="text-green-600">
                    + {formatCurrency(stats.prepaidAdvance)}
                  </strong>
                </div>
              )}
              {stats.prepaidSupplement > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <ArrowRight size={14} /> Doplatek:
                  </span>
                  <strong className="text-green-600">
                    + {formatCurrency(stats.prepaidSupplement)}
                  </strong>
                </div>
              )}
              {stats.prepaidRefund < 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-gray-600">
                    <ArrowDownLeft size={14} /> Vrácený přeplatek:
                  </span>
                  <strong className="text-gray-900">
                    - {formatCurrency(Math.abs(stats.prepaidRefund))}
                  </strong>
                </div>
              )}
            </>
          )}

          {/* Row: Fair Share (expandable) - only actual costs */}
          <div
            className="flex justify-between items-center text-sm bg-white/50 -mx-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-white/80 transition-colors"
            onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
          >
            <div className="flex items-center gap-2 text-gray-600">
              <User size={14} /> Tvá útrata (Fair Share):
              {isBreakdownOpen ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </div>
            <strong className="text-gray-900">- {formatCurrency(stats.cost)}</strong>
          </div>

          {/* Breakdown list for actual costs (expanded) */}
          {isBreakdownOpen && stats.costBreakdown && stats.costBreakdown.filter(item => !item.isPlanned).length > 0 && (
            <div className="bg-white/40 -mx-2 px-2 py-2 rounded-lg space-y-1 animate-in slide-in-from-top-2 duration-200">
              {stats.costBreakdown.filter(item => !item.isPlanned).map((item, idx) => {
                const isCredit = item.cost < 0
                return (
                  <div key={idx} className="flex justify-between text-xs text-gray-600">
                    <span>
                      {item.title}
                      {' '}<small className="text-gray-500">({item.weightIsAmount ? `podíl ${formatCurrency(item.weight)}` : `${item.weight} ${item.weight === 1 ? 'podíl' : item.weight >= 2 && item.weight <= 4 ? 'podíly' : 'podílů'}`})</small>
                      {item.invitedGuest && (
                        <small className="text-pink-600">
                          {' '}· {item.auto ? `platíš za ${inAkuzativ(item.invitedGuest)}` : `pozvání pro ${inAkuzativ(item.invitedGuest)}`}
                        </small>
                      )}
                      {item.invitedBy && (
                        <small className="text-green-600">
                          {' '}· {item.auto ? `platí za tebe ${item.invitedBy}` : `pozval/a tě ${item.invitedBy}`}
                        </small>
                      )}
                    </span>
                    <span className={isCredit || item.invitedBy ? 'text-green-600' : ''}>
                      {item.invitedBy
                        ? formatCurrency(0)
                        : `${isCredit ? '+' : '-'} ${formatCurrency(Math.abs(item.cost))}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Row: Planned Fair Share (expandable) - only if there are planned costs */}
          {stats.plannedCost > 0 && (
            <div
              className="flex justify-between items-center text-sm bg-amber-50/70 -mx-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-amber-100/70 transition-colors"
              onClick={() => setIsPlannedBreakdownOpen(!isPlannedBreakdownOpen)}
            >
              <div className="flex items-center gap-2 text-amber-700">
                <Clock size={14} /> Plánovaná útrata (Fair Share):
                {isPlannedBreakdownOpen ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </div>
              <strong className="text-amber-700">- {formatCurrency(stats.plannedCost)}</strong>
            </div>
          )}

          {/* Breakdown list for planned costs (expanded) */}
          {isPlannedBreakdownOpen && stats.costBreakdown && stats.costBreakdown.filter(item => item.isPlanned).length > 0 && (
            <div className="bg-white/60 -mx-2 px-2 py-2 rounded-lg space-y-1 animate-in slide-in-from-top-2 duration-200">
              {stats.costBreakdown.filter(item => item.isPlanned).map((item, idx) => {
                const isCredit = item.cost < 0
                return (
                  <div key={idx} className="flex justify-between text-xs text-amber-800">
                    <span>
                      {item.title}
                      {' '}<small className="text-amber-700/80">({item.weightIsAmount ? `podíl ${formatCurrency(item.weight)}` : `${item.weight} ${item.weight === 1 ? 'podíl' : item.weight >= 2 && item.weight <= 4 ? 'podíly' : 'podílů'}`})</small>
                      {item.invitedGuest && (
                        <small className="text-pink-700">
                          {' '}· {item.auto ? `platíš za ${inAkuzativ(item.invitedGuest)}` : `pozvání pro ${inAkuzativ(item.invitedGuest)}`}
                        </small>
                      )}
                      {item.invitedBy && (
                        <small className="text-green-700">
                          {' '}· {item.auto ? `platí za tebe ${item.invitedBy}` : `pozval/a tě ${item.invitedBy}`}
                        </small>
                      )}
                    </span>
                    <span className={isCredit || item.invitedBy ? 'text-green-700' : ''}>
                      {item.invitedBy
                        ? formatCurrency(0)
                        : `${isCredit ? '+' : '-'} ${formatCurrency(Math.abs(item.cost))}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Dashed separator */}
        <hr className="border-0 border-t-2 border-dashed border-black/10 my-5" />

        {/* Result Section */}
        <div className="text-center">
          {/* Banker result - settled */}
          {isBanker && isSettled && (
            <div className="flex flex-col items-center text-green-600">
              <CheckCircle2 size={48} className="mb-2" />
              <div className="text-2xl font-bold font-serif">Vše vyrovnáno</div>
            </div>
          )}

          {/* Banker result - not settled */}
          {isBanker && !isSettled && (
            <>
              <span className="uppercase text-xs font-bold tracking-wider text-gray-500">
                {balance < 0 ? 'Přebytek k rozdělení' : 'Chybí vybrat'}
              </span>
              <div
                className={`text-5xl font-black font-serif mt-1 ${
                  balance < 0 ? 'text-blue-600' : 'text-red-600'
                }`}
              >
                {formatCurrency(Math.abs(balance))}
              </div>
            </>
          )}

          {/* Regular user - settled */}
          {!isBanker && isSettled && (
            <div className="flex flex-col items-center text-green-600">
              <CheckCircle2 size={48} className="mb-2" />
              <div className="text-2xl font-bold font-serif">Vše vyrovnáno</div>
            </div>
          )}

          {/* Regular user - not settled */}
          {!isBanker && !isSettled && (
            <>
              <span className="uppercase text-xs font-bold tracking-wider text-gray-500">
                {isPositive ? 'Dostaneš zpět' : 'Doplácíš'}
              </span>
              <div className="text-5xl font-black font-serif mt-1 text-gray-900">
                {formatCurrency(Math.abs(balance))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Settlement Actions - only show if not settled OR if banker */}
      {(!isSettled || isBanker) && (
        <GlassCard padding="medium">
          <h3 className="flex items-center gap-2 text-gray-500 text-lg font-semibold border-b-2 border-gray-100 pb-2 mb-4">
            <Banknote size={20} /> Jak se vyrovnat
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
          />
        </GlassCard>
      )}

      {/* History Section */}
      <GlassCard padding="medium">
        <h3 className="font-serif text-xl font-bold text-gray-900 mb-4">Historie plateb</h3>
        <div className="divide-y divide-gray-100">
          {/* Banker's incoming prepayments */}
          {isBanker &&
            incomingPrepayments.map((p, i) => {
              const isRefund = p.type === 'refund' || p.type === 'distribution'
              const fromInfo = getPayerDisplay(p.from)
              const fromName = getPayerName(p.from) || 'Neznámý'
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
                      isRefund ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                    }`}
                  >
                    {isRefund ? <ArrowRight size={16} /> : <ArrowDownLeft size={16} />}
                  </div>
                  <div className="flex-1 font-medium text-gray-700">
                    {isRefund
                      ? `Vrácen přeplatek (${fromName})`
                      : p.type === 'supplement'
                        ? `Přijatý doplatek (${fromName})`
                        : `Přijatá záloha (${fromName})`}
                    {isJointAccount && (
                      <span className="text-gray-400 text-sm"> – společný účet</span>
                    )}
                  </div>
                  <span className={isRefund ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                    {isRefund ? '-' : '+'} {formatCurrency(Math.abs(countedAmount))}
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
                    isRefund ? 'bg-green-100 text-green-600' : 'bg-green-100 text-green-600'
                  }`}
                >
                  {isRefund ? (
                    <ArrowDownLeft size={16} />
                  ) : (
                    <ArrowRight size={16} className="-rotate-45" />
                  )}
                </div>
                <div className="flex-1 font-medium text-gray-700">
                  {isRefund
                    ? `Vrácen přeplatek (${bankerName})`
                    : p.type === 'supplement'
                      ? `Odeslán doplatek (${bankerName})`
                      : `Odeslána záloha (${bankerName})`}
                  {isJointAccount && (
                    <span className="text-gray-400 text-sm"> – společný účet, tvá část</span>
                  )}
                </div>
                <span className="text-green-600 font-bold">
                  {isRefund ? 'Přijato ' : '+'} {formatCurrency(Math.abs(myShare))}
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
                    isRefund ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}
                >
                  {isRefund ? (
                    <ArrowLeft size={16} />
                  ) : (
                    <Receipt size={16} />
                  )}
                </div>
                <div className="flex-1 font-medium text-gray-700">
                  {e.title}
                  {isJointAccount && (
                    <span className="text-gray-400 text-sm">
                      {' '}
                      – společný účet, tvá část (celkem {formatCurrency(Math.abs(e.amount))})
                    </span>
                  )}
                </div>
                <span className={isRefund ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                  {isRefund ? 'Vráceno ' : 'Platba '} {formatCurrency(Math.abs(myShare))}
                </span>
              </div>
            )
          })}

          {/* Empty state */}
          {myExpenses.length === 0 && myPrepayments.length === 0 && incomingPrepayments.length === 0 && (
            <div className="text-center text-gray-500 py-4">Žádné transakce.</div>
          )}
        </div>
      </GlassCard>
    </div>
  )
}
