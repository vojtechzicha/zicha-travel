'use client'

import { useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * Read-only admin field that renders the participant's shareable magic login
 * link (built from the `inviteToken`) with a copy button. Share via WhatsApp.
 */
export function MagicLinkField() {
  const inviteToken = useFormFields(([fields]) => fields?.inviteToken?.value as string | undefined)
  const [copied, setCopied] = useState(false)

  if (!inviteToken) {
    return (
      <div className="field-type ui">
        <p style={{ color: 'var(--theme-elevation-500)' }}>
          Save the participant first to generate a magic login link.
        </p>
      </div>
    )
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const link = `${origin}/api/auth/magic?token=${inviteToken}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="field-type ui">
      <label className="field-label">Magic login link</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            flex: 1,
            minWidth: 240,
            padding: '8px 10px',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 4,
            background: 'var(--theme-elevation-50)',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        />
        <button type="button" className="btn btn--style-secondary btn--size-small" onClick={copy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <p style={{ color: 'var(--theme-elevation-500)', marginTop: 6, fontSize: 12 }}>
        Share this link with the participant (e.g. via WhatsApp). It logs them in and lets them add
        Google/Microsoft emails for future sign-in.
      </p>
    </div>
  )
}
