'use client'

// Shared building blocks of the "white sheet" document layout used by the
// Informace / Organizace / Účastníci tabs (design: Detail chaty — finál).
// One sheet per tab, serif section headings, light + dark via the scoped
// `dark` variant (data-app-theme on the ChataView wrapper).

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** The document itself — white in light mode, #1b212c in dark. */
export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mx-auto w-full max-w-5xl rounded-[22px] sm:rounded-[26px] bg-white p-5 sm:px-11 sm:py-9
        shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] dark:bg-[#1b212c] dark:border dark:border-white/[0.06]
        dark:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] animate-in fade-in duration-300 ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

/** Serif section heading with an accent icon and a bottom rule. */
export function SheetHeading({
  icon: Icon,
  title,
  aside,
}: {
  icon: LucideIcon
  title: string
  aside?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 pb-2.5 sm:pb-3 border-b-[3px] border-gray-100 dark:border-white/10 mt-7 sm:mt-9 mb-4">
      <Icon
        size={20}
        className="text-primary dark:text-primary-light shrink-0"
        aria-hidden="true"
      />
      <h3 className="font-serif text-[19px] sm:text-[23px] font-bold text-gray-900 dark:text-gray-100 m-0">
        {title}
      </h3>
      {aside != null && (
        <span className="ml-auto text-xs sm:text-[13px] text-gray-400 dark:text-slate-400 text-right">
          {aside}
        </span>
      )}
    </div>
  )
}

/** Centered stat row, e.g. "4 noci · 12 lidí + 2 psi · 12/14 míst". */
export function StatStrip({
  items,
  bordered = true,
}: {
  items: Array<{ value: ReactNode; label: string }>
  bordered?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div
      className={`flex flex-wrap justify-center gap-x-6 sm:gap-x-8 gap-y-1 py-3.5 text-sm text-gray-700 dark:text-slate-300 ${
        bordered ? 'border-y border-gray-100 dark:border-white/[0.07]' : ''
      }`}
    >
      {items.map((item, idx) => (
        <div key={idx}>
          <strong className="font-serif text-[17px] text-gray-900 dark:text-gray-100 font-black">
            {item.value}
          </strong>{' '}
          {item.label}
        </div>
      ))}
    </div>
  )
}

/**
 * The personal highlight card ("Tvoje karta" / "Tvoje místa") — primary-
 * tinted so it follows the chata theme color (amber on the default theme).
 */
export function AccentCard({
  label,
  action,
  children,
  className,
}: {
  label: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-primary/30 bg-primary/[0.06] dark:border-primary/40 dark:bg-primary/10 px-4 py-3.5 sm:px-5 sm:py-4 ${className ?? ''}`}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-primary-dark dark:text-primary-light">
          {label}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

/** Dashed muted hint box (anonymous login nudge, claim intro, …). */
export function HintCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 dark:border-white/20 dark:bg-white/[0.03] px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 text-[13px] text-gray-500 dark:text-slate-400 leading-relaxed">
      {children}
    </div>
  )
}

/** Label + value row ("Adresa — Karlov pod Pradědem 118"). */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 text-gray-400 dark:text-slate-500">{label}</span>
      <span className="text-gray-700 dark:text-slate-200 min-w-0">{children}</span>
    </div>
  )
}

/** Participant pill; `highlight` marks the viewer's own name. */
export function PersonChip({
  children,
  highlight = false,
  dashed = false,
}: {
  children: ReactNode
  highlight?: boolean
  dashed?: boolean
}) {
  if (highlight) {
    return (
      <span className="rounded-full bg-primary text-white text-xs sm:text-[13px] font-semibold px-2.5 py-1">
        {children}
      </span>
    )
  }
  if (dashed) {
    return (
      <span className="rounded-full border border-dashed border-gray-300 text-gray-400 dark:border-white/20 dark:text-slate-400 text-xs sm:text-[13px] px-2.5 py-1">
        {children}
      </span>
    )
  }
  return (
    <span className="rounded-full bg-gray-100 text-gray-700 dark:bg-white/[0.08] dark:text-slate-300 text-xs sm:text-[13px] px-2.5 py-1">
      {children}
    </span>
  )
}

/** Small colored status badge (occupancy "4/4", "čeká", …). */
export function StatusBadge({
  tone,
  children,
}: {
  tone: 'green' | 'amber' | 'gray'
  children: ReactNode
}) {
  const tones = {
    green:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    gray: 'bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-slate-400',
  } as const
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] sm:text-xs font-bold ${tones[tone]}`}>
      {children}
    </span>
  )
}

/** Primary action button/link (solid). */
export function PrimaryAction({
  href,
  onClick,
  children,
}: {
  href?: string
  onClick?: () => void
  children: ReactNode
}) {
  const className =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-dark text-white text-[13px] font-semibold px-4 py-2.5 transition-colors'
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  )
}

/** Secondary (outlined) action button/link. */
export function SecondaryAction({
  href,
  onClick,
  children,
}: {
  href?: string
  onClick?: () => void
  children: ReactNode
}) {
  const className =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/[0.14] dark:text-slate-300 dark:hover:bg-white/[0.06] text-[13px] font-semibold px-4 py-2.5 transition-colors'
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  )
}
