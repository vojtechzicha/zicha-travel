'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
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
  /** combined balance of the viewer's participants (null = not linked) */
  viewerBalance: number | null
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

/** "Vyrovnáno" / "Doplácíš X Kč" / "Dostaneš X Kč" pill (archive + picker). */
function SettlementChip({ balance }: { balance: number | null }) {
  if (balance === null) return null
  const settlement = settlementFromBalance(balance)
  if (settlement.status === 'settled') {
    return (
      <span className="flex items-center gap-1 bg-green-100 text-green-700 text-[11px] font-bold rounded-full px-2.5 py-1 shrink-0">
        <Check size={11} strokeWidth={3} />
        Vyrovnáno
      </span>
    )
  }
  if (settlement.status === 'debtor') {
    return (
      <span className="bg-red-100 text-red-700 text-[11px] font-bold rounded-full px-2.5 py-1 shrink-0">
        Doplácíš {formatCurrency(settlement.amount)}
      </span>
    )
  }
  return (
    <span className="bg-green-100 text-green-700 text-[11px] font-bold rounded-full px-2.5 py-1 shrink-0">
      Dostaneš {formatCurrency(settlement.amount)}
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
        className={`object-cover ${dimmed ? 'grayscale-[0.35] brightness-90' : ''}`}
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
  const isLive = chata.status === 'live'
  const canQuickAdd = isLive && viewer.authenticated && chata.isOwn
  const settlement = chata.viewerBalance !== null ? settlementFromBalance(chata.viewerBalance) : null

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
            Právě probíhá{chata.untilLabel ? ` • ${chata.untilLabel}` : ''}
          </div>
        ) : chata.countdown ? (
          <div className="absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center gap-2 bg-white/15 border border-white/25 backdrop-blur-md rounded-full px-4 py-2 text-white text-sm font-bold">
            <Clock size={15} />
            {chata.countdown}
          </div>
        ) : null}

        <div className="relative w-full p-5 sm:px-8 sm:py-7 text-white flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <IconBadge chata={chata} size={26} className="hidden sm:block" />
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
                    {chata.participantNames.length}{' '}
                    {chata.participantNames.length === 1
                      ? 'účastník'
                      : chata.participantNames.length <= 4
                        ? 'účastníci'
                        : 'účastníků'}
                  </span>
                )}
                {isLive && chata.viewerCost !== null && chata.viewerCost > 0 && (
                  <span className="text-amber-300">
                    Tvá útrata zatím {formatCurrency(chata.viewerCost)}
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
                  Přidat výdaj
                </span>
              ) : settlement && settlement.status !== 'settled' ? (
                <span
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-lg ${
                    settlement.status === 'debtor' ? 'bg-amber-600/95' : 'bg-green-600/95'
                  }`}
                >
                  <Wallet size={15} />
                  {settlement.status === 'debtor' ? 'Doplácíš' : 'Dostaneš'}{' '}
                  {formatCurrency(settlement.amount)}
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

function UpcomingCard({ chata }: { chata: HomeChataItem }) {
  return (
    <Link href={`/${chata.slug}`} className="block group">
      <div className="relative h-[170px] rounded-2xl overflow-hidden flex items-end shadow-[0_15px_35px_rgba(0,0,0,0.4)] transition-transform duration-200 group-hover:-translate-y-1">
        <CoverBackdrop chata={chata} sizes="(max-width: 640px) 100vw, 540px" />
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

// ─── archive ("Proběhlo") card — column on ≥sm, compact row on mobile ─────

function ArchiveCard({ chata, viewer }: { chata: HomeChataItem; viewer: HomeViewer }) {
  return (
    <Link href={`/${chata.slug}`} className="block group">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.3)] transition-transform duration-200 group-hover:-translate-y-1 flex items-center gap-3 p-2.5 sm:p-0 sm:block">
        <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 sm:w-full sm:h-24 sm:rounded-none">
          <CoverBackdrop chata={chata} dimmed sizes="(max-width: 640px) 56px, 280px" />
        </div>
        <div className="flex-1 min-w-0 sm:p-4">
          <div className="flex items-center gap-2">
            <span
              className="hidden sm:flex rounded-lg p-1 bg-[color-mix(in_srgb,var(--theme)_12%,white)]"
              style={{ '--theme': chata.themeColor } as React.CSSProperties}
            >
              <ChataIcon chata={chata} size={16} color={chata.themeColor} />
            </span>
            <span className="font-serif text-sm sm:text-base font-bold text-gray-900 truncate">
              {chata.name}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-1 sm:mt-2">
            <span className="text-gray-500 text-xs sm:text-[13px] truncate">
              {chata.location}
              {chata.monthYear ? ` • ${chata.monthYear}` : ''}
            </span>
            {viewer.authenticated && (
              <span className="hidden sm:block">
                <SettlementChip balance={chata.viewerBalance} />
              </span>
            )}
          </div>
        </div>
        {viewer.authenticated && (
          <span className="sm:hidden pr-1">
            <SettlementChip balance={chata.viewerBalance} />
          </span>
        )}
      </div>
    </Link>
  )
}

function ShowAllTile({ count, yearsLabel, onClick }: { count: number; yearsLabel: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[88px] sm:min-h-0 border-[1.5px] border-dashed border-white/35 rounded-2xl flex flex-col items-center justify-center gap-2 text-white/80 hover:bg-white/10 transition-colors cursor-pointer py-4"
    >
      <div className="flex">
        <div className="w-7 h-7 rounded-lg bg-white/15 border border-white/25" />
        <div className="w-7 h-7 rounded-lg bg-white/10 border border-white/20 -ml-3" />
        <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/15 -ml-3" />
      </div>
      <span className="text-sm font-bold">Zobrazit všech {count} →</span>
      {yearsLabel && <span className="text-xs text-white/50">{yearsLabel}</span>}
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
  if (chata.status === 'live') {
    return (
      <span className="flex items-center gap-1.5 bg-green-100 text-green-700 text-[11px] font-bold rounded-full px-2.5 py-1 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Právě probíhá
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
  if (viewer.authenticated) return <SettlementChip balance={chata.viewerBalance} />
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
        aria-label="Všechny chaty"
      >
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl font-black text-gray-900 m-0">
              Všechny chaty <span className="text-gray-400 font-normal text-base">({chatas.length})</span>
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Zavřít"
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
              placeholder="Hledat podle názvu nebo místa…"
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
              autoFocus
            />
          </label>
        </div>
        <div className="overflow-y-auto px-6 pb-5">
          {groups.map(({ year, chatas: list }) => (
            <div key={year ?? 'other'}>
              <div className="pt-3.5 pb-1.5 text-xs font-bold tracking-[0.1em] text-gray-400 uppercase">
                {year ?? 'Ostatní'}
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
            <p className="text-center text-sm text-gray-500 py-8">Nic nenalezeno.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── page ─────────────────────────────────────────────────────────────────

export function ChataSelector({ chatas, viewer }: ChataSelectorProps) {
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
    years.length > 0 ? `archiv ${Math.min(...years)}–${Math.max(...years)}` : null

  const subtitle =
    live.length > 0
      ? upcoming.length > 0
        ? 'Právě jsi na chatě — a další výjezdy se plánují.'
        : 'Právě jsi na chatě.'
      : upcoming.length > 0
        ? 'Tvoje chaty na jednom místě — nejbližší výjezd už se blíží.'
        : 'Tvoje chaty na jednom místě.'

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
                {viewer.greetingName ? `Ahoj, ${viewer.greetingName}.` : 'Vyberte si chatu.'}
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
            <p className="text-white/80 text-lg">
              Společně na chatu — plánování, informace a finance.
            </p>
          </header>
        )}

        {/* hero (live or nearest upcoming) */}
        {hero && (
          <section className="mb-8">
            <SectionLabel tone={hero.status === 'live' ? 'live' : 'amber'}>
              {hero.status === 'live' ? 'Právě probíhá' : 'Nejbližší chata'}
            </SectionLabel>
            <HeroCard chata={hero} viewer={viewer} />
          </section>
        )}

        {/* remaining planned trips */}
        {planned.length > 0 && (
          <section className="mb-8">
            <SectionLabel tone="amber">Plánujeme</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {planned.map((chata) => (
                <UpcomingCard key={chata.id} chata={chata} />
              ))}
            </div>
          </section>
        )}

        {/* archive */}
        {past.length > 0 && (
          <section>
            <SectionLabel tone="muted">
              Proběhlo{archiveCapped ? ` (${past.length})` : ''}
            </SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-[18px] items-stretch">
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
          </section>
        )}

        {chatas.length === 0 && (
          <div className="bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl p-10 max-w-md mx-auto text-center">
            <p className="text-gray-600 text-lg">Zatím nejsou k dispozici žádné chaty.</p>
          </div>
        )}

        {/* footers */}
        {viewer.authenticated && viewer.isRestrictedList && chatas.length > 0 && (
          <p className="text-center text-[13px] text-white/55 mt-7">
            Zobrazují se jen chaty, kde jste účastníkem. Chybí vám některá?{' '}
            <span className="text-white/85 font-semibold">Ozvěte se pokladníkovi.</span>
          </p>
        )}
        {!viewer.authenticated && chatas.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-8 bg-white/10 border border-white/20 backdrop-blur-md rounded-2xl px-6 py-4">
            <span className="text-white/85 text-sm text-center">
              Jste účastník? Po přihlášení uvidíte své finance a vyrovnání.
            </span>
            <Link
              href="/login"
              className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-[10px] px-5 py-2.5 shadow-[0_8px_20px_rgba(217,119,6,0.4)] transition-colors shrink-0"
            >
              Přihlásit se
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
