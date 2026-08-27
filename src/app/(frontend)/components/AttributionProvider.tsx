'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslations } from 'next-intl'
import { dedupeAttributions, type ImageAttribution } from '@/lib/attribution'

interface AttributionContextValue {
  items: ImageAttribution[]
  register: (key: string, items: ImageAttribution[]) => void
  unregister: (key: string) => void
}

const AttributionContext = createContext<AttributionContextValue | null>(null)

/**
 * Collects the photo credits owed by whatever the page is currently showing.
 *
 * It wraps both the page content and the footer, because the credits are
 * raised deep inside the page (the chata background, the homepage covers) and
 * spent in the footer, which is a sibling of the content, not a descendant.
 */
export function AttributionProvider({ children }: { children: React.ReactNode }) {
  const [sources, setSources] = useState<Record<string, ImageAttribution[]>>({})

  const register = useCallback((key: string, items: ImageAttribution[]) => {
    setSources((prev) => ({ ...prev, [key]: items }))
  }, [])

  const unregister = useCallback((key: string) => {
    setSources((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ items: dedupeAttributions(Object.values(sources).flat()), register, unregister }),
    [sources, register, unregister]
  )

  return <AttributionContext.Provider value={value}>{children}</AttributionContext.Provider>
}

/**
 * Declares the credits for images this component puts on screen. They are
 * withdrawn when it unmounts, so navigating from the homepage to a chata
 * swaps eight covers for one background without leaving stale entries.
 */
export function useRegisterAttributions(items: readonly ImageAttribution[] | null | undefined) {
  const context = useContext(AttributionContext)
  const key = useId()
  const register = context?.register
  const unregister = context?.unregister
  // Callers build this array inline, so a fresh identity every render would
  // re-fire the effect forever. The content is what matters, not the array.
  const serialized = JSON.stringify(items ?? [])

  useEffect(() => {
    if (!register || !unregister) return
    const parsed = JSON.parse(serialized) as ImageAttribution[]
    if (parsed.length === 0) {
      unregister(key)
      return
    }
    register(key, parsed)
    return () => unregister(key)
  }, [serialized, key, register, unregister])
}

/**
 * Registers credits from a server component, which cannot call a hook itself.
 */
export function RegisterAttributions({ items }: { items: ImageAttribution[] }) {
  useRegisterAttributions(items)
  return null
}

/**
 * The footer's info icon. Renders nothing until something on the page owes a
 * credit, so pages built entirely from stock keep the footer as it was.
 */
export function AttributionNotice() {
  const context = useContext(AttributionContext)
  const t = useTranslations('common.footer')
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)

  const open = hovered || pinned

  // A pinned panel is dismissed the way any popover is: Escape, or a click
  // that lands somewhere else. Hovering needs neither.
  useEffect(() => {
    if (!pinned) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setPinned(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [pinned])

  const items = context?.items ?? []
  if (items.length === 0) return null

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={t('imageCredits')}
        aria-expanded={open}
        onClick={() => setPinned((was) => !was)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-white/30 text-[10px] font-semibold leading-none text-white/50 transition-colors hover:border-white/60 hover:text-white/90 focus-visible:border-white/60 focus-visible:text-white/90"
      >
        i
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg border border-white/15 bg-slate-900/95 p-3 text-left shadow-xl backdrop-blur-sm"
        >
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-white/50">
            {t('imageCredits')}
          </span>
          <span className="flex flex-col gap-1">
            {items.map((item) => (
              <span key={JSON.stringify([item.text, item.url])} className="block text-xs text-white/70">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer license"
                    className="underline decoration-white/30 underline-offset-2 hover:text-white"
                  >
                    {item.text}
                  </a>
                ) : (
                  item.text
                )}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  )
}
