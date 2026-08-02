'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, useDocumentInfo, useFormFields } from '@payloadcms/ui'

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
    hint = 'Save the participant first.'
  } else if (isDirty) {
    hint = 'Unsaved change - the button applies the saved value. Save first.'
  } else if (!savedId && !hasStaleRows) {
    hint = 'Select and save "Paid By" first.'
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
        alert(`Error: ${data?.error || response.statusText}`)
        return
      }
      alert(
        `Done - expenses checked: ${data.scanned}, updated: ${data.updated}.` +
          (data.updated === 0 ? ' Everything was already in sync.' : '')
      )
      if (removalMode) setHasStaleRows(false)
    } catch (error) {
      console.error('Error applying paidBy retroactively:', error)
      alert('Error applying retroactively')
    } finally {
      setLoading(false)
    }
  }, [id, removalMode])

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <Button buttonStyle="secondary" size="small" onClick={handleApply} disabled={disabled}>
        {loading
          ? 'Applying...'
          : removalMode
            ? 'Remove standing invitations from existing expenses'
            : 'Apply retroactively to existing expenses'}
      </Button>
      {hint && (
        <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-500)' }}>{hint}</div>
      )}
    </div>
  )
}
