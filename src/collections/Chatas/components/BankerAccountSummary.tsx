'use client'

import { useEffect, useState } from 'react'
import { useFormFields, useTranslation } from '@payloadcms/ui'
import { resolveBankAccount } from '@/utils/czechBankAccount'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'

const toId = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return String((value as { id: unknown }).id)
  return String(value)
}

type Resolved = {
  name: string
  account: { accountNumber: string; iban: string } | null
  hasUserAccount: boolean
}

/**
 * Read-only echo of the selected banker's own banking info. Everyone pays
 * into the banker's account, which lives on the participant — this only
 * shows what the frontend will use (including the derived counterpart) and
 * links to the participant when something is missing.
 */
export const BankerAccountSummary: React.FC = () => {
  const { t } = useTranslation<AdminTranslationsObject, AdminTranslationKeys>()
  const bankerValue = useFormFields(([fields]) => fields?.banker?.value)
  const bankerId = toId(bankerValue)
  const [resolved, setResolved] = useState<Resolved | null>(null)

  useEffect(() => {
    if (!bankerId) {
      setResolved(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/participants/${bankerId}?depth=0`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const participant = await response.json()
        if (cancelled) return
        setResolved({
          name: participant?.name ?? '',
          account: resolveBankAccount(participant?.accountNumber, participant?.iban),
          hasUserAccount: participant?.account != null,
        })
      } catch (error) {
        console.error('Error loading banker banking info:', error)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [bankerId])

  if (!bankerId || !resolved) return null

  const editHref = `/admin/collections/participants/${bankerId}`
  const missing = !resolved.account

  return (
    <div
      style={{
        marginTop: '8px',
        marginBottom: 'var(--spacing-field)',
        padding: '10px 12px',
        border: `1px solid var(--theme-elevation-${missing ? '200' : '150'})`,
        borderLeft: `3px solid var(--theme-${missing ? 'warning' : 'success'}-500)`,
        borderRadius: 'var(--style-radius-s, 4px)',
        backgroundColor: 'var(--theme-elevation-50)',
        fontSize: '0.85rem',
        lineHeight: 1.6,
      }}
    >
      {missing ? (
        <>
          <strong>{resolved.name}</strong> {t('zicha:bankerNoBankingInfo')}{' '}
          <a href={editHref}>{t('zicha:bankerAddOnParticipant')}</a>
        </>
      ) : (
        <>
          <div style={{ color: 'var(--theme-elevation-500)' }}>
            {t('zicha:bankerPaymentsGoToPrefix')}
            <strong>{resolved.name}</strong>
            {t('zicha:bankerPaymentsGoToSuffix')}
          </div>
          <div>
            {resolved.account?.accountNumber || '—'}
            {resolved.account?.iban ? ` · ${resolved.account.iban}` : ''}
          </div>
          <a href={editHref}>{t('zicha:bankerEditOnParticipant')}</a>
        </>
      )}
      {/* Creditor accounts are shown only to signed-in bankers and admins —
          a banker without a linked user account cannot see them for refunds
          (controller decision 13), so nudge toward "Create account from
          email" on the participant form. */}
      {!resolved.hasUserAccount && (
        <div style={{ marginTop: '6px', color: 'var(--theme-elevation-600)' }}>
          {t('zicha:bankerNeedsAccountHint')} <a href={editHref}>{t('zicha:bankerNeedsAccountCta')}</a>
        </div>
      )}
    </div>
  )
}
