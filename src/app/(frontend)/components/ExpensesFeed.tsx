'use client'

import { useState } from 'react'
import { ExpenseCard } from './ExpenseCard'
import { GlassCard } from './GlassCard'
import type { Expense } from '@/payload-types'

interface ExpensesFeedProps {
  expenses: Expense[]
  selectedParticipantId: number | null
}

function isParticipantInExpense(expense: Expense, participantId: number): boolean {
  // Check if participant is the payer
  const payerId =
    typeof expense.payer === 'object' && expense.payer !== null
      ? expense.payer.id
      : expense.payer
  if (payerId === participantId) return true

  // For equal split, everyone is included
  if (expense.splitType === 'equal') return true

  // For weighted split, check if participant is in weights
  if (expense.weights) {
    return expense.weights.some((w) => {
      const weightParticipantId =
        typeof w.participant === 'object' && w.participant !== null
          ? w.participant.id
          : w.participant
      return weightParticipantId === participantId
    })
  }

  return false
}

export function ExpensesFeed({ expenses, selectedParticipantId }: ExpensesFeedProps) {
  const [showAll, setShowAll] = useState(false)

  // Sort expenses by ID (oldest first)
  const sortedExpenses = [...expenses].sort((a, b) => {
    const idA = typeof a.id === 'number' ? a.id : 0
    const idB = typeof b.id === 'number' ? b.id : 0
    return idA - idB
  })

  // Filter expenses based on selection
  const filteredExpenses = showAll
    ? sortedExpenses
    : sortedExpenses.filter(
        (expense) =>
          selectedParticipantId === null ||
          isParticipantInExpense(expense, selectedParticipantId)
      )

  return (
    <GlassCard padding="medium">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-xl font-bold text-gray-900 flex items-center gap-2">
          <span className="text-primary">📋</span> Deník výdajů
        </h3>
        <div className="text-xs text-gray-500">
          <button
            onClick={() => setShowAll(false)}
            className={`px-1 ${!showAll ? 'font-semibold text-gray-700' : 'hover:text-gray-700'}`}
          >
            moje
          </button>
          <span className="mx-1">|</span>
          <button
            onClick={() => setShowAll(true)}
            className={`px-1 ${showAll ? 'font-semibold text-gray-700' : 'hover:text-gray-700'}`}
          >
            vše
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-2">
        {filteredExpenses.length > 0 ? (
          filteredExpenses.map((expense) => {
            const isMine =
              selectedParticipantId !== null &&
              isParticipantInExpense(expense, selectedParticipantId)
            return (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                isMine={isMine}
                showAll={showAll}
                selectedParticipantId={selectedParticipantId}
              />
            )
          })
        ) : (
          <p className="text-gray-500 text-center py-8">
            Zatím nejsou žádné výdaje.
          </p>
        )}
      </div>
    </GlassCard>
  )
}
