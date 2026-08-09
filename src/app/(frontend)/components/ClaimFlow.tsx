'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Clock, Mail, UserRound, X } from 'lucide-react'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import { akuzativName } from '@/lib/czechNames'
import { claimReturnTo } from '@/lib/claimRequests'
import { TurnstileWidget, turnstileSiteKey } from './TurnstileWidget'
import type { Participant } from '@/payload-types'

// UI of the participant-claim flow ("Jsi to ty?") — see docs/PRD-claim.md:
// - ClaimBanner: the main entry point under the finance header, plus the
//   "waiting for admin" state with withdraw
// - ClaimDialog: anonymous visitors pick a path (existing account via
//   Microsoft / magic link, or first-timers registering by email); the
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
  | { kind: 'error'; message: string }

/** POST /api/claim-requests/submit for a signed-in viewer. */
export async function submitClaim(participantId: number): Promise<ClaimSubmitOutcome> {
  try {
    const res = await fetch('/api/claim-requests/submit', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok) {
      if (data?.status === 'approved') return { kind: 'approved' }
      if (data?.status === 'already-linked') return { kind: 'already-linked' }
      return { kind: 'pending' }
    }
    if (data?.error === 'participant-locked') {
      return {
        kind: 'error',
        message: 'Účastník už je propojený s jiným aktivním účtem — ozvěte se správci chaty.',
      }
    }
    if (data?.error === 'account-has-participant') {
      return {
        kind: 'error',
        message:
          'Váš účet už má v této chatě propojeného účastníka. Další (dítě, partnera) propojí správce chaty.',
      }
    }
    return { kind: 'error', message: 'Odeslání žádosti se nezdařilo. Zkuste to prosím znovu.' }
  } catch {
    return { kind: 'error', message: 'Odeslání žádosti se nezdařilo. Zkuste to prosím znovu.' }
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
  if (ownPendingCreatedAt) {
    const sentAt = new Date(ownPendingCreatedAt).toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'long',
    })
    return (
      <div className="flex items-center gap-4 bg-primary/15 border border-primary/30 backdrop-blur-sm rounded-2xl px-5 py-4 text-white">
        <Clock size={22} className="text-primary-light flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-[15px]">
            Tvoje žádost o {akuzativName(participant)} čeká na správce
          </div>
          <div className="text-white/75 text-[13px]">
            Poslali jsme mu ji {sentAt}. Jakmile rozhodne, přijde ti e-mail.
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
            Vzít zpět
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
          Díváš se jako {participant.name.split(' ')[0]}. Jsi to ty?
        </div>
        <div className="text-white/75 text-[13px]">
          {pendingByOther
            ? 'Někdo už o toto propojení požádal — pokud jsi to ty, ozvi se taky.'
            : 'Propoj si účet — příště se přihlásíš a rovnou uvidíš jen to svoje.'}
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
        {busy ? 'Odesílám...' : 'Tohle jsem já'}
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
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        {children}
      </div>
    </div>,
    document.body
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Zavřít"
      onClick={onClose}
      className="absolute top-4 right-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200
                 flex items-center justify-center text-gray-500 transition-colors"
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
 * paths end in an email (magic link) or the Microsoft redirect; the claim
 * finishes automatically after login thanks to ?claim= in the returnTo.
 */
export function ClaimDialog({ participant, chataName, onClose }: ClaimDialogProps) {
  const [loginEmail, setLoginEmail] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [busy, setBusy] = useState<'login' | 'register' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  // Visible bot check shared by both paths (tokens are single-use — every
  // submit bumps the reset signal for a fresh one)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const captchaPending = Boolean(turnstileSiteKey) && !captchaToken

  const microsoftEnabled = process.env.NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED === 'true'
  const returnTo =
    typeof window !== 'undefined'
      ? claimReturnTo(window.location.pathname + window.location.search, participant.id)
      : '/'

  const failureMessage = (code: string | undefined): string =>
    code === 'captcha'
      ? 'Nepodařilo se ověřit, že nejste robot. Zkuste to prosím znovu.'
      : 'Odeslání se nezdařilo. Zkuste to prosím znovu.'

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
      setError('Odeslání se nezdařilo. Zkuste to prosím znovu.')
    } finally {
      setCaptchaReset((n) => n + 1)
      setBusy(null)
    }
  }

  const register = async () => {
    if (!registerEmail.trim() || captchaPending) return
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
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(failureMessage(data?.error))
        return
      }
      setSentTo(registerEmail.trim())
    } catch {
      setError('Odeslání se nezdařilo. Zkuste to prosím znovu.')
    } finally {
      setCaptchaReset((n) => n + 1)
      setBusy(null)
    }
  }

  if (sentTo) {
    return (
      <ModalShell label="Mrkni do e-mailu" onClose={onClose}>
        <CloseButton onClose={onClose} />
        <div className="p-7 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 border border-amber-200 text-primary mb-4">
            <Mail size={26} />
          </div>
          <h2 className="font-serif text-xl font-bold text-gray-900 mb-2">Mrkni do e-mailu</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Na <strong>{sentTo}</strong> letí odkaz. Klikni na něj a jsi vevnitř — platí 15 minut.
            Hned potom se žádost o propojení odešle správci chaty.
          </p>
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="mt-4 text-gray-400 hover:text-gray-600 text-xs transition-colors"
          >
            Nepřišel? Poslat znovu
          </button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell label={`Propojit ${akuzativName(participant)}`} onClose={onClose}>
      <CloseButton onClose={onClose} />
      <div className="p-7">
        <div className="flex items-center gap-3 mb-2 pr-10">
          <div
            className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0 ${getAvatarColor(participant.name)}`}
          >
            {getInitials(participant.name)}
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-xl font-bold text-gray-900 truncate">
              Propojit {akuzativName(participant)}
            </h2>
            <div className="text-[13px] text-gray-500 truncate">{chataName}</div>
          </div>
        </div>
        <p className="text-[13px] text-gray-600 leading-relaxed mb-5">
          Propojení znamená, že výdaje a vyrovnání účastníka budou tvoje. Ještě ho potvrdí správce
          chaty.
        </p>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Path 1: existing account */}
        <div className="border border-gray-200 rounded-2xl p-4 mb-3">
          <div className="font-bold text-gray-900 text-sm mb-2.5">Už tu účet mám</div>
          {microsoftEnabled && (
            <a
              href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
              className="flex items-center justify-center gap-2.5 border border-gray-300 rounded-xl
                         px-4 py-2.5 font-semibold text-sm text-gray-700 hover:bg-gray-50
                         transition-colors mb-2"
            >
              <MicrosoftIcon />
              Přihlásit přes Microsoft
            </a>
          )}
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="tvůj@email.cz"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm
                         text-gray-900 placeholder-gray-400 focus:outline-none
                         focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            <button
              type="button"
              onClick={requestLoginLink}
              disabled={busy !== null || !loginEmail.trim() || captchaPending}
              className="bg-gray-900 hover:bg-gray-700 text-white text-[13px] font-bold px-3.5
                         py-2.5 rounded-xl transition-colors disabled:opacity-60 flex-shrink-0"
            >
              {busy === 'login' ? 'Odesílám...' : 'Poslat odkaz'}
            </button>
          </div>
        </div>

        {/* Path 2: first-timer registration */}
        <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4">
          <div className="font-bold text-gray-900 text-sm mb-1">Jsem tu poprvé</div>
          <div className="text-[13px] text-gray-600 mb-2.5">
            Stačí e-mail — heslo nepotřebuješ, pošleme ti ověřovací odkaz.
          </div>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="tvůj@email.cz"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              className="flex-1 min-w-0 border border-amber-300 bg-white rounded-xl px-3.5 py-2.5
                         text-sm text-gray-900 placeholder-gray-400 focus:outline-none
                         focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            <button
              type="button"
              onClick={register}
              disabled={busy !== null || !registerEmail.trim() || captchaPending}
              className="bg-primary hover:bg-primary-dark text-white text-[13px] font-bold px-3.5
                         py-2.5 rounded-xl shadow-md shadow-primary/30 transition-colors
                         disabled:opacity-60 flex-shrink-0"
            >
              {busy === 'register' ? 'Odesílám...' : 'Založit účet'}
            </button>
          </div>
        </div>

        {/* Visible bot check — this dialog can create accounts */}
        <TurnstileWidget onToken={setCaptchaToken} appearance="always" resetSignal={captchaReset} className="mt-3" />

        <button
          type="button"
          onClick={onClose}
          className="block mx-auto mt-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          Nejsem to já — zpátky
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
  const name = participant ? akuzativName(participant) : 'účastníka'
  let icon = <Check size={26} />
  let iconClass = 'bg-green-50 border border-green-200 text-green-600'
  let title = 'Propojeno!'
  let body: string = `${participant?.name ?? 'Účastník'} je teď tvoje. Účet už znáš z jiné chaty, takže to nemusel nikdo potvrzovat.`

  if (outcome.kind === 'pending') {
    icon = <Clock size={26} />
    iconClass = 'bg-amber-50 border border-amber-200 text-primary'
    title = 'Žádost odeslána'
    body = `Dáme vědět správci chaty. Jakmile potvrdí, že jsi to ty, přijde ti e-mail a ${name} bude tvoje.`
  } else if (outcome.kind === 'already-linked') {
    title = 'Už je to tvoje'
    body = `${participant?.name ?? 'Účastník'} už je s tvým účtem propojený.`
  } else if (outcome.kind === 'error') {
    icon = <X size={26} />
    iconClass = 'bg-red-50 border border-red-200 text-red-500'
    title = 'To se nepovedlo'
    body = outcome.message
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
        <h2 className="font-serif text-xl font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 bg-primary hover:bg-primary-dark text-white text-sm font-bold px-6 py-2.5
                     rounded-full shadow-md shadow-primary/30 transition-colors"
        >
          {outcome.kind === 'approved' ? 'Otevřít moje finance' : 'Rozumím'}
        </button>
      </div>
    </ModalShell>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
