'use client'

import { useCallback, useState } from 'react'
import { Button, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'

/**
 * Data-subject rights actions (compliance blocker 6, GDPR Art. 15/17):
 * download the participant's complete data bundle as JSON, or anonymize
 * them in place (identity goes, amounts and shares stay). Log the request
 * itself in the "Data requests" collection — the one-month promise in the
 * privacy policy needs evidence.
 */
export const RightsActionsButtons: React.FC = () => {
  const { t } = useTranslation<AdminTranslationsObject, AdminTranslationKeys>()
  const { id } = useDocumentInfo()
  const [exporting, setExporting] = useState(false)
  const [anonymizing, setAnonymizing] = useState(false)

  const handleExport = useCallback(async () => {
    if (!id) return
    setExporting(true)
    try {
      const response = await fetch(`/api/participants/${id}/export-data`, {
        credentials: 'include',
      })
      const data = await response.json()
      if (!response.ok) {
        alert(t('zicha:errorPrefix', { message: data?.error || response.statusText }))
        return
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `participant-${id}-export.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      alert(t('zicha:rightsExportError'))
    } finally {
      setExporting(false)
    }
  }, [id, t])

  const handleAnonymize = useCallback(async () => {
    if (!id) return
    if (!window.confirm(t('zicha:rightsAnonymizeConfirm'))) return
    setAnonymizing(true)
    try {
      const response = await fetch(`/api/participants/${id}/anonymize`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json()
      if (!response.ok) {
        alert(t('zicha:errorPrefix', { message: data?.error || response.statusText }))
        return
      }
      alert(t('zicha:rightsAnonymizeDone', { name: data.placeholderName }))
      window.location.reload()
    } catch {
      alert(t('zicha:rightsAnonymizeError'))
    } finally {
      setAnonymizing(false)
    }
  }, [id, t])

  if (!id) return null

  return (
    <div style={{ marginTop: '0.5rem', marginBottom: 'var(--spacing-field)' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Button buttonStyle="secondary" size="small" onClick={handleExport} disabled={exporting}>
          {exporting ? t('zicha:rightsExporting') : t('zicha:rightsExport')}
        </Button>
        <Button
          buttonStyle="secondary"
          size="small"
          onClick={handleAnonymize}
          disabled={anonymizing}
        >
          {anonymizing ? t('zicha:rightsAnonymizing') : t('zicha:rightsAnonymize')}
        </Button>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-500)', marginTop: '4px' }}>
        {t('zicha:rightsHint')}
      </div>
    </div>
  )
}
