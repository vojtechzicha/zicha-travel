'use client'

import { useCallback, useMemo, useState } from 'react'
import { Button, useForm, useTranslation } from '@payloadcms/ui'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'

type SourceParticipant = {
  id: number
  name: string
  akuzativ?: string | null
  vokativ?: string | null
  accountNumber?: string | null
  iban?: string | null
  hasPet?: boolean | null
  chata?: number | { id: number; name?: string } | null
}

const chataName = (p: SourceParticipant): string => {
  if (typeof p.chata === 'object' && p.chata !== null) {
    return p.chata.name || `Chata #${p.chata.id}`
  }
  return p.chata !== null && p.chata !== undefined ? `Chata #${p.chata}` : '—'
}

/**
 * Prefill helper for repeating participants: pick a participant from any
 * previous chata (name + chata identify them) and copy over their stable
 * data — name, Czech declension forms and banking info. Trip-specific
 * fields (chata, paidBy, hasPet) are never touched, and empty source
 * fields never clear what is already typed in.
 */
export const CopyFromParticipantButton: React.FC = () => {
  const { t } = useTranslation<AdminTranslationsObject, AdminTranslationKeys>()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<SourceParticipant[] | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const { dispatchFields } = useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // depth 1 populates chata so the label can show which trip the
      // participant belongs to
      const response = await fetch('/api/participants?limit=1000&depth=1', {
        credentials: 'include',
      })
      const data = await response.json()
      setOptions(data?.docs || [])
    } catch (error) {
      console.error('Error loading participants to copy from:', error)
      setOptions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleToggle = useCallback(() => {
    if (!open && options === null) void load()
    setOpen((o) => !o)
  }, [open, options, load])

  const sorted = useMemo(
    () =>
      [...(options || [])].sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'cs') || chataName(a).localeCompare(chataName(b), 'cs')
      ),
    [options]
  )

  const handleApply = useCallback(() => {
    const source = sorted.find((p) => String(p.id) === selectedId)
    if (!source) return
    const set = (path: string, value: unknown) =>
      dispatchFields({ type: 'UPDATE', path, value })
    set('name', source.name)
    if (source.akuzativ) set('akuzativ', source.akuzativ)
    if (source.vokativ) set('vokativ', source.vokativ)
    if (source.accountNumber) set('accountNumber', source.accountNumber)
    if (source.iban) set('iban', source.iban)
  }, [sorted, selectedId, dispatchFields])

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <Button buttonStyle="secondary" size="small" onClick={handleToggle}>
        {open ? t('zicha:copyFromHide') : t('zicha:copyFromShow')}
      </Button>
      {open && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              flex: 1,
              padding: '0.45rem 0.6rem',
              borderRadius: '4px',
              border: '1px solid var(--theme-elevation-150)',
              background: 'var(--theme-input-bg)',
              color: 'var(--theme-elevation-800)',
            }}
          >
            <option value="">
              {loading
                ? t('zicha:copyFromLoading')
                : sorted.length === 0 && options !== null
                  ? t('zicha:copyFromNone')
                  : t('zicha:copyFromSelect')}
            </option>
            {sorted.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name} ({chataName(p)})
              </option>
            ))}
          </select>
          <Button size="small" onClick={handleApply} disabled={!selectedId || loading}>
            {t('zicha:copyFromApply')}
          </Button>
        </div>
      )}
      <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-500)' }}>
        {t('zicha:copyFromFooter')}
      </div>
    </div>
  )
}
