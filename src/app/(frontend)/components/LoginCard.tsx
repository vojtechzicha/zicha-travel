'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Mail, Send } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { TurnstileWidget, turnstileSiteKey } from './TurnstileWidget'
import { enabledOAuthProviders, oauthLoginHref } from './oauthProviders'
import { referrerHost, track } from '@/lib/analytics'

// API error codes with a dedicated message in messages/{cs,en}/auth.json
// under `login.errors.*` — anything else falls back to a generic message.
const KNOWN_ERROR_CODES = [
  'captcha',
  'rate-limited',
  'invalid_link',
  'expired_link',
  'oauth',
  'unauthorized',
  'missing_params',
  'invalid_state',
  'superadmin_oauth',
  'no_email',
  'callback_failed',
] as const

export function LoginCard() {
  const oauthProviders = enabledOAuthProviders()
  const t = useTranslations('auth')
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  // Translate a known API error code; unknown codes get a generic localized
  // message (the raw code is only logged — never rendered to the user).
  const errorText = (code: string, fallbackKey: 'unknown' | 'sendFailed'): string => {
    if ((KNOWN_ERROR_CODES as readonly string[]).includes(code)) {
      return t(`login.errors.${code}`)
    }
    console.warn('[auth] unmapped login error code:', code)
    return t(`login.errors.${fallbackKey}`)
  }

  // Where to land after login: explicit ?returnTo wins; otherwise the page
  // the visitor came from (same-origin referrer — e.g. the footer link),
  // falling back to the homepage. Threaded through the magic-link email and
  // the OAuth flow alike.
  const [returnTo, setReturnTo] = useState(searchParams.get('returnTo') || '/')
  useEffect(() => {
    if (searchParams.get('returnTo')) return
    try {
      if (!document.referrer) return
      const ref = new URL(document.referrer)
      if (ref.origin === window.location.origin && ref.pathname !== '/login') {
        setReturnTo(ref.pathname + ref.search)
      }
    } catch {
      // keep the default
    }
  }, [searchParams])

  // funnel entry: someone landed on the login card at all
  useEffect(() => {
    track('login_link_clicked', { from: referrerHost(document.referrer) })
  }, [])

  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(() =>
    errorParam ? errorText(errorParam, 'unknown') : null
  )
  // Invisible bot check (Turnstile "interaction-only") — tokens are
  // single-use, so every submit bumps the reset signal for a fresh one
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const captchaPending = Boolean(turnstileSiteKey) && !captchaToken

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || captchaPending) return
    setSending(true)
    setError(null)
    track('login_started', { method: 'magic-link' })
    try {
      const response = await fetch('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), returnTo, turnstileToken: captchaToken }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(
          data?.error ? errorText(data.error, 'sendFailed') : t('login.errors.sendFailed')
        )
        return
      }
      setSent(true)
      track('login_link_requested', {})
    } catch {
      setError(t('login.errors.sendFailed'))
    } finally {
      setCaptchaReset((n) => n + 1)
      setSending(false)
    }
  }

  return (
    <GlassCard padding="large" className="w-full max-w-md">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-3">
          <Mail size={28} />
        </div>
        <h1 className="font-serif text-3xl font-bold text-gray-900 mb-2">{t('login.title')}</h1>
        <p className="text-gray-600">{t('login.intro')}</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {sent ? (
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-3">
            <Send size={24} />
          </div>
          <p className="text-gray-800 font-semibold mb-1">{t('login.sentTitle')}</p>
          <p className="text-gray-600 text-sm">
            {t.rich('login.sentBody', {
              email: email.trim(),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-4 text-primary font-semibold text-sm hover:underline"
          >
            {t('login.resend')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder={t('login.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80
                       focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                       text-gray-900 placeholder-gray-400"
          />
          <TurnstileWidget
            onToken={setCaptchaToken}
            appearance="interaction-only"
            resetSignal={captchaReset}
          />
          <button
            type="submit"
            disabled={sending || !email.trim() || captchaPending}
            className="w-full bg-primary hover:bg-primary-dark text-white font-semibold
                       px-6 py-3 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending
              ? t('login.sending')
              : captchaPending
                ? t('login.verifyingBrowser')
                : t('login.submit')}
          </button>
        </form>
      )}

      {oauthProviders.length > 0 && !sent && (
        <>
          <div className="flex items-center gap-3 my-5 text-gray-400 text-sm">
            <div className="flex-1 h-px bg-gray-200" />
            {t('login.or')}
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="flex flex-col gap-2">
            {oauthProviders.map((provider) => (
              <a
                key={provider.id}
                href={oauthLoginHref(provider.id, returnTo)}
                onClick={() => track('login_started', { method: provider.id })}
                className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl
                           bg-white border border-gray-200 text-gray-800 font-semibold
                           hover:bg-gray-50 transition-colors"
              >
                {provider.icon}
                {t(`login.${provider.labelKey}`)}
              </a>
            ))}
          </div>
        </>
      )}

      <p className="text-center text-gray-500 text-xs mt-6">{t('login.footnote')}</p>
      {/* Terms acceptance + privacy pointer (compliance blocker 7): the
          terms bind by use, so the sign-in moment says so with links */}
      <p className="text-center text-gray-400 text-xs mt-2">
        {t.rich('login.legalNote', {
          terms: (chunks) => (
            <a href="/podminky" className="underline underline-offset-2 hover:text-gray-600">
              {chunks}
            </a>
          ),
          privacy: (chunks) => (
            <a href="/soukromi" className="underline underline-offset-2 hover:text-gray-600">
              {chunks}
            </a>
          ),
        })}
      </p>
    </GlassCard>
  )
}
