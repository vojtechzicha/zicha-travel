'use client'

// Building blocks for editing "Organizace" (OrganizationView): the save call
// to POST /api/chatas/:id/organization with friendly error copy, the sticky
// bar of the picking modes ("Vyber si postel"), the short confirmation
// toast, seat dots for car cards, the "Jedu autem" form and the small
// pickers organizer mode uses. The server owns the rules
// (src/lib/organizationEditing.ts); this side only offers what will work.
// The bar and the toast are fixed to the viewport, so they portal to <body>
// and carry data-app-theme themselves (they escape the ChataView wrapper).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Minus, Plus, X } from 'lucide-react'
import type { Participant } from '@/payload-types'
import { useAppTheme } from '../utils/useAppTheme'

export type OrganizationAction =
  | { action: 'bed.place'; roomId: string; bedId: string; participantId: number; nights?: number[] }
  | { action: 'bed.leave'; participantId: number }
  | { action: 'car.offer'; driverId: number; car: CarFormValue }
  | { action: 'car.update'; carId: string; car: CarFormValue }
  | { action: 'car.remove'; carId: string }
  | { action: 'car.seat'; carId: string; participantId: number; seat: 'front' | 'back' }
  | { action: 'car.leave'; participantId: number }

export interface CarFormValue {
  name: string
  seats: number
  description?: string
  equipment?: string[]
}

// Somebody was faster: the viewer stays in the mode and picks again
const TAKEN = new Set(['room-full', 'car-full', 'front-taken'])

const ERROR_KEYS: Record<string, string> = {
  'is-driver': 'errorIsDriver',
  'already-driving': 'errorAlreadyDriving',
  'seats-too-few': 'errorSeatsTooFew',
  forbidden: 'errorForbidden',
  unauthorized: 'errorForbidden',
  'invalid-car': 'errorInvalidCar',
  'not-found': 'errorNotFound',
}

export type SaveResult = { ok: true } | { ok: false; message: string; taken: boolean }

/** One save at a time; reloads the chata on success. */
export function useOrganizationEditor(
  chataId: number | string,
  onDataChanged: () => Promise<void> | void,
) {
  const t = useTranslations('trip.organization')
  const [saving, setSaving] = useState(false)

  const run = async (body: OrganizationAction): Promise<SaveResult> => {
    if (saving) return { ok: false, message: t('errorGeneric'), taken: false }
    setSaving(true)
    try {
      const res = await fetch(`/api/chatas/${chataId}/organization`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        const code = payload.error ?? ''
        if (TAKEN.has(code)) return { ok: false, message: t('errorTaken'), taken: true }
        return { ok: false, message: t(ERROR_KEYS[code] ?? 'errorGeneric'), taken: false }
      }
      await onDataChanged()
      return { ok: true }
    } catch {
      return { ok: false, message: t('errorGeneric'), taken: false }
    } finally {
      setSaving(false)
    }
  }

  return { run, saving }
}

const buttonBase =
  'inline-flex min-h-9 items-center justify-center gap-1 rounded-full px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 disabled:opacity-50'

export const primaryButtonClass = `${buttonBase} bg-primary text-white hover:bg-primary-dark`
export const ghostButtonClass = `${buttonBase} text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/[0.08]`
/** quiet text action in the hub ("Změnit", "Vystoupit") */
export const linkButtonClass =
  'inline-flex min-h-9 items-center rounded-lg px-1.5 text-[13px] font-semibold text-primary-dark underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 dark:text-primary-light'

/** The bright "Sem" target shown on free places while picking. */
export function HereButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary px-4 text-[13px] font-bold text-white shadow-sm shadow-primary/30 hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-[#1b212c]"
    >
      {children}
    </button>
  )
}

/** Organizer mode's "×" inside a person's chip. */
export function RemoveButton({
  label,
  onClick,
  disabled,
  onDark,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  onDark?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`-my-1 -mr-1.5 ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 ${
        onDark
          ? 'text-white/85 hover:bg-white/20'
          : 'text-gray-500 hover:bg-gray-200 dark:text-slate-400 dark:hover:bg-white/[0.12]'
      }`}
    >
      <X size={14} aria-hidden="true" />
    </button>
  )
}

/**
 * The sticky bar of a picking mode: what you're choosing, an optional
 * extra step (nights), an error, and the way out. Esc leaves too.
 */
