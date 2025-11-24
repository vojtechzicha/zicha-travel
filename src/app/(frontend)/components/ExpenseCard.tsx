import { Receipt, ArrowLeft } from 'lucide-react'
import { formatCurrency } from '@/lib/formatCurrency'
import type { Expense, Participant } from '@/payload-types'

interface ExpenseCardProps {
  expense: Expense
}

export function ExpenseCard({ expense }: ExpenseCardProps) {
  const isRefund = expense.amount < 0
  const payerName = typeof expense.payer === 'object' && expense.payer !== null
    ? expense.payer.name
    : ''

  return (
    <div
      className={`
        bg-white rounded-xl p-4 shadow-md flex gap-3 transition-transform hover:scale-[1.02]
        ${isRefund ? 'border-2 border-green-200' : ''}
      `}
    >
      <div className="flex-shrink-0">
        {isRefund ? (
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
        <div className="flex justify-between items-start mb-1">
          <span className="font-semibold text-gray-900 truncate">
            {expense.title}
          </span>
          <span
            className={`font-bold ml-2 flex-shrink-0 ${
              isRefund ? 'text-green-600' : 'text-gray-900'
            }`}
          >
            {formatCurrency(expense.amount)}
          </span>
        </div>

        <div className="text-sm text-gray-600 mb-2">
          {isRefund ? 'Peníze vrátil/a ' : 'Platil/a '}
          <strong>{payerName}</strong>
        </div>

        <div className="flex flex-wrap gap-1">
          {expense.splitType === 'equal' ? (
            <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-md">
              Všichni rovným dílem
            </span>
          ) : (
            expense.weights?.map((w) => {
              const participantName = typeof w.participant === 'object' && w.participant !== null
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
            })
          )}
        </div>
      </div>
    </div>
  )
}
