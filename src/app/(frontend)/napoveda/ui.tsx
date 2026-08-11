// Building blocks shared by /napoveda and its sub-pages. Server components
// only: the help is static text, screenshots and links. The chrome strings
// (back links, page cards, screenshot alts) are locale-aware — each
// component resolves the request locale itself via getLocale(), so the
// page-facing API is unchanged.

import type { ReactNode } from 'react'
import { getLocale } from 'next-intl/server'
import { ArrowLeft, ArrowRight, HelpCircle } from 'lucide-react'
import type { AppLocale } from '@/i18n/config'
import { SHOTS, type Shot, type ShotName } from './shots'

export interface HelpPageEntry {
  href: string
  title: string
  lead: string
}

const HELP_PAGES_CS: HelpPageEntry[] = [
  {
    href: '/napoveda/orientace',
    title: 'Kde co najdete',
    lead: 'Výběr chaty, záložky, informace o cestě, pokoje a auta.',
  },
  {
    href: '/napoveda/finance',
    title: 'Finance řádek po řádku',
    lead: 'Co znamená každé číslo ve vašem přehledu a jak se vyrovnat.',
  },
  {
    href: '/napoveda/vydaje',
    title: 'Přidání a úprava výdaje',
    lead: 'Průvodce na mobilu, formulář na počítači, účtenky, pozvání.',
  },
  {
    href: '/napoveda/ucet',
    title: 'Účet a přihlášení',
    lead: 'Odkaz do e-mailu, Microsoft a propojení přes „Jsi to ty?“.',
  },
  {
    href: '/napoveda/prehled',
    title: 'Podrobný přehled a výpočty',
    lead: 'Tabulka všech účastníků a matematika, která za ní stojí.',
  },
  {
    href: '/napoveda/sprava',
    title: 'Pro správce chaty',
    lead: 'Administrace, účastníci, zálohy, žádosti o propojení.',
  },
]

const HELP_PAGES_EN: HelpPageEntry[] = [
  {
    href: '/napoveda/orientace',
    title: 'Finding your way around',
    lead: 'Choosing a chata, the tabs, trip information, rooms and cars.',
  },
  {
    href: '/napoveda/finance',
    title: 'Finances line by line',
    lead: 'What every number in your summary means and how to settle up.',
  },
  {
    href: '/napoveda/vydaje',
    title: 'Adding and editing expenses',
    lead: 'The mobile wizard, the desktop form, receipts, invitations.',
  },
  {
    href: '/napoveda/ucet',
    title: 'Account and signing in',
    lead: 'A link in your email, Microsoft, and linking via "Is that you?".',
  },
  {
    href: '/napoveda/prehled',
    title: 'Detailed overview and the math',
    lead: 'A table of all participants and the math behind it.',
  },
  {
    href: '/napoveda/sprava',
    title: 'For chata admins',
    lead: 'The admin panel, participants, advances, link requests.',
  },
]

/** The six detail pages (title + lead) in the given locale. */
export function helpPages(locale: AppLocale): HelpPageEntry[] {
  return locale === 'en' ? HELP_PAGES_EN : HELP_PAGES_CS
}

const CHROME = {
  cs: {
    backHome: 'Zpět na chatu',
    backToHub: 'Zpět na rozcestník nápovědy',
    continueLabel: 'Pokračovat',
  },
  en: {
    backHome: 'Back to the chata',
    backToHub: 'Back to the help overview',
    continueLabel: 'Continue',
  },
} satisfies Record<AppLocale, Record<string, string>>

interface HelpShellProps {
  title: string
  lead: string
  children: ReactNode
  /** hub page has no parent link back into the help */
  isHub?: boolean
  /** hub badge icon — /soukromi reuses the shell with its own */
  icon?: ReactNode
}

export async function HelpShell({
  title,
  lead,
  children,
  isHub = false,
  icon = <HelpCircle size={44} className="text-primary-light" />,
}: HelpShellProps) {
  const locale = (await getLocale()) as AppLocale
  const chrome = CHROME[locale] ?? CHROME.cs
  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />

      <div className="relative z-10 max-w-app mx-auto px-5 py-10">
        <a
          href={isHub ? '/' : '/napoveda'}
          className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-xl text-sm font-semibold
                     text-white bg-white/20 border border-white/30 backdrop-blur-sm
                     hover:bg-white/30 transition-colors"
        >
          <ArrowLeft size={16} />
          {isHub ? chrome.backHome : chrome.backToHub}
        </a>

        <header className="text-center text-white mb-8">
          {isHub && (
            <div className="inline-block bg-white/10 p-4 rounded-full mb-3 backdrop-blur-sm border border-white/20 shadow-lg">
              {icon}
            </div>
          )}
          <h1 className="font-serif text-4xl md:text-5xl font-black tracking-tight mb-2 text-shadow-heading">
            {title}
          </h1>
          <p className="text-white/80 text-lg text-shadow-subheading max-w-2xl mx-auto">{lead}</p>
        </header>

        {children}
      </div>
    </div>
  )
}

