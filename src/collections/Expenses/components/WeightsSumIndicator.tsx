'use client'

import { useAllFormFields } from '@payloadcms/ui'

const formatCzk = (n: number) =>
  new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

// Live feedback while entering weights: shows the running sum and whether it
// matches the expense amount (1 Kč tolerance), in which case the expense card
// renders the weights as Kč amounts instead of "2x" multipliers
export const WeightsSumIndicator: React.FC = () => {
  const [fields] = useAllFormFields()

  const amountRaw = fields?.amount?.value
  const amount = typeof amountRaw === 'string' ? Number(amountRaw) : (amountRaw as number)

  const weightSum = Object.entries(fields ?? {}).reduce((sum, [path, field]) => {
    if (!/^weights\.\d+\.weight$/.test(path)) return sum
    const value = typeof field.value === 'string' ? Number(field.value) : (field.value as number)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)

  const hasRows = Object.keys(fields ?? {}).some((path) => /^weights\.\d+\.weight$/.test(path))
  if (!hasRows) return null

  const matchesTotal = typeof amount === 'number' && Math.abs(weightSum - amount) <= 1

  return (
    <div
      style={{
        marginTop: '0.5rem',
        fontSize: '0.85rem',
        color: matchesTotal ? 'var(--theme-success-600, #15803d)' : 'var(--theme-elevation-600)',
      }}
    >
      {matchesTotal ? (
        <>
          Weights sum: <strong>{formatCzk(weightSum)}</strong> — matches the total amount, so the
          expense card shows each weight as a Kč amount.
        </>
      ) : (
        <>
          Weights sum: <strong>{weightSum}</strong> — shown as multipliers (e.g. “2x”). Make the
          weights add up to the total amount{typeof amount === 'number' && Number.isFinite(amount)
            ? ` (${formatCzk(amount)})`
            : ''}{' '}
          to display them as Kč amounts.
        </>
      )}
    </div>
  )
}
