'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { AppLocale } from '@/i18n/config'
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock,
  MapPin,
  Plus,
  Search,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { CottageIcon } from './CottageIcon'
import { InlineSvgIcon } from './InlineSvgIcon'
import { formatCurrency, getAvatarColor, getInitials } from '@/lib/formatCurrency'
import { settlementFromBalance } from '@/lib/chataSelection'

/**
 * Homepage redesign ("Výběr chaty") — each chata carries its own identity
 * (cover photo + theme color + icon) and the list is ordered by time:
 * Právě probíhá → Plánujeme → Proběhlo (archive capped at 3 + picker).
 * All labels/buckets are precomputed server-side in page.tsx.
 */

export interface HomeChataItem {
  id: number
  name: string
  slug: string
  location: string
  themeColor: string
  iconUrl: string | null
  coverUrl: string | null
  status: 'live' | 'upcoming' | 'past'
  /** "Za 43 dní" — upcoming only */
  countdown: string | null
  /** "do neděle" — live only */
  untilLabel: string | null
  /** "5.–9. srpna 2026" */
  dateRangeLong: string | null
  /** "18.–20. 9." */
  dateRangeShort: string | null
  /** "květen 2026" — archive cards */
  monthYear: string | null
  /** grouping year for the picker */
  year: number | null
  /** all participant names (viewer's own first) — avatars + count */
  participantNames: string[]
  /** the viewer has a linked participant in this chata */
  isOwn: boolean
  /**
   * Money still to flow out of (negative) or back into (positive) the viewer's
   * pocket — NOT the finance view's balance, which counts planned expenses as
   * already paid by their payer. See `viewerFlow`. Null = not linked.
   */
  viewerFlow: number | null
  /** the viewer's cost so far (live-chata chip) */
  viewerCost: number | null
}

export interface HomeViewer {
  authenticated: boolean
  /** account display name (falls back to email) — header pill */
  displayName: string | null
  /** vocative for "Ahoj, Katko." (null = generic heading) */
  greetingName: string | null
  /** role "user" sees only own chatas — shows the "chybí vám chata?" note */
  isRestrictedList: boolean
}

interface ChataSelectorProps {
  chatas: HomeChataItem[]
  viewer: HomeViewer
}

const ARCHIVE_LIMIT = 3

// ─── small building blocks ────────────────────────────────────────────────

function ChataIcon({
  chata,
  size,
  color = '#fff',
}: {
  chata: Pick<HomeChataItem, 'iconUrl'>
  size: number
  color?: string
}) {
  if (chata.iconUrl) {
    return (
      <InlineSvgIcon
        url={chata.iconUrl}
        size={size}
        color={color}
        fallback={
          <span style={{ '--c': color } as React.CSSProperties} className="text-[var(--c)]">
            <CottageIcon size={size} />
          </span>
        }
      />
    )
  }
  return (
    <span style={{ '--c': color } as React.CSSProperties} className="text-[var(--c)]">
      <CottageIcon size={size} />
    </span>
  )
}

/** Colored rounded chip with the chata icon (hero + cards). */
function IconBadge({
  chata,
  size = 26,
  className = '',
}: {
  chata: Pick<HomeChataItem, 'iconUrl' | 'themeColor'>
  size?: number
  className?: string
}) {
  return (
    <div
      className={`rounded-xl p-2 shadow-lg shrink-0 bg-[var(--theme)] ${className}`}
      style={{ '--theme': chata.themeColor } as React.CSSProperties}
    >
      <ChataIcon chata={chata} size={size} />
    </div>
  )
}

