'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, useDocumentInfo, useFormFields, useTranslation } from '@payloadcms/ui'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'

const toId = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') return String((value as { id: unknown }).id)
  return String(value)
}

interface ChataInfo {
  name: string
  slug: string
  bankerId: string | null
  domain: string | null
}

/**
 * Art. 14 notice nudge (compliance blocker 8): the legitimate-interest
 * basis for participants leans on people actually being told they are in
 * the system, and the terms oblige the admin to send them the policy link.
 * This box gives the admin a copyable message to paste into the group
 * chat. The message is deliberately Czech only (like the claim emails —
 * the audience is the Czech circle) and promises exactly what decision 6
 * allows: the name stays with the trip, signing in once hides the finance
 * detail. The banker variant adds that their payment details are shown
 * for settlement.
 */
export const Art14NoticeBox: React.FC = () => {
  const { t } = useTranslation<AdminTranslationsObject, AdminTranslationKeys>()
  const { id } = useDocumentInfo()
  const chataValue = useFormFields(([fields]) => fields?.chata?.value)
  const nameValue = useFormFields(([fields]) => fields?.name?.value)
  const chataId = toId(chataValue)
  const [chata, setChata] = useState<ChataInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!chataId) {
      setChata(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`/api/chatas/${chataId}?depth=0`, {
          credentials: 'include',
        })
        if (!response.ok) return
        const doc = await response.json()
        if (cancelled) return
        setChata({
          name: doc?.name ?? '',
          slug: doc?.slug ?? '',
          bankerId: doc?.banker != null ? toId(doc.banker) : null,
          domain: Array.isArray(doc?.domains) && doc.domains[0]?.domain ? doc.domains[0].domain : null,
        })
      } catch {
        // the box just stays generic
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [chataId])

  if (!id) return null

  const chataUrl = chata?.domain
    ? `https://${chata.domain}`
    : chata?.slug
      ? `https://zicha.travel/${chata.slug}`
      : 'https://zicha.travel'
  const isBanker = chata?.bankerId != null && String(id) === chata.bankerId
  const message =
    `Ahoj! Zapsal(a) jsem tě do aplikace zicha.travel k našemu výletu` +
    `${chata?.name ? ` ${chata.name}` : ''}. Na stránce ${chataUrl} je vidět ` +
    `tvoje jméno, společné výdaje a kolik komu vychází zaplatit; stránku vidí ` +
    `každý, kdo má odkaz. Jak s údaji nakládáme: https://zicha.travel/soukromi. ` +
    `Jestli chceš mít svůj rozpis a zůstatek jen pro sebe, klepni na stránce v ` +
    `Účastnících u svého jména na „To jsem já“ a jednou se přihlas, detail se ` +
    `pak nepřihlášeným schová. Jméno u výletu zůstává i tak.` +
    (isBanker
      ? ' A protože děláš pokladníka, zobrazuje se u vyrovnání i tvoje číslo účtu, aby ti ostatní mohli poslat peníze.'
      : '') +
    ' Kdyžtak napiš.'

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // the admin can still select the text by hand
    }
  }

  return (
    <div
      style={{
        marginTop: '0.5rem',
        marginBottom: 'var(--spacing-field)',
        padding: '10px 12px',
        border: '1px solid var(--theme-elevation-150)',
        borderLeft: '3px solid var(--admin-brand, var(--theme-success-500))',
        borderRadius: 'var(--style-radius-s, 4px)',
        backgroundColor: 'var(--theme-elevation-50)',
        fontSize: '0.85rem',
        lineHeight: 1.6,
      }}
    >
      <strong>{t('zicha:art14Title')}</strong>
      <div style={{ color: 'var(--theme-elevation-600)' }}>
        {t('zicha:art14Hint', { name: String(nameValue ?? '') })}
      </div>
      {open ? (
        <>
          <textarea
            readOnly
            value={message}
            rows={6}
            style={{
              width: '100%',
              marginTop: '6px',
              padding: '8px',
              border: '1px solid var(--theme-elevation-200)',
              borderRadius: '4px',
              background: 'var(--theme-input-bg, var(--theme-elevation-0))',
              color: 'var(--theme-text)',
              fontSize: '0.8rem',
              lineHeight: 1.5,
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div style={{ marginTop: '4px', display: 'flex', gap: '0.5rem' }}>
            <Button buttonStyle="secondary" size="small" onClick={handleCopy}>
              {copied ? t('zicha:art14Copied') : t('zicha:art14Copy')}
            </Button>
            <Button buttonStyle="secondary" size="small" onClick={() => setOpen(false)}>
              {t('zicha:art14Hide')}
            </Button>
          </div>
        </>
      ) : (
        <div style={{ marginTop: '4px' }}>
          <Button buttonStyle="secondary" size="small" onClick={() => setOpen(true)}>
            {t('zicha:art14Show')}
          </Button>
        </div>
      )}
    </div>
  )
}
