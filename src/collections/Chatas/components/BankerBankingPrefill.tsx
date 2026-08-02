'use client'

import { useEffect, useRef } from 'react'
import { useForm, useFormFields } from '@payloadcms/ui'
import { accountToIban, ibanToAccount } from '@/utils/czechBankAccount'

const toId = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return String((value as { id: unknown }).id)
  return String(value)
}

/**
 * Prefills bankerAccountNumber/bankerIban from the selected banker's own
 * participant banking info. Reacts only to an actual CHANGE of the banker
 * (not to the initial form load), so saved values are never clobbered and
 * both fields stay freely editable. A missing counterpart is derived
 * (account ↔ IBAN) via the czechBankAccount utils.
 */
export const BankerBankingPrefill: React.FC = () => {
  const bankerValue = useFormFields(([fields]) => fields?.banker?.value)
  const { dispatchFields } = useForm()
  const lastSeen = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const bankerId = toId(bankerValue)
    const previous = lastSeen.current
    lastSeen.current = bankerId
    // undefined = first render, carrying the saved value — never prefill then
    if (previous === undefined || bankerId === previous || !bankerId) return

    let cancelled = false
    const prefill = async () => {
      try {
        const response = await fetch(`/api/participants/${bankerId}?depth=0`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const participant = await response.json()
        if (cancelled) return
        const accountNumber =
          participant?.accountNumber ||
          (participant?.iban ? ibanToAccount(participant.iban) : null)
        const iban =
          participant?.iban ||
          (participant?.accountNumber ? accountToIban(participant.accountNumber) : null)
        if (accountNumber) {
          dispatchFields({ type: 'UPDATE', path: 'bankerAccountNumber', value: accountNumber })
        }
        if (iban) {
          dispatchFields({ type: 'UPDATE', path: 'bankerIban', value: iban })
        }
      } catch (error) {
        console.error('Error prefilling banker banking info:', error)
      }
    }
    void prefill()
    return () => {
      cancelled = true
    }
  }, [bankerValue, dispatchFields])

  return null
}
