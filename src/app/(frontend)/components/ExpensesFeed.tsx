import { ExpenseCard } from './ExpenseCard'
import { GlassCard } from './GlassCard'
import type { Expense } from '@/payload-types'

interface ExpensesFeedProps {
  expenses: Expense[]
}

export function ExpensesFeed({ expenses }: ExpensesFeedProps) {
  // Sort expenses by ID (or date if available) in reverse order (newest first)
  const sortedExpenses = [...expenses].sort((a, b) => {
    const idA = typeof a.id === 'number' ? a.id : 0
    const idB = typeof b.id === 'number' ? b.id : 0
    return idB - idA
  })

  return (
    <GlassCard padding="medium">
      <h3 className="font-serif text-xl font-bold text-gray-900 mb-4">
        Výdaje
      </h3>
      <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
        {sortedExpenses.length > 0 ? (
          sortedExpenses.map((expense) => (
            <ExpenseCard key={expense.id} expense={expense} />
          ))
        ) : (
          <p className="text-gray-500 text-center py-8">
            Zatím nejsou žádné výdaje.
          </p>
        )}
      </div>
    </GlassCard>
  )
}