interface SectionProps {
  id?: string
  title: string
  icon: ReactNode
  children: ReactNode
}

export function Section({ id, title, icon, children }: SectionProps) {
  return (
    <section
      id={id}
      className="scroll-mt-6 bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl p-6 sm:p-8"
    >
      <h2 className="flex items-center gap-3 font-serif text-2xl font-bold text-gray-900 mb-4">
        <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary shrink-0">
          {icon}
        </span>
        {title}
      </h2>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  )
}

/** Bulleted list with the amber marker used across the site. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5 pl-0 list-none m-0">
      {items.map((item, i) => (
        <li key={i} className="relative pl-6">
          <span className="absolute left-0 top-[0.55em] w-2 h-2 rounded-full bg-primary/70" />
          {item}
        </li>
      ))}
    </ul>
  )
}

/** Numbered walkthrough: one entry per thing you click or fill in. */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-3 pl-0 list-none m-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full
                       bg-primary text-white text-[13px] font-bold"
          >
            {i + 1}
          </span>
          <div className="flex-1 pt-0.5">{item}</div>
        </li>
      ))}
    </ol>
  )
}

/** Aside note: a warning, a limit, a thing people trip over. */
export function Callout({ children, tone = 'note' }: { children: ReactNode; tone?: 'note' | 'warn' }) {
  const styles =
    tone === 'warn'
      ? 'bg-amber-50 border-amber-200 text-amber-900'
      : 'bg-sky-50 border-sky-200 text-sky-900'
  return <div className={`rounded-xl border px-4 py-3 text-[14px] ${styles}`}>{children}</div>
}

const VARIANT_WIDTH = {
  phone: 'max-w-[220px]',
  inline: 'max-w-[420px]',
  wide: 'max-w-full',
  default: 'max-w-full',
} as const

/** One screenshot with its caption. `className` overrides the default width. */
export async function Screenshot({
  name,
  caption,
  className,
}: {
  name: ShotName
  caption?: ReactNode
  className?: string
}) {
  const locale = (await getLocale()) as AppLocale
  const shot: Shot = SHOTS[name]
  const width = className ?? VARIANT_WIDTH[shot.variant ?? 'default']
  return (
    <figure className={`m-0 ${width}`}>
      <img
        src={`/napoveda/${name}.webp`}
        width={shot.width}
        height={shot.height}
        alt={shot.alt[locale] ?? shot.alt.cs}
        loading="lazy"
        decoding="async"
        className="w-full h-auto rounded-xl border border-gray-200 shadow-lg bg-white"
      />
      {caption && (
        <figcaption className="mt-2 text-[13px] text-gray-500 leading-snug">{caption}</figcaption>
      )}
    </figure>
  )
}

/** Screenshots side by side (the three wizard steps, two split modes). */
export function ScreenshotRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-5 items-start">{children}</div>
}

/** Cards linking to the detailed pages. */
export async function PageCards({ exclude }: { exclude?: string }) {
  const locale = (await getLocale()) as AppLocale
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {helpPages(locale)
        .filter((page) => page.href !== exclude)
        .map((page) => (
          <a
            key={page.href}
            href={page.href}
            className="group flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-5 py-4
                     hover:border-primary hover:shadow-md transition-all"
          >
            <span className="flex items-center gap-2 font-semibold text-gray-900">
              {page.title}
              <ArrowRight
                size={16}
                className="text-primary opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </span>
            <span className="text-[14px] text-gray-600 leading-snug">{page.lead}</span>
          </a>
        ))}
    </div>
  )
}

/** Bottom navigation of a detail page. */
export async function NextPage({ href }: { href: string }) {
  const locale = (await getLocale()) as AppLocale
  const chrome = CHROME[locale] ?? CHROME.cs
  const page = helpPages(locale).find((p) => p.href === href)
  if (!page) return null
  return (
    <a
      href={page.href}
      className="flex items-center justify-between gap-4 rounded-glass-lg bg-white/95 backdrop-blur-md
                 shadow-2xl px-6 py-5 hover:bg-white transition-colors"
    >
      <span>
        <span className="block text-[13px] uppercase tracking-wide text-gray-500 mb-0.5">
          {chrome.continueLabel}
        </span>
        <span className="font-serif text-xl font-bold text-gray-900">{page.title}</span>
      </span>
      <ArrowRight className="text-primary flex-shrink-0" size={22} />
    </a>
  )
}