export function PickBar({
  title,
  error,
  onCancel,
  children,
}: {
  title: string
  error: string | null
  onCancel: () => void
  children?: React.ReactNode
}) {
  const t = useTranslations('trip.organization')
  const { theme } = useAppTheme()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div
      data-app-theme={theme}
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 pointer-events-none"
    >
      <div
        role="region"
        aria-label={title}
        className="pointer-events-auto mx-auto flex max-w-xl flex-col gap-2.5 rounded-2xl bg-gray-900 px-4 py-3 text-white shadow-[0_18px_40px_-10px_rgba(0,0,0,0.55)] dark:bg-white dark:text-gray-900"
      >
        <div className="flex items-center justify-between gap-3">
          <strong className="text-[14px] font-semibold leading-snug">{title}</strong>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 dark:text-gray-600 dark:hover:bg-gray-100 dark:hover:text-gray-900 dark:focus-visible:ring-gray-400"
          >
            {t('cancel')}
          </button>
        </div>
        {children}
        {error && (
          <p role="alert" className="m-0 text-[13px] font-medium text-red-300 dark:text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** "Hotovo. …" — a short status that fades after ~4 s. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  const { theme } = useAppTheme()
  // the live region exists from mount on, so screen readers catch the update
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(onDone, 4000)
    return () => window.clearTimeout(timer)
  }, [message, onDone])
  if (!mounted) return null
  return createPortal(
    <div
      data-app-theme={theme}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),16px)]"
    >
      {message && (
        <div className="rounded-full bg-gray-900 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg dark:bg-white dark:text-gray-900">
          {message}
        </div>
      )}
    </div>,
    document.body,
  )
}

