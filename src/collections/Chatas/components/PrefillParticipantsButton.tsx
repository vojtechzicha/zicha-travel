'use client'

import { useCallback, useMemo, useState } from 'react'
import { Button, useDocumentInfo } from '@payloadcms/ui'

type SourceParticipant = {
  id: number
  name: string
  chata?: number | { id: number; name?: string } | null
}

const chataName = (p: SourceParticipant): string => {
  if (typeof p.chata === 'object' && p.chata !== null) {
    return p.chata.name || `Chata #${p.chata.id}`
  }
  return p.chata !== null && p.chata !== undefined ? `Chata #${p.chata}` : '—'
}

/**
 * Bulk prefill for repeating participants: multiselect people from
 * previous chatas and create them as NEW participants of this chata via
 * POST /chatas/:id/prefill-participants (copies name, declension forms
 * and banking info). Names already present in this chata are disabled
 * here and skipped server-side.
 */
export const PrefillParticipantsButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [options, setOptions] = useState<SourceParticipant[] | null>(null)
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      // depth 1 populates chata so each row can show which trip the
      // participant comes from
      const [othersRes, mineRes] = await Promise.all([
        fetch(`/api/participants?where[chata][not_equals]=${id}&limit=1000&depth=1`, {
          credentials: 'include',
        }),
        fetch(`/api/participants?where[chata][equals]=${id}&limit=1000&depth=0`, {
          credentials: 'include',
        }),
      ])
      const others = await othersRes.json()
      const mine = await mineRes.json()
      setOptions(others?.docs || [])
      setExistingNames(
        new Set((mine?.docs || []).map((p: { name: string }) => p.name.trim().toLowerCase()))
      )
    } catch (error) {
      console.error('Error loading participants to prefill from:', error)
      setOptions([])
    } finally {
      setLoading(false)
    }
  }, [id])

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

  const toggleSelected = useCallback((participantId: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(participantId)) {
        next.delete(participantId)
      } else {
        next.add(participantId)
      }
      return next
    })
  }, [])

  const handleCreate = useCallback(async () => {
    if (!id || selected.size === 0) return
    setCreating(true)
    try {
      const response = await fetch(`/api/chatas/${id}/prefill-participants`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantIds: Array.from(selected) }),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(`Error: ${data?.error || response.statusText}`)
        return
      }
      alert(
        `Created ${data.created} participant(s).` +
          (data.skipped?.length
            ? ` Skipped (name already in this chata): ${data.skipped.join(', ')}.`
            : '')
      )
      // Mark the created names as taken so their rows disable immediately
      const createdNames = sorted
        .filter((p) => selected.has(p.id))
        .map((p) => p.name.trim().toLowerCase())
      setExistingNames((prev) => new Set([...prev, ...createdNames]))
      setSelected(new Set())
    } catch (error) {
      console.error('Error prefilling participants:', error)
      alert('Error creating participants')
    } finally {
      setCreating(false)
    }
  }, [id, selected, sorted])

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <Button buttonStyle="secondary" size="small" onClick={handleToggle}>
        {open ? 'Hide "Prefill participants"' : 'Prefill participants from previous chatas…'}
      </Button>
      {open && (
        <div
          style={{
            marginTop: '0.5rem',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '4px',
            background: 'var(--theme-input-bg)',
          }}
        >
          <div style={{ maxHeight: '16rem', overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
            {loading && (
              <div style={{ color: 'var(--theme-elevation-500)' }}>Loading participants…</div>
            )}
            {!loading && sorted.length === 0 && options !== null && (
              <div style={{ color: 'var(--theme-elevation-500)' }}>
                No participants in other chatas.
              </div>
            )}
            {!loading &&
              sorted.map((p) => {
                const alreadyExists = existingNames.has(p.name.trim().toLowerCase())
                return (
                  <label
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.2rem 0',
                      cursor: alreadyExists ? 'not-allowed' : 'pointer',
                      color: alreadyExists
                        ? 'var(--theme-elevation-400)'
                        : 'var(--theme-elevation-800)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      disabled={alreadyExists || creating}
                      onChange={() => toggleSelected(p.id)}
                    />
                    <span>
                      {p.name}{' '}
                      <span style={{ color: 'var(--theme-elevation-500)' }}>({chataName(p)})</span>
                      {alreadyExists && (
                        <span style={{ color: 'var(--theme-elevation-400)' }}>
                          {' '}
                          — already in this chata
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
          </div>
          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderTop: '1px solid var(--theme-elevation-100)',
            }}
          >
            <Button
              size="small"
              onClick={handleCreate}
              disabled={creating || selected.size === 0}
            >
              {creating
                ? 'Creating…'
                : `Create ${selected.size} participant(s) for this chata`}
            </Button>
          </div>
        </div>
      )}
      <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-500)' }}>
        Creates new participants of this chata copied from previous ones (name, declension forms,
        banking info).
      </div>
    </div>
  )
}
