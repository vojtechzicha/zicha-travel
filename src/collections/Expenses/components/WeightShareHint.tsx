'use client'

import { useAllFormFields, useTranslation } from '@payloadcms/ui'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'

const formatCzk = (n: number) =>
  new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

const toNumber = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : NaN
}

// Rendered under each weight input: the Kč share this row's weight currently
// works out to, recalculated live as the amount or any weight changes
export const WeightShareHint: React.FC<{ path: string }> = ({ path }) => {
  const { t } = useTranslation<AdminTranslationsObject, AdminTranslationKeys>()
  const [fields] = useAllFormFields()

  const amount = toNumber(fields?.amount?.value)
  const ownWeight = toNumber(fields?.[path]?.value)

  const totalUnits = Object.entries(fields ?? {}).reduce((sum, [fieldPath, field]) => {
    if (!/^weights\.\d+\.weight$/.test(fieldPath)) return sum
    const value = toNumber(field.value)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)

  if (!Number.isFinite(amount) || !Number.isFinite(ownWeight) || totalUnits <= 0) return null

  const share = (amount / totalUnits) * ownWeight

  return (
    <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--theme-elevation-500)' }}>
      = {formatCzk(share)} ({t('zicha:weightShareOf', { weight: ownWeight, total: totalUnits })})
    </div>
  )
}
