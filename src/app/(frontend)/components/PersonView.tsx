'use client'

import { useState } from 'react'
import { User, Crown, ChevronDown, ChevronUp } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { SettlementActions } from './SettlementActions'
import { formatCurrency, getInitials, getAvatarColor } from '@/lib/formatCurrency'
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
}: PersonViewProps) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)

  const avatarColor = getAvatarColor(participant.name)
  const balance = stats.balance

  // Get banker account info
  const bankerParticipant = allParticipants.find((p) => p.id === chata.banker)
  const bankerAccount = bankerParticipant
    ? {
        number: bankerParticipant.accountNumber || chata.accountNumber || '',
        iban: bankerParticipant.iban || chata.iban || '',
      }
    : undefined

  return (
    <div className="space-y-6">
      {/* Header with avatar and name */}
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
              <span className="inline-block bg-primary/10 text-primary text-sm font-semibold px-3 py-1 rounded-lg mt-1">
                Bankéř
              </span>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Summary Box */}
      <GlassCard padding="medium">
        <h3 className="font-serif text-xl font-bold text-gray-900 mb-4">
          Přehled financí
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Zaplatil/a celkem</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(stats.paidExternal)}
            </div>
          </div>

          <div className="bg-white/50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Zálohy (netto)</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(stats.prepaidInternal)}
            </div>
          </div>

          <div className="bg-white/50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Spravedlivý podíl</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(stats.cost)}
            </div>
          </div>

          <div
            className={`p-4 rounded-lg ${
              balance > 0.01
                ? 'bg-green-100'
                : balance < -0.01
                  ? 'bg-red-100'
                  : 'bg-gray-100'
            }`}
          >
            <div className="text-sm text-gray-600 mb-1">Bilance</div>
            <div
              className={`text-2xl font-bold ${
                balance > 0.01
                  ? 'text-green-600'
                  : balance < -0.01
                    ? 'text-red-600'
                    : 'text-gray-900'
              }`}
            >
              {formatCurrency(balance)}
            </div>
          </div>
        </div>

        {/* Prepayment breakdown */}
        {(stats.prepaidAdvance !== 0 ||
          stats.prepaidSupplement !== 0 ||
          stats.prepaidRefund !== 0) && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600 mb-2">Detaily záloh:</div>
            <div className="space-y-1 text-sm">
              {stats.prepaidAdvance !== 0 && (
                <div className="flex justify-between">
                  <span>Záloha:</span>
                  <span className="font-semibold">
                    {formatCurrency(stats.prepaidAdvance)}
                  </span>
                </div>
              )}
              {stats.prepaidSupplement !== 0 && (
                <div className="flex justify-between">
                  <span>Doplatek:</span>
                  <span className="font-semibold">
                    {formatCurrency(stats.prepaidSupplement)}
                  </span>
                </div>
              )}
              {stats.prepaidRefund !== 0 && (
                <div className="flex justify-between">
                  <span>Vráceno:</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(Math.abs(stats.prepaidRefund))}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </GlassCard>

      {/* Cost Breakdown - Collapsible */}
      {stats.costBreakdown && stats.costBreakdown.length > 0 && (
        <GlassCard padding="medium">
          <button
            onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
            className="w-full flex items-center justify-between text-left"
          >
            <h3 className="font-serif text-xl font-bold text-gray-900">
              Rozpis nákladů ({stats.costBreakdown.length})
            </h3>
            {isBreakdownOpen ? (
              <ChevronUp className="text-gray-600" />
            ) : (
              <ChevronDown className="text-gray-600" />
            )}
          </button>

          {isBreakdownOpen && (
            <div className="mt-4 space-y-2">
              {stats.costBreakdown.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center bg-white/50 p-3 rounded-lg"
                >
                  <span className="text-gray-900">{item.title}</span>
                  <span className="font-semibold text-gray-900">
                    {formatCurrency(item.cost)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center bg-primary/10 p-3 rounded-lg font-bold">
                <span className="text-gray-900">Celkem</span>
                <span className="text-gray-900">{formatCurrency(stats.cost)}</span>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* Settlement Actions */}
      <GlassCard padding="medium">
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
    </div>
  )
}
