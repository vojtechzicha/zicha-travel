'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Check, Mail, Send, X } from 'lucide-react'
import { accommodationAvailableFor, type PlanningPayload } from '@/lib/planning'
import { track } from '@/lib/analytics'
import { TurnstileWidget, turnstileSiteKey } from './TurnstileWidget'
import { useAppTheme } from '../utils/useAppTheme'
import type { Chata } from '@/payload-types'

// The planning-phase vote dialog ("Jedeš s námi?" — docs/PRD-planovani.md,
// design canvas "Plánování chaty"): who you are (skipped for signed-in
// viewers with a linked participant), which dates work, which places you
// like, submit. Anonymous submissions create an account — visible Turnstile
// like claim registration; the confirmation tells them to check their email.

interface PlanningVoteFlowProps {
  chata: Chata
  planning: PlanningPayload
  /** signed-in viewer's linked participant name; null = ask for name */
  viewerName: string | null
  authenticated: boolean
  /** prefill for the name field (a failed auto-submitted vote intent) */
  initialName?: string | null
  initialDateIds: number[]
  initialAccommodationIds: number[]
  onClose: () => void
  /** reload the chata payload after a signed-in vote landed */
  onVoted: () => Promise<void> | void
}

type Confirmation = { kind: 'email'; email: string; emailSent: boolean } | { kind: 'saved' }