function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  if (names.length === 0) return null
  const shown = names.slice(0, max)
  const rest = names.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((name, i) => (
        <div
          key={name}
          className={`w-8 h-8 rounded-full border-2 border-white/70 text-white flex items-center justify-center text-[11px] font-bold ${getAvatarColor(name)} ${i > 0 ? '-ml-2' : ''}`}
          title={name}
        >
          {getInitials(name)}
        </div>
      ))}
      {rest > 0 && (
        <div className="w-8 h-8 rounded-full border-2 border-white/70 bg-white/25 backdrop-blur-sm text-white flex items-center justify-center text-[11px] font-bold -ml-2">
          +{rest}
        </div>
      )}
    </div>
  )
}

/**
 * "Vyrovnáno" / "Zaplatíš X Kč" / "Dostaneš X Kč" pill (archive + picker).
 *
 * Reads a FLOW, not the finance view's balance: on a trip whose big expenses
 * are still only planned, the person fronting them has money going out, not
 * coming in. Once nothing is planned any more the two coincide, so archived
 * trips keep saying what they always said.
 *
 * Two variants because the backdrop differs. On white (the picker) a pastel
 * fill is the quiet option. On a cover photo it is the opposite — a filled
 * pastel pill becomes the brightest thing in the tile and outshouts the chata's
 * own name — so `compact` keeps the dark, and lets colour survive in the text.
 */
function SettlementChip({ flow, compact = false }: { flow: number | null; compact?: boolean }) {
  const t = useTranslations('chata.chataSelector')
  const locale = useLocale() as AppLocale
  if (flow === null) return null
  const settlement = settlementFromBalance(flow)
  const box = compact
    ? 'text-[10px] rounded-full px-2 py-0.5 shrink-0 bg-slate-950/60 backdrop-blur-[2px] ring-1 ring-white/15'
    : 'text-[11px] rounded-full px-2.5 py-1 shrink-0'
  if (settlement.status === 'settled') {
    return (
      <span
        className={`flex items-center gap-1 font-bold ${box} ${
          compact ? 'text-white/85' : 'bg-green-100 text-green-700'
        }`}
      >
        <Check
          size={compact ? 10 : 11}
          strokeWidth={3}
          className={compact ? 'text-green-400' : undefined}
        />
        {t('settled')}
      </span>
    )
  }
  if (settlement.status === 'debtor') {
    return (
      <span className={`font-bold ${box} ${compact ? 'text-red-300' : 'bg-red-100 text-red-700'}`}>
        {t('youPay', { amount: formatCurrency(settlement.amount, locale) })}
      </span>
    )
  }
  return (
    <span className={`font-bold ${box} ${compact ? 'text-green-300' : 'bg-green-100 text-green-700'}`}>
      {t('youReceive', { amount: formatCurrency(settlement.amount, locale) })}
    </span>
  )
}

