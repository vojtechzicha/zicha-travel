'use client'

import React, { useState } from 'react'

const isOAuthEnabled = process.env.NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED === 'true'

const LoginView: React.FC = () => {
  const errorParam =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error') : null

  if (isOAuthEnabled) {
    return <OAuthLogin error={errorParam} />
  }

  return <LocalLogin error={errorParam} />
}

function OAuthLogin({ error }: { error: string | null }) {
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
        <a
          href="/api/auth/login"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            width: '100%',
            padding: '0.75rem 1.5rem',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#fff',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.95rem',
            fontFamily: "'Inter', sans-serif",
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <MicrosoftIcon />
          Sign in with Microsoft
        </a>
      </div>
    </div>
  )
}

function LocalLogin({ error }: { error: string | null }) {
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
        setLoginError('Invalid email or password')
      }
    } catch {
      setLoginError('Login failed. Please try again.')
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
              Email
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
              Password
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
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function WelcomeHeader() {
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
        Group trips & shared expenses
      </p>
    </div>
  )
}

function ErrorMessage({ error }: { error: string }) {
  const messages: Record<string, string> = {
    oauth: 'Microsoft sign-in was cancelled or failed. Please try again.',
    unauthorized: 'Your Microsoft account is not authorized. Contact the administrator.',
    missing_params: 'Invalid OAuth response. Please try again.',
    invalid_state: 'Session expired. Please try again.',
    no_email: 'Could not retrieve email from Microsoft. Please try again.',
    callback_failed: 'Sign-in failed. Please try again.',
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

export default LoginView
