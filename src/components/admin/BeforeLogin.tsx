'use client'

import React from 'react'
import { useTranslation } from '@payloadcms/ui'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'

const BeforeLogin: React.FC = () => {
  const { t } = useTranslation<AdminTranslationsObject, AdminTranslationKeys>()
  const guideItems: Array<{ label: string; text: string }> = [
    { label: t('zicha:guideChatasLabel'), text: t('zicha:guideChatasText') },
    { label: t('zicha:guideParticipantsLabel'), text: t('zicha:guideParticipantsText') },
    { label: t('zicha:guideExpensesLabel'), text: t('zicha:guideExpensesText') },
    { label: t('zicha:guidePrepaymentsLabel'), text: t('zicha:guidePrepaymentsText') },
    { label: t('zicha:guideUsersLabel'), text: t('zicha:guideUsersText') },
  ]

  return (
    <div
      style={{
        padding: '1.5rem',
        marginBottom: '1.5rem',
        background: 'var(--admin-brand-50, rgba(217, 119, 6, 0.08))',
        borderRadius: '0.75rem',
        border: '1px solid var(--admin-brand, #d97706)',
        borderColor: 'rgba(217, 119, 6, 0.2)',
        maxWidth: '400px',
      }}
    >
      <h3
        style={{
          margin: '0 0 0.75rem 0',
          color: 'var(--admin-brand, #d97706)',
          fontSize: '1.1rem',
          fontWeight: 700,
          fontFamily: "'Merriweather', Georgia, serif",
        }}
      >
        {t('zicha:welcomeTitle')}
      </h3>
      <p
        style={{
          margin: '0 0 1rem 0',
          color: 'var(--theme-text, #44403c)',
          opacity: 0.7,
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        {t('zicha:welcomeText')}
      </p>
      <div
        style={{
          fontSize: '0.8rem',
          color: 'var(--theme-text, #44403c)',
          opacity: 0.6,
          lineHeight: 1.7,
        }}
      >
        <p
          style={{
            margin: '0 0 0.5rem 0',
            fontWeight: 600,
            opacity: 1,
          }}
        >
          {t('zicha:quickGuide')}
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          {guideItems.map((item) => (
            <li key={item.label}>
              <strong style={{ color: 'var(--admin-brand, #d97706)' }}>{item.label}</strong> -{' '}
              {item.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default BeforeLogin