function SectionLabel({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'live' | 'amber' | 'muted'
}) {
  const toneClass =
    tone === 'live' ? 'text-green-400' : tone === 'amber' ? 'text-amber-400' : 'text-white/55'
  return (
    <div className="flex items-center gap-3.5 mb-3.5">
      <span
        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] ${toneClass}`}
      >
        {tone === 'live' && (
          <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_0_4px_rgba(74,222,128,0.25)]" />
        )}
        {children}
      </span>
      <div className={`flex-1 h-px ${tone === 'muted' ? 'bg-white/15' : 'bg-white/20'}`} />
    </div>
  )
}

/**
 * Cover photo area with theme-colored fallback (no photo → gradient + icon).
 *
 * The photo goes through next/image rather than a CSS `background-image`: the
 * originals are ~2000px, 400–700 kB JPEGs served by the Payload media route,
 * and a background image is invisible to the preload scanner. `fill` + `sizes`
 * gets each card an appropriately sized AVIF/WebP, and `priority` lets the hero
 * (the LCP element) start downloading from the HTML rather than after layout.
 */
function CoverBackdrop({
  chata,
  dimmed = false,
  sizes,
  priority = false,
}: {
  chata: HomeChataItem
  dimmed?: boolean
  sizes: string
  priority?: boolean
}) {
  if (chata.coverUrl) {
    return (
      <Image
        src={chata.coverUrl}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${
          dimmed
            ? 'grayscale-[0.55] brightness-[0.82] transition-[filter] duration-300 group-hover:grayscale-[0.1] group-hover:brightness-100'
            : ''
        }`}
      />
    )
  }
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-[image:linear-gradient(135deg,var(--theme),color-mix(in_srgb,var(--theme)_35%,#0b1120))]"
      style={{ '--theme': chata.themeColor } as React.CSSProperties}
    >
      <span className="text-white/20 -translate-y-3">
        <CottageIcon size={80} />
      </span>
    </div>
  )
}

// ─── hero card ────────────────────────────────────────────────────────────

function HeroCard({ chata, viewer }: { chata: HomeChataItem; viewer: HomeViewer }) {
  const t = useTranslations('chata.chataSelector')
  const locale = useLocale() as AppLocale
  const isLive = chata.status === 'live'
  const canQuickAdd = isLive && viewer.authenticated && chata.isOwn
  const settlement = chata.viewerFlow !== null ? settlementFromBalance(chata.viewerFlow) : null

  return (
    <Link href={`/${chata.slug}`} className="block group">
      <div
        className={`relative h-[300px] sm:h-[340px] rounded-[20px] overflow-hidden flex items-end shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover:scale-[1.015] ${
          isLive ? 'ring-2 ring-green-400/35' : ''
        }`}
      >
        <CoverBackdrop
          chata={chata}
          priority
          sizes="(max-width: 1140px) 100vw, 1100px"
        />
        <div
          className="absolute inset-0 bg-[image:linear-gradient(to_top,rgba(8,14,24,0.9)_0%,rgba(8,14,24,0.35)_45%,color-mix(in_srgb,var(--theme)_15%,transparent)_100%)]"
          style={{ '--theme': chata.themeColor } as React.CSSProperties}
        />

        {/* status badge */}
        {isLive ? (
          <div className="absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center gap-2 bg-green-900/85 border border-green-400/50 backdrop-blur-md rounded-full px-4 py-2 text-white text-sm font-bold">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            {t('sectionLive')}{chata.untilLabel ? ` • ${chata.untilLabel}` : ''}
          </div>
        ) : chata.countdown ? (
          <div className="absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center gap-2 bg-white/15 border border-white/25 backdrop-blur-md rounded-full px-4 py-2 text-white text-sm font-bold">
            <Clock size={15} />
            {chata.countdown}
          </div>
        ) : null}

        <div className="relative w-full p-5 sm:px-8 sm:py-7 text-white flex flex-col gap-3">
          {/* no icon badge here on purpose: it indented the title while the meta
              row and the avatars below stayed at the padding edge, so the card
              had a ragged left margin. The hero is identified by a 340 px
              photograph and the largest type on the page — it needs no mark. */}
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <div className="font-serif text-2xl sm:text-4xl font-black tracking-tight leading-tight [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">
                {chata.name}
              </div>
              <div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap text-white/85 text-sm sm:text-[15px] mt-1">
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} />
                  {chata.location}
                </span>
                {chata.dateRangeLong && (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={14} />
                    {chata.dateRangeLong}
                  </span>
                )}
                {!viewer.authenticated && chata.participantNames.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Users size={14} />
                    {t('participantCount', { count: chata.participantNames.length })}
                  </span>
                )}
                {isLive && chata.viewerCost !== null && chata.viewerCost > 0 && (
                  <span className="text-amber-300">
                    {t('spentSoFar', { amount: formatCurrency(chata.viewerCost, locale) })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mt-1">
            {viewer.authenticated ? (
              <AvatarStack names={chata.participantNames} />
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {canQuickAdd ? (
                <span
                  className="hidden sm:flex items-center gap-2 bg-amber-600 rounded-full px-5 py-2.5 text-[15px] font-bold shadow-[0_10px_25px_rgba(217,119,6,0.45)]"
                  onClick={(e) => {
                    e.preventDefault()
                    window.location.href = `/${chata.slug}?view=finance&addExpense=1`
                  }}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  {t('addExpense')}
                </span>
              ) : settlement && settlement.status !== 'settled' ? (
                <span
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-lg ${
                    settlement.status === 'debtor' ? 'bg-amber-600/95' : 'bg-green-600/95'
                  }`}
                >
                  <Wallet size={15} />
                  {t(settlement.status === 'debtor' ? 'youStillPay' : 'youReceive', {
                    amount: formatCurrency(settlement.amount, locale),
                  })}
                </span>
              ) : null}
              <span className="w-11 h-11 rounded-full bg-white/95 text-gray-900 flex items-center justify-center shadow-lg shrink-0">
                <ArrowRight size={20} strokeWidth={2.5} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── upcoming ("Plánujeme") card ──────────────────────────────────────────

function UpcomingCard({ chata, wide = false }: { chata: HomeChataItem; wide?: boolean }) {
  return (
    <Link href={`/${chata.slug}`} className="block group">
      <div className="relative h-[170px] rounded-2xl overflow-hidden flex items-end shadow-[0_15px_35px_rgba(0,0,0,0.4)] transition-transform duration-200 group-hover:-translate-y-1">
        <CoverBackdrop
          chata={chata}
          sizes={wide ? '(max-width: 1140px) 100vw, 1100px' : '(max-width: 640px) 100vw, 540px'}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
        {chata.countdown && (
          <div className="absolute top-3 right-3 bg-white/15 border border-white/25 backdrop-blur-md rounded-full px-3 py-1 text-white text-xs font-bold">
            {chata.countdown}
          </div>
        )}
        <div className="relative p-4 text-white flex items-center gap-2.5">
          <IconBadge chata={chata} size={18} className="!rounded-[10px] !p-1.5 !shadow-md" />
          <div className="min-w-0">
            <div className="font-serif text-lg sm:text-[19px] font-black leading-snug [text-shadow:0_2px_8px_rgba(0,0,0,0.6)]">
              {chata.name}
            </div>
            <div className="text-white/85 text-[13px] truncate">
              {chata.location}
              {chata.dateRangeLong ? ` • ${chata.dateRangeLong}` : ''}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── archive ("Proběhlo") card — full-bleed cover photo, like the other cards ─

/**
 * Deliberately the smallest card on the page: hero (340) → upcoming (170) →
 * archive (118). Once every card carries its own photo, size is the only thing
 * left to carry the hierarchy. The cool tint + heavier desaturation is what
 * says "past" now that the white card is gone; hovering restores the colour,
 * which doubles as the "this one is clickable" cue.
 */
function ArchiveCard({ chata, viewer }: { chata: HomeChataItem; viewer: HomeViewer }) {
  return (
    <Link href={`/${chata.slug}`} className="block group h-full">
      <div className="relative h-[112px] sm:h-[132px] rounded-xl overflow-hidden flex items-end ring-1 ring-white/10 shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-transform duration-200 group-hover:-translate-y-0.5">
        <CoverBackdrop chata={chata} dimmed sizes="(max-width: 640px) 100vw, 540px" />
        <div className="absolute inset-0 bg-slate-900/25 transition-opacity duration-300 group-hover:opacity-0" />
        {/* a defined bottom band rather than a full-height wash — the name has to
            stay crisp on a bright photo without greying out the whole picture.
            The band alone loses to a sun sitting right behind the text, hence
            the text-shadow below as well */}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent" />
        {viewer.authenticated && chata.viewerFlow !== null && (
          <div className="absolute top-2 right-2">
            <SettlementChip flow={chata.viewerFlow} compact />
          </div>
        )}
        {/* the theme colour, not the icon, is what identifies a chata down here:
            a 13 px glyph on a photo is unreadable, a colour band is not — and it
            is the same colour the chata's own page is themed in */}
        <div
          className="absolute inset-y-0 left-0 w-[3px] bg-[var(--theme)]"
          style={{ '--theme': chata.themeColor } as React.CSSProperties}
        />
        <div className="relative w-full pl-3.5 pr-3 pb-2.5 text-white flex items-end gap-2">
          <div className="min-w-0">
            <div className="font-serif text-[13.5px] sm:text-sm font-bold leading-tight truncate [text-shadow:0_1px_6px_rgba(2,6,23,0.85)]">
              {chata.name}
            </div>
            <div className="text-white/70 text-[11px] truncate [text-shadow:0_1px_4px_rgba(2,6,23,0.8)]">
              {chata.location}
              {chata.monthYear ? ` • ${chata.monthYear}` : ''}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function ShowAllTile({ count, yearsLabel, onClick }: { count: number; yearsLabel: string | null; onClick: () => void }) {
  const t = useTranslations('chata.chataSelector')
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-[112px] sm:h-[132px] border-[1.5px] border-dashed border-white/30 rounded-xl flex flex-col items-center justify-center gap-1.5 text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
    >
      <div className="flex">
        <div className="w-6 h-6 rounded-md bg-white/15 border border-white/25" />
        <div className="w-6 h-6 rounded-md bg-white/10 border border-white/20 -ml-2.5" />
        <div className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/15 -ml-2.5" />
      </div>
      <span className="text-[13px] font-bold">{t('showAll', { count })}</span>
      {yearsLabel && <span className="text-[11px] text-white/50">{yearsLabel}</span>}
    </button>
  )
}

// ─── "Zobrazit vše" picker overlay ────────────────────────────────────────

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function PickerStatusChip({ chata, viewer }: { chata: HomeChataItem; viewer: HomeViewer }) {
  const t = useTranslations('chata.chataSelector')
  if (chata.status === 'live') {
    return (
      <span className="flex items-center gap-1.5 bg-green-100 text-green-700 text-[11px] font-bold rounded-full px-2.5 py-1 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        {t('sectionLive')}
      </span>
    )
  }
  if (chata.status === 'upcoming' && chata.countdown) {
    return (
      <span className="bg-amber-100 text-amber-700 text-[11px] font-bold rounded-full px-2.5 py-1 shrink-0">
        {chata.countdown}
      </span>
    )
  }
  if (viewer.authenticated) return <SettlementChip flow={chata.viewerFlow} />
  return null
}

function ChataPickerModal({
  chatas,
  viewer,
  onClose,
}: {
  chatas: HomeChataItem[]
  viewer: HomeViewer
  onClose: () => void
}) {
  const t = useTranslations('chata.chataSelector')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return chatas
    return chatas.filter(
      (c) => normalize(c.name).includes(q) || normalize(c.location).includes(q)
    )
  }, [chatas, query])

  // group by year, newest first; live chatas float to the top of their year
  const groups = useMemo(() => {
    const byYear = new Map<number | null, HomeChataItem[]>()
    for (const chata of filtered) {
      const list = byYear.get(chata.year) ?? []
      list.push(chata)
      byYear.set(chata.year, list)
    }
    return [...byYear.entries()]
      .sort(([a], [b]) => (b ?? -Infinity) - (a ?? -Infinity))
      .map(([year, list]) => ({
        year,
        chatas: list.sort((a, b) => {
          if ((a.status === 'live') !== (b.status === 'live')) return a.status === 'live' ? -1 : 1
          return 0
        }),
      }))
  }, [filtered])

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] max-h-full bg-white/[0.97] rounded-[20px] shadow-[0_40px_80px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('allChatas')}
      >
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-black text-gray-900 m-0">
              {t('allChatas')} <span className="text-gray-400 font-normal text-base">({chatas.length})</span>
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
          <label className="flex items-center gap-2.5 bg-gray-100 rounded-xl px-3.5 py-2.5 text-gray-400 focus-within:ring-2 focus-within:ring-amber-500/40">
            <Search size={17} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
              autoFocus
            />
          </label>
        </div>
        <div className="overflow-y-auto px-6 pb-5">
          {groups.map(({ year, chatas: list }) => (
            <div key={year ?? 'other'}>
              <div className="pt-3.5 pb-1.5 text-xs font-bold tracking-[0.1em] text-gray-400 uppercase">
                {year ?? t('otherYears')}
              </div>
              {list.map((chata) => (
                <Link
                  key={chata.id}
                  href={`/${chata.slug}`}
                  className="flex items-center gap-3 px-2.5 py-2.5 -mx-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <span
                    className="rounded-[9px] p-1.5 flex shrink-0 bg-[color-mix(in_srgb,var(--theme)_12%,white)]"
                    style={{ '--theme': chata.themeColor } as React.CSSProperties}
                  >
                    <ChataIcon chata={chata} size={17} color={chata.themeColor} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 truncate">
                      {chata.name}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {chata.location}
                      {chata.dateRangeShort ? ` • ${chata.dateRangeShort}` : ''}
                    </span>
                  </span>
                  <PickerStatusChip chata={chata} viewer={viewer} />
                </Link>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">{t('nothingFound')}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── page ─────────────────────────────────────────────────────────────────

export function ChataSelector({ chatas, viewer }: ChataSelectorProps) {
  const t = useTranslations('chata.chataSelector')
  const [pickerOpen, setPickerOpen] = useState(false)

  const live = chatas.filter((c) => c.status === 'live')
  const upcoming = chatas.filter((c) => c.status === 'upcoming')
  const past = chatas.filter((c) => c.status === 'past')

  const hero = live[0] ?? upcoming[0] ?? null
  const planned = [...live.slice(1), ...upcoming.filter((c) => c !== hero)]
  const archiveCapped = past.length > ARCHIVE_LIMIT + 1
  const archiveShown = archiveCapped ? past.slice(0, ARCHIVE_LIMIT) : past

  const years = chatas.map((c) => c.year).filter((y): y is number => y !== null)
  const yearsLabel =
    years.length > 0
      ? t('archiveYears', { from: String(Math.min(...years)), to: String(Math.max(...years)) })
      : null

  const subtitle =
    live.length > 0
      ? upcoming.length > 0
        ? t('subtitleLiveUpcoming')
        : t('subtitleLive')
      : upcoming.length > 0
        ? t('subtitleUpcoming')
        : t('subtitleDefault')

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/55 to-slate-900/85 z-0 pointer-events-none" />

      <div className="relative z-10 max-w-app mx-auto px-4 sm:px-5 py-8 sm:py-10 animate-slideDown">
        {viewer.authenticated ? (
          <>
            {/* top bar: brand + account pill */}
            <div className="flex items-center justify-between mb-8 sm:mb-11">
              <div className="flex items-center gap-2.5 text-white">
                <CottageIcon className="text-amber-400" size={26} />
                <span className="font-serif text-lg sm:text-xl font-black">zicha.travel</span>
              </div>
              {viewer.displayName && (
                <div className="flex items-center gap-2.5 bg-white/10 border border-white/20 backdrop-blur-md rounded-full p-1.5 sm:py-1.5 sm:pl-1.5 sm:pr-4">
                  <span
                    className={`w-[30px] h-[30px] rounded-full text-white flex items-center justify-center text-xs font-bold ${getAvatarColor(viewer.displayName)}`}
                  >
                    {getInitials(viewer.displayName)}
                  </span>
                  <span className="hidden sm:block text-white text-sm font-semibold">
                    {viewer.displayName}
                  </span>
                </div>
              )}
            </div>

            {/* greeting */}
            <div className="mb-8 sm:mb-9 text-white">
              <h1 className="font-serif text-3xl sm:text-5xl font-black tracking-tight mb-1.5 [text-shadow:0_2px_10px_rgba(0,0,0,0.5)]">
                {viewer.greetingName
                  ? t('greeting', { name: viewer.greetingName })
                  : t('choosePrompt')}
              </h1>
              <p className="text-white/80 text-sm sm:text-[17px] [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
                {subtitle}
              </p>
            </div>
          </>
        ) : (
          /* anonymous: centered branding hero */
          <header className="text-center mb-10 text-white">
            <div className="inline-block bg-white/10 p-4 rounded-full mb-3 backdrop-blur-sm border border-white/20 shadow-lg">
              <CottageIcon className="text-amber-400" size={48} />
            </div>
            <h1 className="font-serif text-5xl md:text-6xl font-black tracking-tight drop-shadow-lg mb-2">
              zicha.travel
            </h1>
            <p className="text-white/80 text-lg">{t('anonymousTagline')}</p>
          </header>
        )}

        {/* hero (live or nearest upcoming) */}
        {hero && (
          <section className="mb-8">
            <SectionLabel tone={hero.status === 'live' ? 'live' : 'amber'}>
              {hero.status === 'live' ? t('sectionLive') : t('sectionNearest')}
            </SectionLabel>
            <HeroCard chata={hero} viewer={viewer} />
          </section>
        )}

        {/* remaining planned trips */}
        {planned.length > 0 && (
          <section className="mb-8">
            <SectionLabel tone="amber">{t('sectionPlanned')}</SectionLabel>
            {/* a single planned trip spans the row — half a row of card with
                dead space beside it reads as a layout that failed to load */}
            <div
              className={`grid gap-4 sm:gap-5 ${
                planned.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
              }`}
            >
              {planned.map((chata) => (
                <UpcomingCard key={chata.id} chata={chata} wide={planned.length === 1} />
              ))}
            </div>
          </section>
        )}

        {/* archive */}
        {past.length > 0 && (
          <section>
            <SectionLabel tone="muted">
              {t('sectionPast')}{archiveCapped ? ` (${past.length})` : ''}
            </SectionLabel>
            {/* the tray: with every card now a photo, this faint panel is what
                separates the archive from the hero band above it */}
            <div className="rounded-2xl bg-white/[0.045] border border-white/10 p-2.5 sm:p-3">
              {/* two columns, not three: the archive is capped at ARCHIVE_LIMIT + the
                  "show all" tile, so 4 tiles is the normal count and 2×2 fills the
                  tray. Three columns left an orphan on its own row. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 items-stretch">
                {archiveShown.map((chata) => (
                  <ArchiveCard key={chata.id} chata={chata} viewer={viewer} />
                ))}
                {archiveCapped && (
                  <ShowAllTile
                    count={past.length}
                    yearsLabel={yearsLabel}
                    onClick={() => setPickerOpen(true)}
                  />
                )}
              </div>
            </div>
          </section>
        )}

        {chatas.length === 0 && (
          <div className="bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl p-10 max-w-md mx-auto text-center">
            <p className="text-gray-600 text-lg">{t('noChatas')}</p>
          </div>
        )}

        {/* footers */}
        {viewer.authenticated && viewer.isRestrictedList && chatas.length > 0 && (
          <p className="text-center text-[13px] text-white/55 mt-7">
            {t('restrictedNote')}{' '}
            <span className="text-white/85 font-semibold">{t('restrictedContact')}</span>
          </p>
        )}
        {!viewer.authenticated && chatas.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-8 bg-white/10 border border-white/20 backdrop-blur-md rounded-2xl px-6 py-4">
            <span className="text-white/85 text-sm text-center">{t('loginPrompt')}</span>
            <Link
              href="/login"
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-[10px] px-5 py-2.5 shadow-[0_8px_20px_rgba(217,119,6,0.4)] transition-colors shrink-0"
            >
              {t('signIn')}
            </Link>
          </div>
        )}
      </div>

      {pickerOpen && (
        <ChataPickerModal chatas={chatas} viewer={viewer} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )
}
