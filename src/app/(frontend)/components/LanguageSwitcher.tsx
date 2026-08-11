'use client'

import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useTransition } from 'react'
import { LOCALES, type AppLocale } from '@/i18n/config'

// Label in its own language — a Czech speaker lost in the English UI (or the
// other way round) must be able to recognise their way back.
const LABELS: Record<AppLocale, string> = {
  cs: 'Čeština',
  en: 'English',
}

/** Footer language toggle. Persists via POST /api/locale, then re-renders
 *  the current page server-side in the new language. */
export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const switchTo = (next: AppLocale) => {
    if (next === locale || isPending) return
    startTransition(async () => {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      })
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5" role="group" aria-label="Language / Jazyk">
      {LOCALES.map((code, i) => (
        <span key={code} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true">·</span>}
          <button
            type="button"
            onClick={() => switchTo(code)}
            disabled={isPending}
            lang={code}
            aria-current={code === locale ? 'true' : undefined}
            className={
              code === locale
                ? 'font-semibold text-white/80 cursor-default'
                : 'hover:text-white transition-colors underline underline-offset-2 cursor-pointer'
            }
          >
            {LABELS[code]}
          </button>
        </span>
      ))}
    </span>
  )
}
