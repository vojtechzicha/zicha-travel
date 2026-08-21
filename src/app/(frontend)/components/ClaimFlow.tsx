'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations, useLocale } from 'next-intl'
import { Check, Clock, Mail, UserRound, X } from 'lucide-react'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import { accusativeName } from '@/lib/czechNames'
import { claimReturnTo } from '@/lib/claimRequests'
import { track } from '@/lib/analytics'
import { TurnstileWidget, turnstileSiteKey } from './TurnstileWidget'
import { enabledOAuthProviders, oauthLoginHref } from './oauthProviders'
import { useAppTheme } from '../utils/useAppTheme'
import type { AppLocale } from '@/i18n/config'
import type { Participant } from '@/payload-types'

// UI of the participant-claim flow ("Jsi to ty?") — see docs/PRD-claim.md:
// - ClaimBanner: the main entry point under the finance header, plus the
//   "waiting for admin" state with withdraw
// - ClaimDialog: anonymous visitors pick a path (existing account via
//   OAuth (Microsoft/Google/Apple) or magic link, or first-timers
//   registering by email); the
//   claim intent rides in the login returnTo URL (?claim=<id>)
// - ClaimResultModal: outcome of a signed-in submit (auto-approved /
//   pending / error)
// One participant per account and chata: accounts already owning a
// participant here get no claim UI (admins link children/partners in the
// admin panel instead).

export type ClaimSubmitOutcome =
  | { kind: 'approved' }
  | { kind: 'pending' }
  | { kind: 'already-linked' }
  // Error CODES, not messages — submitClaim runs outside React, so the
  // localized text is resolved in ClaimResultModal (claim.result.errors.*)
  | { kind: 'error'; code: 'participant-locked' | 'account-has-participant' | 'generic' }

/** POST /api/claim-requests/submit for a signed-in viewer. */
export async function submitClaim(participantId: number): Promise<ClaimSubmitOutcome> {
  track('claim_started', {})
  try {
    const res = await fetch('/api/claim-requests/submit', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok) {
      track('claim_submitted', {})
      if (data?.status === 'approved') {
        track('claim_resolved', { outcome: 'auto-approved' })
        return { kind: 'approved' }
      }
      if (data?.status === 'already-linked') return { kind: 'already-linked' }
      track('claim_resolved', { outcome: 'pending' })
      return { kind: 'pending' }
    }
    track('save_failed', { operation: 'claim_submit', status: res.status, code: data?.error })
    if (data?.error === 'participant-locked') {
      return { kind: 'error', code: 'participant-locked' }
    }
    if (data?.error === 'account-has-participant') {
      return { kind: 'error', code: 'account-has-participant' }
    }
    return { kind: 'error', code: 'generic' }
  } catch {
    return { kind: 'error', code: 'generic' }
  }
}

// ─── Banner ────────────────────────────────────────────────────────────────

interface ClaimBannerProps {
  participant: Participant
  /** someone else's pending claim exists for this participant */
  pendingByOther?: boolean
  /** the viewer's own pending claim (waiting state) */
  ownPendingCreatedAt?: string | null
  busy?: boolean
  onClaim?: () => void
  onWithdraw?: () => void
}

/**
 * "Díváš se jako Katka. Jsi to ty?" — shown under the finance header for
 * claimable participants; flips to the waiting state once the viewer's own
 * request is pending.
 */