/** Seats as dots: filled = taken, outlined = free. */
export function SeatDots({ taken, seats, label }: { taken: number; seats: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 items-center gap-1">
      {Array.from({ length: seats }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${
            i < taken ? 'bg-primary' : 'border-[1.5px] border-gray-300 dark:border-white/30'
          }`}
        />
      ))}
    </span>
  )
}

/** Radio-like chips: whom an organizer action is for. */
export function WhoPicker({
  label,
  candidates,
  selectedId,
  onSelect,
  ownIds,
  youSuffix,
}: {
  label: string
  candidates: Participant[]
  selectedId: number | null
  onSelect: (id: number) => void
  ownIds: number[]
  youSuffix: string
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-slate-300">
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {candidates.map((p) => {
          const selected = p.id === selectedId
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(p.id)}
              className={`${buttonBase} ${
                selected
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/[0.08] dark:text-slate-300 dark:hover:bg-white/[0.14]'
              }`}
            >
              {p.name}
              {ownIds.includes(p.id) && ` ${youSuffix}`}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Night toggles for per-night mode; at least one stays on. */
export function NightPicker({
  label,
  totalNights,
  selected,
  onChange,
  nightLabel,
  onDark,
}: {
  label: string
  totalNights: number
  selected: number[]
  onChange: (nights: number[]) => void
  nightLabel: (night: number) => string
  /** inside the dark pick bar */
  onDark?: boolean
}) {
  const toggle = (night: number) => {
    const next = selected.includes(night)
      ? selected.filter((n) => n !== night)
      : [...selected, night].sort((a, b) => a - b)
    if (next.length > 0) onChange(next)
  }
  return (
    <fieldset className="min-w-0">
      <legend
        className={`mb-1.5 text-xs font-semibold ${
          onDark ? 'text-white/75 dark:text-gray-600' : 'text-gray-600 dark:text-slate-300'
        }`}
      >
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: totalNights }, (_, i) => i + 1).map((night) => {
          const on = selected.includes(night)
          return (
            <button
              key={night}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(night)}
              className={`${buttonBase} min-w-12 ${
                on
                  ? 'bg-primary text-white'
                  : onDark
                    ? 'border border-white/30 text-white/70 dark:border-gray-300 dark:text-gray-500'
                    : 'border border-gray-200 text-gray-500 dark:border-white/[0.14] dark:text-slate-400'
              }`}
            >
              {nightLabel(night)}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Organizer mode's inline panel. */
export function EditPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3 dark:bg-primary/[0.08]">
      {children}
    </div>
  )
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="m-0 mt-1.5 text-xs text-red-600 dark:text-red-400">
      {message}
    </p>
  )
}

const fieldClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:border-white/[0.14] dark:bg-white/[0.04] dark:text-gray-100 dark:placeholder:text-slate-500'

/**
 * "Jedu autem": how many you take, when and from where, what else you
 * carry. Organizers adding somebody else's car also pick the driver and
 * may name the car; everybody else gets the name made from the driver.
 */
export function CarForm({
  mode,
  initial,
  drivers,
  ownIds,
  defaultDriverId,
  defaultNameFor,
  showName,
  saving,
  error,
  onSubmit,
  onCancel,
  onWithdraw,
  withdrawLabel,
  forSomeoneElse = false,
}: {
  mode: 'new' | 'edit'
  initial?: CarFormValue
  /** organizer "Přidat auto": who may drive */
  drivers?: Participant[]
  ownIds: number[]
  defaultDriverId: number | null
  defaultNameFor: (driverId: number | null) => string
  showName: boolean
  saving: boolean
  error: string | null
  onSubmit: (car: CarFormValue, driverId: number | null) => void
  onCancel: () => void
  onWithdraw?: () => void
  /** organizers withdraw somebody else's car ("Zrušit auto") */
  withdrawLabel?: string
  /** an organizer fills it in for the driver: questions in third person */
  forSomeoneElse?: boolean
}) {
  // "Kolik lidí vezmeš?" vs "Kolik lidí vezme?"
  const q = (key: 'carHowMany' | 'carHowManyHint' | 'carWhen' | 'carExtra') =>
    forSomeoneElse ? `${key}Other` : key
  const t = useTranslations('trip.organization')
  const [driverId, setDriverId] = useState<number | null>(defaultDriverId)
  const [name, setName] = useState(initial?.name ?? defaultNameFor(defaultDriverId))
  const [nameTouched, setNameTouched] = useState(Boolean(initial))
  // people besides the driver
  const [riders, setRiders] = useState(Math.max(1, Math.min(8, (initial?.seats ?? 4) - 1)))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [equipment, setEquipment] = useState((initial?.equipment ?? []).join(', '))
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)

  const pickDriver = (id: number) => {
    setDriverId(id)
    if (!nameTouched) setName(defaultNameFor(id))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const carName = (showName ? name : (initial?.name ?? defaultNameFor(driverId))).trim()
    if (!carName) return
    onSubmit(
      {
        name: carName,
        seats: riders + 1,
        description: description.trim() || undefined,
        equipment: equipment
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      },
      driverId,
    )
  }

  const label = 'flex flex-col gap-1.5 text-[13px] font-semibold text-gray-700 dark:text-slate-200'

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-2xl border-2 border-primary/40 bg-white p-4 dark:bg-white/[0.03]"
    >
      <strong className="font-serif text-[17px] text-gray-900 dark:text-gray-100">
        {mode === 'edit' ? t('carFormEdit') : drivers ? t('orgAddCar') : t('carFormNew')}
      </strong>
      {drivers && drivers.length > 0 && (
        <WhoPicker
          label={t('carDriver')}
          candidates={drivers}
          selectedId={driverId}
          onSelect={pickDriver}
          ownIds={ownIds}
          youSuffix={t('youSuffix')}
        />
      )}
      {showName && (
        <label className={label}>
          {t('carName')}
          <input
            type="text"
            value={name}
            maxLength={60}
            required
            onChange={(e) => {
              setName(e.target.value)
              setNameTouched(true)
            }}
            className={fieldClass}
          />
        </label>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-gray-700 dark:text-slate-200">
          {t(q('carHowMany'))}
          <span className="block text-xs font-normal text-gray-500 dark:text-slate-400">
            {t(q('carHowManyHint'))}
          </span>
        </span>
        <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-white/[0.14]">
          <button
            type="button"
            onClick={() => setRiders((n) => Math.max(1, n - 1))}
            disabled={riders <= 1}
            aria-label={t('less')}
            className="flex h-10 w-10 items-center justify-center text-gray-600 disabled:opacity-40 dark:text-slate-300"
          >
            <Minus size={15} />
          </button>
          <span className="min-w-8 text-center text-[15px] font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {riders}
          </span>
          <button
            type="button"
            onClick={() => setRiders((n) => Math.min(8, n + 1))}
            disabled={riders >= 8}
            aria-label={t('more')}
            className="flex h-10 w-10 items-center justify-center text-gray-600 disabled:opacity-40 dark:text-slate-300"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      <label className={label}>
        {t(q('carWhen'))}
        <textarea
          value={description}
          maxLength={300}
          rows={2}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('carWhenPlaceholder')}
          className={fieldClass}
        />
      </label>
      <label className={label}>
        {t(q('carExtra'))}
        <input
          type="text"
          value={equipment}
          maxLength={300}
          onChange={(e) => setEquipment(e.target.value)}
          placeholder={t('carExtraPlaceholder')}
          className={fieldClass}
        />
        <span className="text-xs font-normal text-gray-500 dark:text-slate-400">
          {t('carExtraHint')}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving || (drivers != null && driverId == null)}
          className={primaryButtonClass}
        >
          {saving ? t('saving') : mode === 'edit' ? t('save') : t('offerSeats')}
        </button>
        <button type="button" onClick={onCancel} className={ghostButtonClass}>
          {t('cancel')}
        </button>
        {onWithdraw && !confirmWithdraw && (
          <button
            type="button"
            onClick={() => setConfirmWithdraw(true)}
            className={`${ghostButtonClass} ml-auto text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10`}
          >
            {withdrawLabel ?? t('notGoing')}
          </button>
        )}
      </div>
      {onWithdraw && confirmWithdraw && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-[13px] text-red-800 dark:bg-red-500/10 dark:text-red-300">
          <span className="mr-auto">{t('notGoingConfirm')}</span>
          <button
            type="button"
            disabled={saving}
            onClick={onWithdraw}
            className={`${buttonBase} bg-red-600 text-white hover:bg-red-700`}
          >
            {t('notGoingYes')}
          </button>
          <button
            type="button"
            onClick={() => setConfirmWithdraw(false)}
            className={ghostButtonClass}
          >
            {t('keep')}
          </button>
        </div>
      )}
      <InlineError message={error} />
    </form>
  )
}
