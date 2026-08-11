'use client'

import { useCallback, useState } from 'react'
import { Button, useForm, useAllFormFields, useTranslation } from '@payloadcms/ui'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'

export const PrefillWeightsButton: React.FC = () => {
  const { t } = useTranslation<AdminTranslationsObject, AdminTranslationKeys>()
  const [loading, setLoading] = useState(false)
  const { dispatchFields } = useForm()
  const [fields] = useAllFormFields()

  // Get chata value from form fields
  const chataId = fields?.chata?.value

  const handlePrefill = useCallback(async () => {
    if (!chataId) {
      alert(t('zicha:weightsSelectChataFirst'))
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `/api/participants?where[chata][equals]=${chataId}&limit=100`
      )
      const data = await response.json()

      if (data.docs && data.docs.length > 0) {
        const weights = data.docs.map((participant: { id: number }) => ({
          participant: participant.id,
          weight: 1,
        }))

        dispatchFields({
          type: 'UPDATE',
          path: 'weights',
          value: weights,
        })
      } else {
        alert(t('zicha:weightsNoParticipants'))
      }
    } catch (error) {
      console.error('Error fetching participants:', error)
      alert(t('zicha:weightsLoadError'))
    } finally {
      setLoading(false)
    }
  }, [chataId, dispatchFields, t])

  return (
    <div style={{ marginBottom: '1rem' }}>
      <Button
        buttonStyle="secondary"
        size="small"
        onClick={handlePrefill}
        disabled={loading || !chataId}
      >
        {loading ? t('zicha:loading') : t('zicha:weightsPrefillAll')}
      </Button>
    </div>
  )
}
