'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Compass, Dock, Share, SquarePlus, X } from 'lucide-react'
import type { ManualInstallGuide } from '@/lib/pwa'
import { useAppTheme } from '../utils/useAppTheme'

/**
 * The manual-install walkthrough behind the footer "Install the app" link
 * where the browser has no install prompt to trigger (see
 * `manualInstallGuide` in src/lib/pwa.ts). Bottom sheet on phones, centred
 * card from `sm` up; the same portal + theme ritual as the ExpenseComposer
 * (portaled to body so no glass-card backdrop-filter clips the fixed
 * overlay, and the root sets data-app-theme itself because it escapes the
 * ChataView wrapper that normally carries it).
 *
 * Each step names the control the person has to find and shows it as a
 * "menu chip" — the iOS share glyph, the Add-to-Home-Screen row, the Add
 * button — so the sheet can be matched against the real share sheet at a
 * glance rather than read.
 */
interface Step {
  text: string
  chip?: React.ReactNode
  hint?: string
}

export function InstallGuideSheet({
  guide,
  onClose,
}: {
  guide: ManualInstallGuide
  onClose: () => void
}) {
  const t = useTranslations('common.installGuide')
  const { theme } = useAppTheme()
  const closeRef = useRef<HTMLButtonElement>(null)

  // Scroll lock + Escape + focus: the sheet is short, so focus lands on the
  // one button and returns to the footer link afterwards
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onClose])

  const iosSteps: Step[] = [
    {
      text: t('ios.step1'),
      chip: <MenuChip icon={<Share size={15} strokeWidth={2.25} />} />,
      hint: t('ios.step1Hint'),
    },
    {
      text: t('ios.step2'),
      chip: <MenuChip icon={<SquarePlus size={15} strokeWidth={2.25} />} label={t('ios.step2Chip')} />,
    },
    { text: t('ios.step3'), chip: <MenuChip label={t('ios.step3Chip')} accent /> },
  ]
  const steps: Step[] =
    guide === 'ios'
      ? iosSteps
      : guide === 'ios-safari-needed'
        ? [
            // The browser in hand cannot do it (old third-party browser or an
            // in-app one), so Safari comes first and the rest is the same
            {
              text: t('openSafari.step'),
              chip: <MenuChip icon={<Compass size={15} strokeWidth={2.25} />} label="Safari" />,
              hint: t('openSafari.hint'),
            },
            ...iosSteps,
          ]
        : [
            {
              text: t('macSafari.step1'),
              chip: <MenuChip icon={<Dock size={15} strokeWidth={2.25} />} label={t('macSafari.step1Chip')} />,
            },
            { text: t('macSafari.step2'), chip: <MenuChip label={t('macSafari.step2Chip')} accent /> },
          ]

  return createPortal(
    <div
      data-app-theme={theme}
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-guide-title"
    >
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-sm bg-white dark:bg-[#1b212c] dark:border dark:border-white/[0.06]
                   rounded-t-[28px] sm:rounded-3xl
                   px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6
                   shadow-[0_-20px_50px_rgba(0,0,0,0.35)] sm:shadow-2xl motion-safe:animate-slideUp"
      >
        {/* grab handle (phones); close X (desktop) */}
        <div className="w-9 h-[5px] rounded-full bg-gray-300 dark:bg-white/[0.2] mx-auto mb-4 sm:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="hidden sm:flex absolute top-4 right-4 w-8 h-8 items-center justify-center rounded-full
                     text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-200 transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-4 mb-4 sm:pr-8">
          {/* the real app icon, so what lands on the home screen is recognisable */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={56}
            height={56}
            className="w-14 h-14 rounded-[14px] shadow-md ring-1 ring-black/10 dark:ring-white/10 shrink-0"
          />
          <div className="min-w-0">
            <h2 id="install-guide-title" className="font-serif text-xl font-bold leading-tight text-gray-900 dark:text-gray-100">
              {t('title')}
            </h2>
            <p className="text-[13px] leading-snug text-gray-500 dark:text-slate-400 mt-1">{t('intro')}</p>
          </div>
        </div>

        <ol className="flex flex-col gap-2.5 mb-4">
          {steps.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-3.5 p-3.5 rounded-2xl border border-gray-200 bg-gray-50 dark:border-white/[0.1] dark:bg-white/[0.04]"
            >
              <span
                aria-hidden
                className="w-7 h-7 rounded-full bg-primary/10 text-primary dark:text-primary-light text-[13px] font-bold flex items-center justify-center shrink-0 mt-px"
              >
                {i + 1}
              </span>
              <span className="min-w-0 text-[15px] leading-relaxed text-gray-900 dark:text-gray-100">
                {step.text}
                {step.chip && <> {step.chip}</>}
                {step.hint && (
                  <span className="block text-[13px] leading-snug text-gray-500 dark:text-slate-400 mt-0.5">
                    {step.hint}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>

        <p className="text-[13px] leading-snug text-gray-500 dark:text-slate-400 mb-4">
          {guide === 'mac-safari' ? t('noteMac') : t('note')}
        </p>

        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold bg-primary hover:bg-primary-dark text-white transition-colors"
        >
          {t('close')}
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** A system menu row as the person will see it: glyph, label, or both. */
function MenuChip({
  icon,
  label,
  accent,
}: {
  icon?: React.ReactNode
  label?: string
  /** the confirming "Add" button, blue like the real one */
  accent?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 align-[-3px] rounded-lg px-2 py-0.5 text-[14px] font-semibold whitespace-nowrap
                  ${
                    accent
                      ? 'text-[#0a7aff] dark:text-[#3d95ff] bg-[#0a7aff]/10'
                      : 'text-gray-800 dark:text-gray-100 bg-white dark:bg-white/[0.08] border border-gray-200 dark:border-white/[0.12] shadow-sm'
                  }`}
    >
      {icon && <span aria-hidden className="shrink-0">{icon}</span>}
      {label}
    </span>
  )
}
