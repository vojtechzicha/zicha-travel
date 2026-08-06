'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { ExpenseCard } from './ExpenseCard'
import { GlassCard } from './GlassCard'
import { isPayerOrMember } from '@/lib/payerRef'
import type { Expense } from '@/payload-types'

interface ExpensesFeedProps {
  expenses: Expense[]
  selectedParticipantId: number | null
  /** signed-in account id — expenses it authored get the manage footer */
  viewerUserId?: number | null
  onEditExpense?: (expense: Expense) => void
  onDeleteExpense?: (expense: Expense) => Promise<void>
  /** anonymous visitors: subtle bar that signing in unlocks authoring (1e) */
  showLoginHint?: boolean
}

function isParticipantInExpense(expense: Expense, participantId: number): boolean {
  // Check if participant is the payer (or a member of the paying joint account)
  if (isPayerOrMember(expense.payer, participantId)) return true

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

export function ExpensesFeed({
  expenses,
  selectedParticipantId,
  viewerUserId,
  onEditExpense,
  onDeleteExpense,
  showLoginHint = false,
}: ExpensesFeedProps) {
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
      <div className="flex flex-col gap-3">
        {filteredExpenses.length > 0 ? (
          filteredExpenses.map((expense) => {
            const isMine =
              selectedParticipantId !== null &&
              isParticipantInExpense(expense, selectedParticipantId)
            // authoredBy stays a bare user id (maxDepth 0 on the field)
            const authoredByViewer =
              viewerUserId != null &&
              expense.authoredBy != null &&
              (typeof expense.authoredBy === 'object'
                ? expense.authoredBy.id
                : expense.authoredBy) === viewerUserId
            return (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                isMine={isMine}
                showAll={showAll}
                selectedParticipantId={selectedParticipantId}
                canManage={authoredByViewer}
                onEdit={onEditExpense}
                onDelete={onDeleteExpense}
              />
            )
          })
        ) : (
          <p className="text-gray-500 text-center py-8">
            Zatím nejsou žádné výdaje.
          </p>
        )}
      </div>
      {/* Anonymous visitors (design 1e): the journal is read-only — a quiet
          bar instead of the FAB says signing in unlocks authoring */}
      {showLoginHint && (
        <div className="flex items-center gap-2.5 mt-4 px-3.5 py-2.5 border border-dashed border-gray-200 rounded-xl bg-gray-50">
          <Lock size={15} className="text-gray-400 flex-shrink-0" />
          <span className="text-[13px] text-gray-500">
            Vlastní výdaje můžete přidávat po přihlášení.{' '}
            <a
              href="/login"
              className="text-primary-dark font-semibold underline underline-offset-2 hover:text-primary"
            >
              Přihlásit se
            </a>
          </span>
        </div>
      )}
    </GlassCard>
  )
}
