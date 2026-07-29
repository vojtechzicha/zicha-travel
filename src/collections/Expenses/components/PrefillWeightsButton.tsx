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
      alert('Nejdříve vyberte chatu')
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
        alert('Žádní účastníci nenalezeni pro tuto chatu')
      }
    } catch (error) {
      console.error('Error fetching participants:', error)
      alert('Chyba při načítání účastníků')
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
        {loading ? 'Načítání...' : 'Předvyplnit všechny účastníky'}
      </Button>
    </div>
  )
}
