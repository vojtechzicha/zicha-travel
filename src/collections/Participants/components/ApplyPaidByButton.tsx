'use client'

import { useCallback, useState } from 'react'
import { Button, useDocumentInfo } from '@payloadcms/ui'

/**
 * Retroactively applies the participant's SAVED "paidBy" value to all
 * existing expenses of their chata: adds the standing (auto) invitation
 * where missing, removes/reroutes stale auto rows, never touches manual
 * one-off invitations.
 */
export const ApplyPaidByButton: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const { id } = useDocumentInfo()

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
        alert(`Chyba: ${data?.error || response.statusText}`)
        return
      }
      alert(
        `Hotovo – zkontrolováno výdajů: ${data.scanned}, upraveno: ${data.updated}.` +
          (data.updated === 0 ? ' Vše už bylo v pořádku.' : '')
      )
    } catch (error) {
      console.error('Error applying paidBy retroactively:', error)
      alert('Chyba při zpětném použití')
    } finally {
      setLoading(false)
    }
  }, [id])

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <Button buttonStyle="secondary" size="small" onClick={handleApply} disabled={loading || !id}>
        {loading ? 'Aplikuji...' : 'Použít zpětně na existující výdaje'}
      </Button>
      {!id && (
        <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-500)' }}>
          Nejdříve účastníka uložte.
        </div>
      )}
    </div>
  )
}
