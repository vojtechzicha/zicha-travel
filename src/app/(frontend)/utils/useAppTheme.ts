'use client'

import { useCallback, useEffect, useState } from 'react'

export type AppTheme = 'light' | 'dark'

// Dark mode is scoped to the chata detail screens (Informace / Organizace /
// Účastníci / Finance) — the wrapper there sets data-app-theme, which the
// `dark` Tailwind variant in styles.css keys off. Other screens never set the
// attribute and stay light.
const STORAGE_KEY = 'zt_theme'

function readStored(): AppTheme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

export function useAppTheme(): { theme: AppTheme; toggleTheme: () => void } {
  // SSR/first paint renders light; the effect below resolves the real theme
  // right after mount (the chata page shows a skeleton at that point anyway)
  const [theme, setTheme] = useState<AppTheme>('light')

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const stored = readStored()
    setTheme(stored ?? (mq.matches ? 'dark' : 'light'))
    // Follow OS changes only while the user has not chosen explicitly
    const onChange = (e: MediaQueryListEvent) => {
      if (readStored() === null) setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: AppTheme = prev === 'dark' ? 'light' : 'dark'
      try {
        // Toggling back to what the OS currently prefers means "stop
        // overriding": drop the stored value so the theme follows the system
        // again (evaluated only here, at tap time — an explicit choice is
        // never reinterpreted later when the OS preference changes)
        const osTheme: AppTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        if (next === osTheme) {
          window.localStorage.removeItem(STORAGE_KEY)
        } else {
          window.localStorage.setItem(STORAGE_KEY, next)
        }
      } catch {
        // private mode etc. — theme still flips for this visit
      }
      return next
    })
  }, [])

  return { theme, toggleTheme }
}
