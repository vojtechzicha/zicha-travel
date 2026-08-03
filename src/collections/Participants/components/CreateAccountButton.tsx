'use client'

import { useCallback, useState } from 'react'
import { Button, useDocumentInfo, useField } from '@payloadcms/ui'

/**
 * Creates a frontend user account for this participant from an email (or
 * links an existing account with that email) via
 * POST /participants/:id/create-account. No email is sent — the person only
 * receives mail when they request a login link themselves.
 */
export const CreateAccountButton: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [open, setOpen] = useState(false)
  const { id } = useDocumentInfo()
  const { value: accountValue, setValue: setAccountValue } = useField<number | null>({
    path: 'account',
  })

  const handleCreate = useCallback(async () => {
    if (!id || !email.trim()) return
    setLoading(true)
    try {
      const response = await fetch(`/api/participants/${id}/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(`Error: ${data?.error || response.statusText}`)
        return
      }
      setAccountValue(data.userId)
      setOpen(false)
      setEmail('')
      alert(
        data.created
          ? `Account ${data.email} created and linked. No email was sent - they can sign in via magic link or Microsoft.`
          : `Existing account ${data.email} linked to this participant.`
      )
    } catch (error) {
      console.error('Error creating account:', error)
      alert('Error creating account')
    } finally {
      setLoading(false)
    }
  }, [id, email, setAccountValue])

  if (accountValue) return null

  if (!open) {
    return (
      <div style={{ marginTop: '0.5rem' }}>
        <Button buttonStyle="secondary" size="small" onClick={() => setOpen(true)} disabled={!id}>
          Create account from email...
        </Button>
        {!id && (
          <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-500)' }}>
            Save the participant first.
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <input
        type="email"
        placeholder="email@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void handleCreate()
          }
        }}
        style={{
          padding: '0.4rem 0.6rem',
          border: '1px solid var(--theme-elevation-200)',
          borderRadius: '4px',
          background: 'var(--theme-input-bg, var(--theme-elevation-0))',
          color: 'var(--theme-text)',
          minWidth: '220px',
        }}
      />
      <Button
        buttonStyle="primary"
        size="small"
        onClick={handleCreate}
        disabled={loading || !email.trim()}
      >
        {loading ? 'Creating...' : 'Create & link'}
      </Button>
      <Button buttonStyle="secondary" size="small" onClick={() => setOpen(false)} disabled={loading}>
        Cancel
      </Button>
    </div>
  )
}
