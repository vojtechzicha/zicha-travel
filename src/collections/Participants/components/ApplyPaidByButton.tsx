'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, useDocumentInfo, useFormFields, useTranslation } from '@payloadcms/ui'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'

const toId = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return String((value as { id: unknown }).id)
  return String(value)
}

/**
 * Retroactively applies the participant's SAVED "Paid By" value to all
 * existing expenses of their chata: adds the standing (auto) invitation
 * where missing, removes/reroutes stale auto rows, never touches manual
 * one-off invitations.
 *
 * Enabled only when there is something to reconcile: a saved "Paid By"
 * value with no pending edit — or, after clearing it, stale standing
 * rows left on existing expenses (removal mode).
 */
export const ApplyPaidByButton: React.FC = () => {
  const { t } = useTranslation<AdminTranslationsObject, AdminTranslationKeys>()
  const [loading, setLoading] = useState(false)
  const [hasStaleRows, setHasStaleRows] = useState(false)
  const { id, savedDocumentData } = useDocumentInfo()
  const formPaidBy = useFormFields(([fields]) => fields?.paidBy?.value)

  const savedId = toId(savedDocumentData?.paidBy)
  const formId = toId(formPaidBy)
  const isDirty = formId !== savedId

  // With "Paid By" saved empty the button is still useful when earlier
  // expenses carry stale standing rows for this guest (retroactive removal)
  useEffect(() => {
    if (!id || savedId) {
      setHasStaleRows(false)
      return
    }
    let cancelled = false
    const check = async () => {
      try {
        const params = new URLSearchParams({
          'where[and][0][invitations.guest][equals]': String(id),
          'where[and][1][invitations.auto][equals]': 'true',
          limit: '1',
          depth: '0',
        })
        const response = await fetch(`/api/expenses?${params.toString()}`, {
          credentials: 'include',
        })
        const data = await response.json()
        if (!cancelled) setHasStaleRows((data?.totalDocs || 0) > 0)
      } catch {
        if (!cancelled) setHasStaleRows(false)
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [id, savedId])

  const removalMode = !savedId && hasStaleRows
  const disabled = loading || !id || isDirty || (!savedId && !hasStaleRows)

  let hint: string | null = null
  if (!id) {
    hint = t('zicha:saveParticipantFirst')
  } else if (isDirty) {
    hint = t('zicha:paidByHintUnsaved')
  } else if (!savedId && !hasStaleRows) {
    hint = t('zicha:paidByHintSelectFirst')
  }

  const handleApply = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const response = await fetch(`/api/participants/${id}/apply-paid-by`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json()
      if (!response.ok) {
        alert(t('zicha:errorPrefix', { message: data?.error || response.statusText }))
        return
      }
      alert(
        t('zicha:paidByDoneAlert', { scanned: data.scanned, updated: data.updated }) +
          (data.updated === 0 ? t('zicha:paidByAllInSync') : '')
      )
      if (removalMode) setHasStaleRows(false)
    } catch (error) {
      console.error('Error applying paidBy retroactively:', error)
      alert(t('zicha:paidByError'))
    } finally {
      setLoading(false)
    }
  }, [id, removalMode, t])

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <Button buttonStyle="secondary" size="small" onClick={handleApply} disabled={disabled}>
        {loading
          ? t('zicha:paidByApplying')
          : removalMode
            ? t('zicha:paidByRemoveStanding')
            : t('zicha:paidByApplyRetro')}
      </Button>
      {hint && (
        <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-500)' }}>{hint}</div>
      )}
    </div>
  )
}
