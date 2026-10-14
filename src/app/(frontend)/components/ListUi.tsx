'use client'

// Pieces the chata's shared lists have in common: "Nákup" (ShoppingView)
// and "Pivo" (BeerView).

import { Minus, Plus } from 'lucide-react'

/** Two letters for the "kdo co chce" bubbles: "Martin Procházka" → "MP". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

export function QuantityStepper({
  value,
  onChange,
  disabled,
  lessLabel,
  moreLabel,
}: {
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  lessLabel: string
  moreLabel: string
}) {
  const buttonClass =
    'w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-300 dark:hover:bg-white/[0.08]'
  return (
    <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-white/[0.14]">
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 1}
        aria-label={lessLabel}
      >
        <Minus size={14} />
      </button>
      <span className="min-w-7 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {value}
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        aria-label={moreLabel}
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