export function ClaimBanner({
  participant,
  pendingByOther = false,
  ownPendingCreatedAt = null,
  busy = false,
  onClaim,
  onWithdraw,
}: ClaimBannerProps) {
  const t = useTranslations('auth')
  const locale = useLocale() as AppLocale

  if (ownPendingCreatedAt) {
    const sentAt = new Date(ownPendingCreatedAt).toLocaleDateString(
      locale === 'cs' ? 'cs-CZ' : 'en-GB',
      {
        day: 'numeric',
        month: 'long',
      }
    )
    return (
      <div className="flex items-center gap-4 bg-primary/15 border border-primary/30 backdrop-blur-sm rounded-2xl px-5 py-4 text-white">
        <Clock size={22} className="text-primary-light flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px]">
            {t('claim.banner.waitingTitle', { name: accusativeName(participant, locale) })}
          </div>
          <div className="text-white/75 text-[13px]">
            {t('claim.banner.waitingBody', { date: sentAt })}
          </div>
        </div>
        {onWithdraw && (
          <button
            type="button"
            onClick={onWithdraw}
            disabled={busy}
            className="text-white/70 hover:text-white text-[13px] font-semibold flex-shrink-0
                       transition-colors disabled:opacity-60"
          >
            {t('claim.banner.withdraw')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 bg-primary/15 border border-primary/30 backdrop-blur-sm rounded-2xl px-5 py-4 text-white">
      <UserRound size={22} className="text-primary-light flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[15px]">
          {t('claim.banner.title', { name: participant.name.split(' ')[0] })}
        </div>
        <div className="text-white/75 text-[13px]">
          {pendingByOther ? t('claim.banner.bodyPendingByOther') : t('claim.banner.body')}
        </div>
      </div>
      <button
        type="button"
        onClick={onClaim}
        disabled={busy}
        className="bg-primary hover:bg-primary-dark text-white text-[13px] font-bold px-4 py-2.5
                   rounded-full flex-shrink-0 shadow-lg shadow-primary/40 transition-colors
                   disabled:opacity-60"
      >
        {busy ? t('claim.banner.sending') : t('claim.banner.cta')}
      </button>
    </div>
  )
}

// ─── Modal shell ───────────────────────────────────────────────────────────

function ModalShell({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: React.ReactNode
}) {
  // Portaled to <body>, i.e. outside the ChataView wrapper that carries
  // data-app-theme — the overlay root must set it itself for dark: to work
  const { theme } = useAppTheme()
  return createPortal(
    <div
      data-app-theme={theme}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1b212c] dark:border dark:border-white/[0.06] rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        {children}
      </div>
    </div>,
    document.body
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const t = useTranslations('auth')
  return (
    <button
      type="button"
      aria-label={t('claim.close')}
      onClick={onClose}
      className="absolute top-4 right-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200
                 dark:bg-white/[0.07] dark:hover:bg-white/[0.12]
                 flex items-center justify-center text-gray-500 dark:text-slate-400 transition-colors"
    >
      <X size={18} />
    </button>
  )
}

// ─── Anonymous claim dialog ────────────────────────────────────────────────

interface ClaimDialogProps {
  participant: Participant
  chataName: string
  onClose: () => void
}

/**
 * "Propojit Katku Novákovou" — path choice for an anonymous visitor. Both
 * paths end in an email (magic link) or an OAuth redirect; the claim
 * finishes automatically after login thanks to ?claim= in the returnTo.
 */
export function ClaimDialog({ participant, chataName, onClose }: ClaimDialogProps) {
  const t = useTranslations('auth')
  const locale = useLocale() as AppLocale

  // anonymous entry into the claim funnel (signed-in path fires in submitClaim)
  useEffect(() => {
    track('claim_started', {})
  }, [])

  const [loginEmail, setLoginEmail] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  // Only adults may hold an account (terms section 4) — the affirmation is
  // required and re-checked server-side (compliance item 22)
  const [adultConfirmed, setAdultConfirmed] = useState(false)
  const [busy, setBusy] = useState<'login' | 'register' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Visible bot check shared by both paths (tokens are single-use — every
  // submit bumps the reset signal for a fresh one)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const captchaPending = Boolean(turnstileSiteKey) && !captchaToken

  const oauthProviders = enabledOAuthProviders()
  const returnTo =
    typeof window !== 'undefined'
      ? claimReturnTo(window.location.pathname + window.location.search, participant.id)
      : '/'

  const failureMessage = (code: string | undefined): string =>
    code === 'captcha'
      ? t('claim.dialog.errors.captcha')
      : code === 'rate-limited'
        ? t('claim.dialog.errors.rate-limited')
        : t('claim.dialog.errors.generic')

  const requestLoginLink = async () => {
    if (!loginEmail.trim() || captchaPending) return
    setBusy('login')
    setError(null)
    try {
      const res = await fetch('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          returnTo,
          turnstileToken: captchaToken,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(failureMessage(data?.error))
        return
      }
      setSentTo(loginEmail.trim())
    } catch {
      setError(t('claim.dialog.errors.generic'))
    } finally {
      setCaptchaReset((n) => n + 1)
      setBusy(null)
    }
  }

  const register = async () => {
    if (!registerEmail.trim() || captchaPending || !adultConfirmed) return
    setBusy('register')
    setError(null)
    try {
      const res = await fetch('/api/claim-requests/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registerEmail.trim(),
          participantId: participant.id,
          returnTo,
          turnstileToken: captchaToken,
          adult: adultConfirmed,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        track('save_failed', {
          operation: 'claim_register',
          status: res.status,
          code: data?.error,
        })
        setError(failureMessage(data?.error))
        return
      }
      // the claim itself resolves later — after the magic-link click
      track('claim_submitted', {})
      setSentTo(registerEmail.trim())
    } catch {
      setError(t('claim.dialog.errors.generic'))
    } finally {
      setCaptchaReset((n) => n + 1)
      setBusy(null)
    }
  }

  if (sentTo) {
    return (
      <ModalShell label={t('claim.dialog.sentTitle')} onClose={onClose}>
        <CloseButton onClose={onClose} />
        <div className="p-7 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 border border-amber-200 text-primary dark:bg-amber-400/15 dark:border-amber-400/30 dark:text-primary-light mb-4">
            <Mail size={26} />
          </div>
          <h2 className="font-serif text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t('claim.dialog.sentTitle')}
          </h2>
          <p className="text-gray-600 dark:text-slate-300 text-sm leading-relaxed">
            {t.rich('claim.dialog.sentBody', {
              email: sentTo,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="mt-4 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 text-xs transition-colors"
          >
            {t('claim.dialog.resend')}
          </button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell
      label={t('claim.dialog.title', { name: accusativeName(participant, locale) })}
      onClose={onClose}
    >
      <CloseButton onClose={onClose} />
      <div className="p-7">
        <div className="flex items-center gap-3 mb-2 pr-10">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0 ${getAvatarColor(participant.name)}`}
          >
            {getInitials(participant.name)}
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {t('claim.dialog.title', { name: accusativeName(participant, locale) })}
            </h2>
            <div className="text-[13px] text-gray-500 dark:text-slate-400 truncate">{chataName}</div>
          </div>
        </div>
        <p className="text-[13px] text-gray-600 dark:text-slate-300 leading-relaxed mb-5">{t('claim.dialog.intro')}</p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Path 1: existing account */}
        <div className="border border-gray-200 dark:border-white/[0.12] rounded-2xl p-4 mb-3">
          <div className="font-bold text-gray-900 dark:text-gray-100 text-sm mb-2.5">
            {t('claim.dialog.existingAccount')}
          </div>
          {oauthProviders.map((provider) => (
            <a
              key={provider.id}
              href={oauthLoginHref(provider.id, returnTo)}
              onClick={() => track('login_started', { method: provider.id })}
              className="flex items-center justify-center gap-2.5 border border-gray-300 dark:border-white/[0.15] rounded-xl
                         px-4 py-2.5 font-semibold text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50
                         dark:hover:bg-white/[0.06] transition-colors mb-2"
            >
              {provider.icon}
              {t(`claim.dialog.${provider.labelKey}`)}
            </a>
          ))}
          <div className="flex gap-2">
            <input
              type="email"
              placeholder={t('claim.dialog.emailPlaceholder')}
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm
                         text-gray-900 placeholder-gray-400 dark:bg-white/[0.06] dark:border-white/[0.15]
                         dark:text-gray-100 dark:placeholder-slate-500 focus:outline-none
                         focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            <button
              type="button"
              onClick={requestLoginLink}
              disabled={busy !== null || !loginEmail.trim() || captchaPending}
              className="bg-gray-900 hover:bg-gray-700 dark:bg-white/[0.1] dark:hover:bg-white/[0.18]
                         text-white text-[13px] font-bold px-3.5
                         py-2.5 rounded-xl transition-colors disabled:opacity-60 flex-shrink-0"
            >
              {busy === 'login' ? t('claim.dialog.sending') : t('claim.dialog.sendLink')}
            </button>
          </div>
        </div>

        {/* Path 2: first-timer registration */}
        <div className="border border-amber-200 bg-amber-50 dark:bg-amber-400/10 dark:border-amber-400/25 rounded-2xl p-4">
          <div className="font-bold text-gray-900 dark:text-gray-100 text-sm mb-1">{t('claim.dialog.firstTime')}</div>
          <div className="text-[13px] text-gray-600 dark:text-slate-300 mb-2.5">{t('claim.dialog.firstTimeBody')}</div>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder={t('claim.dialog.emailPlaceholder')}
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              className="flex-1 min-w-0 border border-amber-300 bg-white rounded-xl px-3.5 py-2.5
                         text-sm text-gray-900 placeholder-gray-400 dark:bg-white/[0.06]
                         dark:border-amber-400/30 dark:text-gray-100 dark:placeholder-slate-500
                         focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            <button
              type="button"
              onClick={register}
              disabled={busy !== null || !registerEmail.trim() || captchaPending || !adultConfirmed}
              className="bg-primary hover:bg-primary-dark text-white text-[13px] font-bold px-3.5
                         py-2.5 rounded-xl shadow-md shadow-primary/30 transition-colors
                         disabled:opacity-60 flex-shrink-0"
            >
              {busy === 'register' ? t('claim.dialog.sending') : t('claim.dialog.register')}
            </button>
          </div>
          {/* Adults-only affirmation (terms section 4, compliance item 22) */}
          <label className="flex items-start gap-2 mt-2.5 text-[13px] text-gray-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={adultConfirmed}
              onChange={(e) => setAdultConfirmed(e.target.checked)}
              className="mt-0.5 accent-[var(--color-primary)]"
            />
            <span>{t('claim.dialog.adultConfirm')}</span>
          </label>
        </div>

        {/* Terms acceptance + privacy pointer (compliance blocker 7) */}
        <p className="text-[12px] text-gray-500 dark:text-slate-400 mt-3">
          {t.rich('claim.dialog.legalNote', {
            terms: (chunks) => (
              <a href="/podminky" className="underline underline-offset-2">
                {chunks}
              </a>
            ),
            privacy: (chunks) => (
              <a href="/soukromi" className="underline underline-offset-2">
                {chunks}
              </a>
            ),
          })}
        </p>

        {/* Visible bot check — this dialog can create accounts */}
        <TurnstileWidget onToken={setCaptchaToken} appearance="always" resetSignal={captchaReset} className="mt-3" />

        <button
          type="button"
          onClick={onClose}
          className="block mx-auto mt-4 text-[13px] text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
        >
          {t('claim.dialog.notMe')}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── Result of a signed-in submit ──────────────────────────────────────────

interface ClaimResultModalProps {
  outcome: ClaimSubmitOutcome
  participant: Participant | null
  onClose: () => void
}

export function ClaimResultModal({ outcome, participant, onClose }: ClaimResultModalProps) {
  const t = useTranslations('auth')
  const locale = useLocale() as AppLocale

  const name = participant
    ? accusativeName(participant, locale)
    : t('claim.result.fallbackNameAccusative')
  const plainName = participant?.name ?? t('claim.result.fallbackName')
  let icon = <Check size={26} />
  let iconClass =
    'bg-green-50 border border-green-200 text-green-600 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-300'
  let title = t('claim.result.approvedTitle')
  let body: string = t('claim.result.approvedBody', { name: plainName })

  if (outcome.kind === 'pending') {
    icon = <Clock size={26} />
    iconClass =
      'bg-amber-50 border border-amber-200 text-primary dark:bg-amber-400/15 dark:border-amber-400/30 dark:text-primary-light'
    title = t('claim.result.pendingTitle')
    body = t('claim.result.pendingBody', { name })
  } else if (outcome.kind === 'already-linked') {
    title = t('claim.result.alreadyLinkedTitle')
    body = t('claim.result.alreadyLinkedBody', { name: plainName })
  } else if (outcome.kind === 'error') {
    icon = <X size={26} />
    iconClass =
      'bg-red-50 border border-red-200 text-red-500 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400'
    title = t('claim.result.errorTitle')
    body = t(`claim.result.errors.${outcome.code}`)
  }

  return (
    <ModalShell label={title} onClose={onClose}>
      <CloseButton onClose={onClose} />
      <div className="p-7 text-center">
        <div
          className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-4 ${iconClass}`}
        >
          {icon}
        </div>
        <h2 className="font-serif text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h2>
        <p className="text-gray-600 dark:text-slate-300 text-sm leading-relaxed">{body}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 bg-primary hover:bg-primary-dark text-white text-sm font-bold px-6 py-2.5
                     rounded-full shadow-md shadow-primary/30 transition-colors"
        >
          {outcome.kind === 'approved'
            ? t('claim.result.openMyFinance')
            : t('claim.result.understood')}
        </button>
      </div>
    </ModalShell>
  )
}
