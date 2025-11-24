'use client'

import { useState } from 'react'
import { Receipt, ArrowLeft, Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/formatCurrency'
import type { Expense } from '@/payload-types'

const MAX_VISIBLE_OTHERS = 5

interface ExpenseCardProps {
  expense: Expense
  isMine?: boolean
  showAll?: boolean
  selectedParticipantId?: number | null
}

export function ExpenseCard({
  expense,
  isMine = true,
  showAll = false,
  selectedParticipantId,
}: ExpenseCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isRefund = expense.amount < 0
  const isPlanned = expense.isPlanned || false
  const payerName =
    typeof expense.payer === 'object' && expense.payer !== null
      ? expense.payer.name
      : ''

  // Muted styling for "other" expenses when showing all
  const isOther = showAll && !isMine

  // Process weights for display
  const weights = expense.weights ?? []
  const myWeight = weights.find((w) => {
    const participantId =
      typeof w.participant === 'object' && w.participant !== null
        ? w.participant.id
        : w.participant
    return participantId === selectedParticipantId
  })
  const otherWeights = weights.filter((w) => {
    const participantId =
      typeof w.participant === 'object' && w.participant !== null
        ? w.participant.id
        : w.participant
    return participantId !== selectedParticipantId
  })

  const totalOthers = otherWeights.length
  const visibleOthers = expanded ? otherWeights : otherWeights.slice(0, MAX_VISIBLE_OTHERS)
  const hiddenCount = totalOthers - MAX_VISIBLE_OTHERS

  const renderWeightBadge = (w: (typeof weights)[0]) => {
    const participantName =
      typeof w.participant === 'object' && w.participant !== null
        ? w.participant.name
        : ''
    return (
      <span
        key={participantName}
        className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-md"
      >
        {participantName}: {w.weight}x
      </span>
    )
  }

  return (
    <div
      className={`
        rounded-xl p-4 shadow-md flex gap-3 transition-transform hover:scale-[1.02]
        ${isOther ? 'bg-gray-50 opacity-60' : 'bg-white'}
        ${isRefund ? 'border-2 border-green-200' : ''}
        ${isPlanned ? 'border-2 border-dashed border-amber-300 bg-amber-50/50' : ''}
      `}
    >
      <div className="flex-shrink-0">
        {isPlanned ? (
          <div className="bg-amber-100 p-2 rounded-lg">
            <Clock size={20} className="text-amber-600" />
          </div>
        ) : isRefund ? (
          <div className="bg-green-100 p-2 rounded-lg">
            <ArrowLeft size={20} className="text-green-600" />
          </div>
        ) : (
          <div className="bg-primary/10 p-2 rounded-lg">
            <Receipt size={20} className="text-primary" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 mb-1">
          <span className="font-semibold text-gray-900 truncate min-w-0">{expense.title}</span>
          <span
            className={`font-bold flex-shrink-0 ${
              isPlanned ? 'text-amber-600' : isRefund ? 'text-green-600' : 'text-gray-900'
            }`}
          >
            {formatCurrency(expense.amount)}
          </span>
        </div>

        <div className="text-sm text-gray-600 mb-2 flex items-center gap-2 flex-wrap">
          <span>
            {isPlanned ? 'Zaplatí ' : isRefund ? 'Peníze vrátil/a ' : 'Platil/a '}
            <strong>{payerName}</strong>
          </span>
          {isPlanned && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-md uppercase">
              Plánovaný
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {expense.splitType === 'equal' ? (
            <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-md">
              Všichni rovným dílem
            </span>
          ) : (
            <>
              {/* Current user first */}
              {myWeight && renderWeightBadge(myWeight)}
              {/* Other participants */}
              {visibleOthers.map((w) => renderWeightBadge(w))}
              {/* Show more/less button */}
              {hiddenCount > 0 && !expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-md hover:bg-gray-300 transition-colors"
                >
                  +{hiddenCount} dalších
                </button>
              )}
              {expanded && totalOthers > MAX_VISIBLE_OTHERS && (
                <button
                  onClick={() => setExpanded(false)}
                  className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-md hover:bg-gray-300 transition-colors"
                >
                  skrýt
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
