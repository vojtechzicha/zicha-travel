'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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
  /** planned expense of the viewer: confirm it was paid */
  onMarkExpensePaid?: (expense: Expense) => void
  onDeleteExpense?: (expense: Expense) => Promise<void>
  /** viewer confirms every pending expense here (chata admin or banker) */
  canApproveAll?: boolean
  /** confirm/refuse an expense somebody recorded for another payer */
  onDecideApproval?: (
    expense: Expense,
    action: 'approve' | 'reject',
    reason: string,
  ) => Promise<void>
  /** anonymous visitors: subtle bar that signing in unlocks authoring (1e) */
  showLoginHint?: boolean
}

/** Bare id of a maxDepth-0 relationship (may still arrive populated). */
const relId = (ref: unknown): number | null => {
  if (typeof ref === 'number') return ref
  if (typeof ref === 'object' && ref !== null) {
    const id = (ref as { id?: unknown }).id
    return typeof id === 'number' ? id : null
  }
  return null
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
  onMarkExpensePaid,
  onDeleteExpense,
  canApproveAll = false,
  onDecideApproval,
  showLoginHint = false,
}: ExpensesFeedProps) {
  const t = useTranslations('finance')
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
        <h3 className="font-serif text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span className="text-primary">📋</span> {t('expensesFeed.title')}
        </h3>
        <div className="text-xs text-gray-500 dark:text-slate-400">
          <button
            onClick={() => setShowAll(false)}
            className={`px-1 ${!showAll ? 'font-semibold text-gray-700 dark:text-slate-300' : 'hover:text-gray-700 dark:hover:text-slate-300'}`}
          >
            {t('expensesFeed.mine')}
          </button>
          <span className="mx-1">|</span>
          <button
            onClick={() => setShowAll(true)}
            className={`px-1 ${showAll ? 'font-semibold text-gray-700 dark:text-slate-300' : 'hover:text-gray-700 dark:hover:text-slate-300'}`}
          >
            {t('expensesFeed.all')}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {filteredExpenses.length > 0 ? (
          filteredExpenses.map((expense) => {
            const isMine =
              selectedParticipantId !== null &&
              isParticipantInExpense(expense, selectedParticipantId)
            // authoredBy / payerAccount stay bare user ids (maxDepth 0)
            const authoredByViewer =
              viewerUserId != null && relId(expense.authoredBy) === viewerUserId
            // An expense recorded FOR you is yours too: you confirm it, and
            // afterwards you may correct or delete it
            const paidByViewer =
              viewerUserId != null && relId(expense.payerAccount) === viewerUserId
            return (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                isMine={isMine}
                showAll={showAll}
                selectedParticipantId={selectedParticipantId}
                canManage={authoredByViewer || paidByViewer}
                onEdit={onEditExpense}
                onMarkPaid={onMarkExpensePaid}
                onDelete={onDeleteExpense}
                canDecideApproval={canApproveAll || paidByViewer}
                onDecideApproval={onDecideApproval}
              />
            )
          })
        ) : (
          <p className="text-gray-500 dark:text-slate-400 text-center py-8">
            {t('expensesFeed.empty')}
          </p>
        )}
      </div>
      {/* Anonymous visitors (design 1e): the journal is read-only — a quiet
          bar instead of the FAB says signing in unlocks authoring */}
      {showLoginHint && (
        <div className="flex items-center gap-2.5 mt-4 px-3.5 py-2.5 border border-dashed border-gray-200 dark:border-white/[0.12] rounded-xl bg-gray-50 dark:bg-white/[0.04]">
          <Lock size={15} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
          <span className="text-[13px] text-gray-500 dark:text-slate-400">
            {t('expensesFeed.loginHint')}{' '}
            <a
              href="/login"
              className="text-primary-dark dark:text-primary-light font-semibold underline underline-offset-2 hover:text-primary dark:hover:text-primary-light"
            >
              {t('expensesFeed.signIn')}
            </a>
          </span>
        </div>
      )}
    </GlassCard>
  )
}
