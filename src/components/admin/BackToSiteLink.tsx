'use client'

import React from 'react'
import { useTranslation } from '@payloadcms/ui'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'

/**
 * "Back to the site" link out of the admin panel, rendered in the nav
 * (`afterNavLinks`) and on the login screen, which has no nav.
 *
 * The href is a RELATIVE root on purpose. The admin answers on every host the
 * deployment serves — localhost in dev, the *.vercel.app URL on a preview, the
 * apex domain and any chata subdomain in production — so "/" always lands on
 * the public site of the same host the admin was opened on. An absolute URL
 * would need a base from somewhere, and there is none: NEXT_PUBLIC_SITE_URL
 * was removed exactly because the host is resolved per request (the middleware
 * maps it to a chata through /api/domains).
 */
const GlobeIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
  </svg>
)

export const BackToSiteLink: React.FC<{ variant?: 'nav' | 'login' }> = ({ variant = 'nav' }) => {
  const { t } = useTranslation<AdminTranslationsObject, AdminTranslationKeys>()

  if (variant === 'login') {
    return (
      <a
        href="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          marginTop: '1.25rem',
          color: 'var(--theme-elevation-500, #78716c)',
          fontSize: '0.85rem',
          fontFamily: "'Inter', sans-serif",
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
        onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
      >
        <GlobeIcon />
        {t('zicha:backToSite')}
      </a>
    )
  }

  return (
    <a
      className="nav__link"
      href="/"
      id="nav-back-to-site"
      style={{
        gap: '0.6rem',
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--theme-elevation-100)',
      }}
    >
      <GlobeIcon />
      <span className="nav__link-label">{t('zicha:backToSite')}</span>
    </a>
  )
}

export default BackToSiteLink
