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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
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
            borderRadius: '0.5rem',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.95rem',
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity 0.2s',
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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <WelcomeHeader />
        {error && <ErrorMessage error={error} />}
        {loginError && <ErrorMessage error={loginError} />}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}
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
                padding: '0.625rem 0.75rem',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '0.375rem',
                color: '#fff',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="password"
              style={{ display: 'block', marginBottom: '0.5rem', color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}
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
                padding: '0.625rem 0.75rem',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '0.375rem',
                color: '#fff',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              color: '#fff',
              borderRadius: '0.5rem',
              fontWeight: 600,
              fontSize: '0.95rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.2s',
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
        background:
          'linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%)',
        borderRadius: '0.75rem',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <h3
        style={{
          margin: '0 0 0.5rem 0',
          color: '#a5b4fc',
          fontSize: '1.1rem',
          fontWeight: 600,
        }}
      >
        Welcome to Aplikace Chata
      </h3>
      <p
        style={{
          margin: 0,
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        Manage your group trips and shared expenses with ease.
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
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '0.5rem',
        color: '#fca5a5',
        fontSize: '0.85rem',
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
