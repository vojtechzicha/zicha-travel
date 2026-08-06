'use client'

import { useEffect, useRef } from 'react'
import { useForm, useFormFields } from '@payloadcms/ui'

const toId = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return String((value as { id: unknown }).id)
  return String(value)
}

/**
 * Prefills the participant's name/vokativ from the linked account's display
 * name when those fields are still empty. Reacts only to an actual CHANGE of
 * the account (not to the initial form load), never overwrites a non-empty
 * value, and everything stays freely editable.
 */
export const AccountNamePrefill: React.FC = () => {
  const accountValue = useFormFields(([fields]) => fields?.account?.value)
  const nameValue = useFormFields(([fields]) => fields?.name?.value)
  const vokativValue = useFormFields(([fields]) => fields?.vokativ?.value)
  const { dispatchFields } = useForm()
  const lastSeen = useRef<string | null | undefined>(undefined)
  // Snapshot current values for use inside the async prefill without
  // retriggering the effect when the user types into them
  const currentName = useRef<unknown>(nameValue)
  const currentVokativ = useRef<unknown>(vokativValue)
  currentName.current = nameValue
  currentVokativ.current = vokativValue

  useEffect(() => {
    const accountId = toId(accountValue)
    const previous = lastSeen.current
    lastSeen.current = accountId
    // undefined = first render, carrying the saved value — never prefill then
    if (previous === undefined || accountId === previous || !accountId) return

    let cancelled = false
    const prefill = async () => {
      try {
        const response = await fetch(`/api/users/${accountId}?depth=0`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const account = await response.json()
        if (cancelled) return
        const isEmpty = (v: unknown) => typeof v !== 'string' || v.trim() === ''
        if (account?.name && isEmpty(currentName.current)) {
          dispatchFields({ type: 'UPDATE', path: 'name', value: account.name })
        }
        if (account?.vokativ && isEmpty(currentVokativ.current)) {
          dispatchFields({ type: 'UPDATE', path: 'vokativ', value: account.vokativ })
        }
      } catch (error) {
        console.error('Error prefilling participant name from account:', error)
      }
    }
    void prefill()
    return () => {
      cancelled = true
    }
  }, [accountValue, dispatchFields])

  return null
}
