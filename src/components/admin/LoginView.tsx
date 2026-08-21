'use client'

import React, { useState } from 'react'
import { useTranslation } from '@payloadcms/ui'
import type {
  AdminTranslationKeys,
  AdminTranslationsObject,
} from '@/i18n/adminTranslations'
import { BackToSiteLink } from './BackToSiteLink'

// One entry per provider whose public flag is on. Labels come from the
// zicha admin translations; each button keeps its provider's brand look.
const oauthProviders = [
  process.env.NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED === 'true' && {
    id: 'microsoft' as const,
    labelKey: 'zicha:signInWithMicrosoft' as const,
    icon: <MicrosoftIcon />,
    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
  },
  process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && {
    id: 'google' as const,
    labelKey: 'zicha:signInWithGoogle' as const,
    icon: <GoogleIcon />,
    background: '#fff',
    color: '#1c1917',
    border: '1px solid #d6d3d1',
    boxShadow: '0 2px 8px rgba(28, 25, 23, 0.08)',
  },
  process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === 'true' && {
    id: 'apple' as const,
    labelKey: 'zicha:signInWithApple' as const,
    icon: <AppleIcon />,
    background: '#000',
    color: '#fff',
    border: 'none',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
  },
].filter((provider): provider is Exclude<typeof provider, false> => Boolean(provider))

const useT = () =>
  useTranslation<AdminTranslationsObject, AdminTranslationKeys>().t

const LoginView: React.FC = () => {
  const errorParam =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error') : null

  if (oauthProviders.length > 0) {
    return <OAuthLogin error={errorParam} />
  }

  return <LocalLogin error={errorParam} />
}

function OAuthLogin({ error }: { error: string | null }) {
  const t = useT()
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'var(--theme-bg, #fffbeb)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
        <WelcomeHeader />
        {error && <ErrorMessage error={error} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {oauthProviders.map((provider) => (
            <a
              key={provider.id}
              href={`/api/auth/login?provider=${provider.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                width: '100%',
                padding: '0.75rem 1.5rem',
                background: provider.background,
                color: provider.color,
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.95rem',
                fontFamily: "'Inter', sans-serif",
                border: provider.border,
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: provider.boxShadow,
                boxSizing: 'border-box',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              {provider.icon}
              {t(provider.labelKey)}
            </a>
          ))}
        </div>
        <BackToSiteLink variant="login" />
      </div>
    </div>
  )
}

function LocalLogin({ error }: { error: string | null }) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        window.location.href = '/admin'
      } else {
        setLoginError(t('zicha:invalidCredentials'))
      }
    } catch {
      setLoginError(t('zicha:loginFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'var(--theme-bg, #fffbeb)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
        <WelcomeHeader />
        {error && <ErrorMessage error={error} />}
        {loginError && <ErrorMessage error={loginError} />}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                marginBottom: '0.4rem',
                color: 'var(--theme-elevation-600, #57534e)',
                fontSize: '0.85rem',
                fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {t('zicha:email')}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.7rem 0.85rem',
                background: 'var(--theme-elevation-0, #fff)',
                border: '1px solid var(--theme-elevation-200, #e7e5e4)',
                borderRadius: '8px',
                color: 'var(--theme-text, #1c1917)',
                fontSize: '0.95rem',
                fontFamily: "'Inter', sans-serif",
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#d97706'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(217, 119, 6, 0.12)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-elevation-200, #e7e5e4)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                marginBottom: '0.4rem',
                color: 'var(--theme-elevation-600, #57534e)',
                fontSize: '0.85rem',
                fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {t('zicha:password')}
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.7rem 0.85rem',
                background: 'var(--theme-elevation-0, #fff)',
                border: '1px solid var(--theme-elevation-200, #e7e5e4)',
                borderRadius: '8px',
                color: 'var(--theme-text, #1c1917)',
                fontSize: '0.95rem',
                fontFamily: "'Inter', sans-serif",
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#d97706'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(217, 119, 6, 0.12)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--theme-elevation-200, #e7e5e4)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
              color: '#fff',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.95rem',
              fontFamily: "'Inter', sans-serif",
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(180, 83, 9, 0.3)',
            }}
          >
            {loading ? t('zicha:signingIn') : t('zicha:signIn')}
          </button>
        </form>
        <BackToSiteLink variant="login" />
      </div>
    </div>
  )
}

function WelcomeHeader() {
  const t = useT()
  return (
    <div
      style={{
        padding: '1.5rem',
        marginBottom: '1.5rem',
        background: 'var(--admin-brand-50, rgba(217, 119, 6, 0.06))',
        borderRadius: '12px',
        border: '1px solid rgba(217, 119, 6, 0.15)',
        textAlign: 'center',
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginBottom: '0.75rem' }}
      >
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
          fill="#d97706"
        />
        <circle cx="12" cy="9" r="2.5" fill="#fff" />
      </svg>
      <h3
        style={{
          margin: '0 0 0.4rem 0',
          fontFamily: "'Merriweather', Georgia, serif",
          fontSize: '1.4rem',
          fontWeight: 900,
          color: 'var(--theme-text, #1c1917)',
          letterSpacing: '-0.02em',
        }}
      >
        zicha<span style={{ color: '#d97706', fontWeight: 700 }}>.travel</span>
      </h3>
      <p
        style={{
          margin: 0,
          color: 'var(--theme-elevation-500, #78716c)',
          fontSize: '0.875rem',
          lineHeight: 1.5,
        }}
      >
        {t('zicha:tagline')}
      </p>
    </div>
  )
}

function ErrorMessage({ error }: { error: string }) {
  const t = useT()
  const messages: Record<string, string> = {
    oauth: t('zicha:errOauth'),
    unauthorized: t('zicha:errUnauthorized'),
    missing_params: t('zicha:errMissingParams'),
    invalid_state: t('zicha:errInvalidState'),
    no_email: t('zicha:errNoEmail'),
    callback_failed: t('zicha:errCallbackFailed'),
  }

  return (
    <div
      style={{
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        background: 'var(--theme-error-50, rgba(239, 68, 68, 0.08))',
        border: '1px solid var(--theme-error-200, rgba(239, 68, 68, 0.2))',
        borderRadius: '8px',
        color: 'var(--theme-error-500, #dc2626)',
        fontSize: '0.85rem',
        lineHeight: 1.5,
      }}
    >
      {messages[error] || error}
    </div>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.09A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.57.38-2.29V6.62H1.27a11.99 11.99 0 0 0 0 10.76l4.01-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 1.27 6.62l4.01 3.09C6.22 6.87 8.87 4.77 12 4.77z"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.365 1.43c0 1.14-.47 2.2-1.22 3.02-.79.87-2.1 1.54-3.16 1.46-.13-1.1.44-2.27 1.16-3.03.8-.86 2.19-1.51 3.22-1.45zM20.94 17.03c-.55 1.26-.82 1.82-1.53 2.93-.99 1.55-2.39 3.49-4.12 3.5-1.54.02-1.94-1.01-4.03-1-2.09.01-2.53 1.03-4.07 1.01-1.73-.02-3.05-1.76-4.04-3.31C.4 15.85-.13 10.9 1.51 8.26c1.16-1.87 3-2.97 4.72-2.97 1.75 0 2.86 1.01 4.31 1.01 1.41 0 2.27-1.01 4.3-1.01 1.53 0 3.16.84 4.31 2.28-3.79 2.08-3.18 7.5 1.79 9.46z" />
    </svg>
  )
}

export default LoginView