export function PlanningVoteFlow({
  chata,
  planning,
  viewerName,
  authenticated,
  initialName = null,
  initialDateIds,
  initialAccommodationIds,
  onClose,
  onVoted,
}: PlanningVoteFlowProps) {
  const t = useTranslations('planning')
  const { theme } = useAppTheme()

  const [name, setName] = useState(initialName ?? '')
  const [email, setEmail] = useState('')
  const [adultConfirmed, setAdultConfirmed] = useState(false)
  const [selectedDates, setSelectedDates] = useState<number[]>(initialDateIds)
  const [selectedPlaces, setSelectedPlaces] = useState<number[]>(initialAccommodationIds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  // Visible bot check for the account-creating anonymous path (single-use
  // tokens — every submit bumps the reset signal)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const captchaPending = !authenticated && Boolean(turnstileSiteKey) && !captchaToken

  const needsName = viewerName == null
  const needsContact = !authenticated

  useEffect(() => {
    // funnel entry; `authenticated` cannot change while the dialog is open
    track('planning_vote_started', { signed_in: authenticated })
  }, [authenticated])

  const dateById = useMemo(
    () => new Map(planning.dateOptions.map((option) => [option.id, option])),
    [planning.dateOptions],
  )

  const toggleDate = (id: number) => {
    setSelectedDates((prev) => {
      const next = prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
      // A narrower date selection can strand picked places — drop the ones
      // no longer available so the submit cannot fail on it
      setSelectedPlaces((places) =>
        places.filter((placeId) => {
          const place = planning.accommodations.find((a) => a.id === placeId)
          return place ? accommodationAvailableFor(place, next) : false
        }),
      )
      return next
    })
  }

  const togglePlace = (id: number) => {
    setSelectedPlaces((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  const errorMessage = (code: string | undefined, status?: number): string => {
    const known = [
      'captcha',
      'rate-limited',
      'name-required',
      'name-taken',
      'no-dates',
      'accommodation-unavailable',
      'planning-closed',
    ]
    if (code && known.includes(code)) return t(`dialog.errors.${code}`)
    if (status === 429) return t('dialog.errors.rate-limited')
    return t('dialog.errors.generic')
  }

  const submit = async () => {
    setError(null)
    if (selectedDates.length === 0) {
      setError(t('dialog.errors.no-dates'))
      return
    }
    if (needsName && !name.trim()) {
      setError(t('dialog.errors.name-required'))
      return
    }
    if (needsContact) {
      if (!email.trim()) {
        setError(t('dialog.errors.email-required'))
        return
      }
      if (!adultConfirmed) {
        setError(t('dialog.errors.adult-required'))
        return
      }
    }
    setBusy(true)
    try {
      const res = await fetch('/api/trip-votes/submit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chataId: chata.id,
          dateOptionIds: selectedDates,
          accommodationOptionIds: selectedPlaces,
          ...(needsName ? { name: name.trim() } : {}),
          ...(needsContact
            ? {
                email: email.trim(),
                adult: adultConfirmed,
                turnstileToken: captchaToken,
                returnTo: window.location.pathname + window.location.search,
              }
            : {}),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        track('save_failed', { operation: 'planning_vote', status: res.status, code: data?.error })
        setError(errorMessage(data?.error, res.status))
        return
      }
      track('planning_vote_submitted', {
        signed_in: authenticated,
        dates: selectedDates.length,
        places: selectedPlaces.length,
      })
      if (authenticated) {
        await onVoted()
        setConfirmation({ kind: 'saved' })
      } else {
        setConfirmation({
          kind: 'email',
          email: email.trim(),
          emailSent: data?.emailSent !== false,
        })
      }
    } catch {
      setError(t('dialog.errors.generic'))
    } finally {
      setCaptchaReset((n) => n + 1)
      setBusy(false)
    }
  }

  const sectionHeader = (step: number, title: string, hint?: string) => (
    <div className="flex items-center gap-2.5 flex-wrap">
      <span className="w-6 h-6 rounded-full bg-primary text-white text-[13px] font-bold flex items-center justify-center">
        {step}
      </span>
      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</span>
      {hint && <span className="text-xs text-gray-400 dark:text-slate-500">{hint}</span>}
    </div>
  )

  const inputClass =
    'w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 ' +
    'dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 dark:placeholder-slate-500 ' +
    'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary'

  let content: React.ReactNode
  if (confirmation) {
    content = (
      <div className="p-7 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-50 border border-amber-200 text-primary dark:bg-amber-400/15 dark:border-amber-400/30 dark:text-primary-light mb-4">
          {confirmation.kind === 'email' ? <Mail size={26} /> : <Check size={26} />}
        </div>
        <h2 className="font-serif text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {confirmation.kind === 'email' ? t('dialog.sentTitle') : t('dialog.savedTitle')}
        </h2>
        <p className="text-gray-600 dark:text-slate-300 text-sm leading-relaxed">
          {confirmation.kind === 'saved'
            ? t('dialog.savedBody')
            : confirmation.emailSent
              ? t.rich('dialog.sentBody', {
                  email: confirmation.email,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })
              : t('dialog.sentBodyNoEmail')}
        </p>
        {confirmation.kind === 'email' && confirmation.emailSent && (
          <p className="text-gray-400 dark:text-slate-500 text-xs mt-3">{t('dialog.resend')}</p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 bg-primary hover:bg-primary-dark text-white text-sm font-bold px-6 py-2.5
                     rounded-full shadow-md shadow-primary/30 transition-colors"
        >
          {t('dialog.close')}
        </button>
      </div>
    )
  } else {
    content = (
      <div className="p-6 sm:p-7 flex flex-col gap-6">
        <div className="pr-10">
          <h2 className="font-serif text-[22px] font-black text-gray-900 dark:text-gray-100 m-0">
            {t('dialog.title')}
          </h2>
          <div className="text-[13px] text-gray-500 dark:text-slate-400">{chata.name}</div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Step: who */}
        <div className="flex flex-col gap-3">
          {sectionHeader(1, t('dialog.stepWho'))}
          {viewerName != null ? (
            <div className="text-sm text-gray-600 dark:text-slate-300">
              {t('dialog.signedInAs', { name: viewerName })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600 dark:text-slate-400">
                  {t('dialog.nameLabel')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('dialog.namePlaceholder')}
                  className={inputClass}
                />
                <div className="text-xs text-gray-400 dark:text-slate-500">
                  {t('dialog.nameHint')}
                </div>
              </div>
              {needsContact && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-gray-600 dark:text-slate-400">
                      {t('dialog.emailLabel')}
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('dialog.emailPlaceholder')}
                      className={inputClass}
                    />
                    <div className="text-xs text-gray-400 dark:text-slate-500">
                      {t('dialog.emailHint')}
                    </div>
                  </div>
                  {/* Adults-only affirmation (terms section 4) */}
                  <label className="flex items-start gap-2 text-[13px] text-gray-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adultConfirmed}
                      onChange={(e) => setAdultConfirmed(e.target.checked)}
                      className="mt-0.5 accent-[var(--color-primary)]"
                    />
                    <span>{t('dialog.adultConfirm')}</span>
                  </label>
                </>
              )}
            </div>
          )}
        </div>

        {/* Step: dates */}
        <div className="flex flex-col gap-3">
          {sectionHeader(2, t('dialog.stepDates'), t('dialog.stepDatesHint'))}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {planning.dateOptions.map((option) => {
              const selected = selectedDates.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleDate(option.id)}
                  className={`text-left rounded-[14px] border-2 px-4 py-3.5 flex items-center justify-between gap-3 transition-colors ${
                    selected
                      ? 'border-primary bg-primary/[0.06] dark:bg-primary/10'
                      : 'border-gray-200 hover:border-gray-300 dark:border-white/[0.12] dark:hover:border-white/[0.2]'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-serif text-base font-black text-gray-900 dark:text-gray-100">
                      {option.label}
                    </span>
                    {option.note && (
                      <span className="block text-xs text-gray-500 dark:text-slate-400">
                        {option.note}
                      </span>
                    )}
                  </span>
                  <span
                    className={`w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 ${
                      selected
                        ? 'bg-primary text-white'
                        : 'border-[1.5px] border-gray-300 dark:border-white/[0.25]'
                    }`}
                  >
                    {selected && <Check size={13} strokeWidth={3} />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step: places */}
        {planning.accommodations.length > 0 && (
          <div className="flex flex-col gap-3">
            {sectionHeader(3, t('dialog.stepPlaces'), t('dialog.stepPlacesHint'))}
            <div className="flex flex-col gap-2.5">
              {planning.accommodations.map((place) => {
                const available = accommodationAvailableFor(place, selectedDates)
                const selected = selectedPlaces.includes(place.id)
                const availableLabels = place.dateOptionIds
                  .map((id) => dateById.get(id)?.label)
                  .filter(Boolean)
                  .join(', ')
                return (
                  <button
                    key={place.id}
                    type="button"
                    disabled={!available}
                    onClick={() => togglePlace(place.id)}
                    className={`text-left rounded-[14px] border-2 px-4 py-3 flex items-center gap-3 transition-colors disabled:cursor-not-allowed ${
                      selected
                        ? 'border-primary bg-primary/[0.06] dark:bg-primary/10'
                        : 'border-gray-200 dark:border-white/[0.12]'
                    } ${available ? 'hover:border-gray-300 dark:hover:border-white/[0.2]' : 'opacity-55'}`}
                  >
                    <span
                      className={`w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0 ${
                        selected
                          ? 'bg-primary text-white'
                          : 'border-[1.5px] border-gray-300 dark:border-white/[0.25]'
                      }`}
                    >
                      {selected && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">
                        {place.name}
                        {place.locationNote && (
                          <span className="font-normal text-gray-500 dark:text-slate-400">
                            {' '}
                            · {place.locationNote}
                          </span>
                        )}
                      </span>
                      {!available && availableLabels && (
                        <span className="block text-xs text-gray-400 dark:text-slate-500">
                          {t('dialog.unavailable', { dates: availableLabels })}
                        </span>
                      )}
                    </span>
                    {place.url && (
                      <a
                        href={place.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-semibold text-primary-dark dark:text-primary-light whitespace-nowrap"
                      >
                        {t('dialog.listing')} ↗
                      </a>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex flex-col gap-2.5 border-t border-gray-100 dark:border-white/[0.07] pt-4">
          <button
            type="button"
            onClick={submit}
            disabled={busy || captchaPending}
            className="flex items-center justify-center gap-2.5 rounded-xl bg-primary hover:bg-primary-dark
                       text-white text-[15px] font-bold px-4 py-3.5 shadow-lg shadow-primary/35
                       transition-colors disabled:opacity-60"
          >
            <Send size={16} aria-hidden="true" />
            {busy ? t('dialog.submitting') : t('dialog.submit')}
          </button>
          {needsContact && (
            <>
              <p className="m-0 text-xs text-gray-400 dark:text-slate-500 text-center leading-relaxed">
                {t.rich('dialog.accountNote', {
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
              <TurnstileWidget
                onToken={setCaptchaToken}
                appearance="always"
                resetSignal={captchaReset}
                className="mx-auto"
              />
            </>
          )}
        </div>
      </div>
    )
  }

  // Portaled outside the ChataView wrapper that carries data-app-theme —
  // the overlay root must set it itself for the dark: variant to work
  return createPortal(
    <div
      data-app-theme={theme}
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={t('dialog.title')}
    >
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1b212c] dark:border dark:border-white/[0.06] rounded-3xl shadow-2xl w-full max-w-xl my-4 sm:my-0 sm:max-h-[92vh] sm:overflow-y-auto">
        <button
          type="button"
          aria-label={t('dialog.close')}
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200
                     dark:bg-white/[0.07] dark:hover:bg-white/[0.12]
                     flex items-center justify-center text-gray-500 dark:text-slate-400 transition-colors"
        >
          <X size={18} />
        </button>
        {content}
      </div>
    </div>,
    document.body,
  )
}
