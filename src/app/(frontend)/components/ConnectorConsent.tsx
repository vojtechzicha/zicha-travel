'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bot } from 'lucide-react'
import { GlassCard } from './GlassCard'

// Consent screen of the Claude connector (/oauth/authorize, docs/MCP.md).
// The decision goes to POST /api/mcp/oauth/decide with the ORIGINAL query,
// which validates it again; the answer is the URL to continue to (Claude's
// callback), and this page navigates there itself.

type Props =
  | { view: 'error'; error: string }
  | { view: 'sign-in'; loginHref: string }
  | {
      view: 'consent'
      params: Record<string, string>
      clientName: string
      redirectHost: string
      email: string
      writeRequested: boolean
    }

function Header({ title }: { title: string }) {
  return (
    <div className="text-center mb-6">
      <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-primary flex items-center justify-center">
        <Bot className="w-7 h-7 text-white" aria-hidden />
      </div>
      <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
    </div>
  )
}

export function ConnectorConsent(props: Props) {
  const t = useTranslations('connector.consent')
  return (
    <GlassCard padding="large" className="w-full max-w-md">
      {props.view === 'error' && (
        <>
          <Header title={t('errorTitle')} />
          <p className="text-gray-600 text-center">{t(`errors.${props.error}` as never)}</p>
        </>
      )}
      {props.view === 'sign-in' && (
        <>
          <Header title={t('signInTitle')} />
          <p className="text-gray-600 text-center mb-6">{t('signInBody')}</p>
          <a
            href={props.loginHref}
            className="block w-full text-center rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold py-3 transition-colors"
          >
            {t('signIn')}
          </a>
        </>
      )}
      {props.view === 'consent' && <Consent {...props} />}
    </GlassCard>
  )
}

function Consent({
  params,
  clientName,
  redirectHost,
  email,
  writeRequested,
}: Extract<Props, { view: 'consent' }>) {
  const t = useTranslations('connector.consent')
  const [access, setAccess] = useState<'write' | 'read'>(writeRequested ? 'write' : 'read')
  const [pending, setPending] = useState<'approve' | 'deny' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const finish = async (decision: 'approve' | 'deny') => {
    setPending(decision)
    setError(null)
    try {
      const res = await fetch('/api/mcp/oauth/decide', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params, decision, allowWrite: access === 'write' }),
      })
      const json = (await res.json().catch(() => null)) as { redirectTo?: string | null } | null
      if (json?.redirectTo) {
        window.location.assign(json.redirectTo)
        return
      }
      setError(t('errors.generic'))
    } catch {
      setError(t('errors.generic'))
    }
    setPending(null)
  }

  const option = (value: 'write' | 'read', label: string, hint: string) => (
    <label
      className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
        access === value ? 'border-primary bg-primary/5' : 'border-gray-200'
      }`}
    >
      <input
        type="radio"
        name="access"
        value={value}
        checked={access === value}
        onChange={() => setAccess(value)}
        className="mt-1 accent-[var(--color-primary)]"
      />
      <span>
        <span className="block font-semibold text-gray-900">{label}</span>
        <span className="block text-sm text-gray-600">{hint}</span>
      </span>
    </label>
  )

  return (
    <>
      <Header title={t('title')} />
      <p className="text-gray-700 text-center mb-5">{t('lead', { app: clientName })}</p>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 text-sm p-3">
          {error}
        </p>
      )}
      {writeRequested && (
        <div className="space-y-2 mb-5">
          {option('write', t('write'), t('writeHint'))}
          {option('read', t('read'), t('readHint'))}
        </div>
      )}
      <dl className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600 space-y-1 mb-4">
        <div className="flex gap-2">
          <dt>{t('account')}:</dt>
          <dd className="text-gray-900 font-medium break-all">{email}</dd>
        </div>
        <div className="flex gap-2">
          <dt>{t('returnTo')}:</dt>
          <dd className="text-gray-900 font-medium break-all">{redirectHost}</dd>
        </div>
      </dl>
      <p className="text-xs text-gray-500 mb-6">
        {t('privacy')}{' '}
        <a href="/soukromi" target="_blank" className="underline underline-offset-2">
          {t('privacyLink')}
        </a>
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => finish('deny')}
          className="flex-1 rounded-xl border border-gray-300 py-3 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {pending === 'deny' ? t('working') : t('deny')}
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => finish('approve')}
          className="flex-1 rounded-xl bg-primary hover:bg-primary-dark py-3 font-semibold text-white disabled:opacity-60"
        >
          {pending === 'approve' ? t('working') : t('approve')}
        </button>
      </div>
    </>
  )
}
