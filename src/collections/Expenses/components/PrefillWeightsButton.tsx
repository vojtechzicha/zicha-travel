'use client'

import { useCallback, useState } from 'react'
import { Button, useForm, useAllFormFields } from '@payloadcms/ui'

export const PrefillWeightsButton: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const { dispatchFields } = useForm()
  const [fields] = useAllFormFields()

  // Get chata value from form fields
  const chataId = fields?.chata?.value

  const handlePrefill = useCallback(async () => {
    if (!chataId) {
      alert('Select a chata first')
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
        alert('No participants found for this chata')
      }
    } catch (error) {
      console.error('Error fetching participants:', error)
      alert('Error loading participants')
    } finally {
      setLoading(false)
    }
  }, [chataId, dispatchFields])

  return (
    <div style={{ marginBottom: '1rem' }}>
      <Button
        buttonStyle="secondary"
        size="small"
        onClick={handlePrefill}
        disabled={loading || !chataId}
      >
        {loading ? 'Loading...' : 'Prefill all participants'}
      </Button>
    </div>
  )
}
