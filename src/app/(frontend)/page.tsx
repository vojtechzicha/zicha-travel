import { headers } from 'next/headers'
import { getPayload } from 'payload'
import type { Metadata } from 'next'
import config from '@/payload.config'
import { ChataSelector } from './components/ChataSelector'
import type { HomeChataItem, HomeViewer } from './components/ChataSelector'
import { ChataView } from './components/ChataView'
import { fetchChataBySlug } from './utils/fetchChata'
import {
  bucketChatas,
  chataYear,
  countdownLabel,
  daysUntil,
  formatDateRangeLong,
  formatDateRangeShort,
  formatMonthYear,
  greetingName,
  untilLabel,
  viewerBalance,
  viewerCost,
} from '@/lib/chataSelection'
import type { ChataStats } from '@/utils/calculateStats'
import type { Background, Chata, Icon, Media, Participant } from '@/payload-types'
import './styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const matchedSlug = headersList.get('x-matched-chata-slug')

  if (matchedSlug) {
    const chata = await fetchChataBySlug(matchedSlug)
    if (chata) {
      return {
        title: { absolute: chata.name },
        description: `${chata.name} - ${chata.location} - plánování, informace, finance`,
        openGraph: {
          title: chata.name,
          description: `Společně na chatu: ${chata.location}`,
        },
      }
    }
  }

  return {
    title: 'Vyberte chatu',
    description: 'Společně na chatu - plánování, informace, finance',
  }
}

type ChataWithStats = Chata & { _stats?: ChataStats }

function resolveCoverUrl(chata: Chata): string | null {
  if (chata.background && typeof chata.background === 'object') {
    const bg = chata.background as Background
    if (bg.type === 'url' && bg.url) return bg.url
    if (bg.image && typeof bg.image === 'object') {
      return (bg.image as Media).url || null
    }
  }
  return null
}

function resolveIconUrl(chata: Chata): string | null {
  if (chata.icon && typeof chata.icon === 'object') {
    const icon = chata.icon as Icon
    if (icon.svg && typeof icon.svg === 'object') {
      return (icon.svg as Media).url || null
    }
  }
  return null
}

export default async function HomePage() {
  const headersList = await headers()

  // Check if middleware set a matched chata slug
  const matchedSlug = headersList.get('x-matched-chata-slug')

  if (matchedSlug) {
    // SINGLE-CHATA MODE: Render chata directly, no switch allowed
    const chata = await fetchChataBySlug(matchedSlug)
    return <ChataView slug={matchedSlug} allowSwitch={false} initialThemeColor={chata?.themeColor} />
  }

  // MULTI-CHATA MODE: Show selector
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  // Depth 2 to include icon → svg and background → image (media) with URLs.
  // The Chatas afterRead hook also computes _stats for every doc here — the
  // per-chata settlement chips come from it for free.
  const chatasResult = await payload.find({
    collection: 'chatas',
    limit: 100,
    depth: 2,
  })

  let chatas = chatasResult.docs as ChataWithStats[]
  const { user } = await payload.auth({ headers: headersList })

  // All participants linked to this account (across chatas) — drives the
  // greeting, the "own chata" checks and the balance chips
  let linkedParticipants: Participant[] = []
  if (user) {
    const linked = await payload.find({
      collection: 'participants',
      where: { account: { equals: user.id } },
      limit: 1000,
      depth: 0,
    })
    linkedParticipants = linked.docs
  }
  const chataIdOf = (p: Participant) =>
    typeof p.chata === 'object' && p.chata !== null ? p.chata.id : p.chata
  const ownNamesByChata = new Map<number, string[]>()
  for (const p of linkedParticipants) {
    const id = chataIdOf(p)
    ownNamesByChata.set(id, [...(ownNamesByChata.get(id) ?? []), p.name])
  }

  // Signed-in accounts only get to pick chatas they're involved in: their
  // linked participants' chatas, plus (for admins) the chatas they manage.
  // Superadmins and anonymous visitors keep the full list.
  if (user && user.role !== 'superadmin') {
    const visible = new Set<number>(ownNamesByChata.keys())
    for (const assigned of user.assignedChatas ?? []) {
      visible.add(typeof assigned === 'object' && assigned !== null ? assigned.id : assigned)
    }
    chatas = chatas.filter((c) => visible.has(c.id))
  }

  const today = new Date()
  const buckets = bucketChatas(chatas, today)
  const ordered = [...buckets.live, ...buckets.upcoming, ...buckets.past]

  const items: HomeChataItem[] = ordered.map((chata) => {
    const status = buckets.live.includes(chata)
      ? 'live'
      : buckets.upcoming.includes(chata)
        ? 'upcoming'
        : 'past'
    const ownNames = ownNamesByChata.get(chata.id) ?? []
    const stats = chata._stats
    const allNames = stats ? Object.keys(stats.participants) : []
    // viewer's own participants first — they lead the avatar stack
    const participantNames = [
      ...allNames.filter((n) => ownNames.includes(n)),
      ...allNames.filter((n) => !ownNames.includes(n)),
    ]
    const from = chata.tripDateFrom ?? null
    const to = chata.tripDateTo ?? null
    const archiveDate = to ?? from

    return {
      id: chata.id,
      name: chata.name,
      slug: chata.slug,
      location: chata.location,
      themeColor: chata.themeColor || '#d97706',
      iconUrl: resolveIconUrl(chata),
      coverUrl: resolveCoverUrl(chata),
      status,
      countdown: status === 'upcoming' && from ? countdownLabel(daysUntil(from, today)) : null,
      untilLabel: status === 'live' && to ? untilLabel(to) : null,
      dateRangeLong: from ? formatDateRangeLong(from, to) : null,
      dateRangeShort: from ? formatDateRangeShort(from, to) : null,
      monthYear: archiveDate ? formatMonthYear(archiveDate) : null,
      year: chataYear(chata),
      participantNames,
      isOwn: ownNames.length > 0,
      viewerBalance: user ? viewerBalance(stats, ownNames) : null,
      viewerCost: user ? viewerCost(stats, ownNames) : null,
    }
  })

  const viewer: HomeViewer = user
    ? {
        authenticated: true,
        displayName: user.name?.trim() || user.email,
        greetingName: greetingName({
          userVokativ: user.vokativ,
          userName: user.name,
          participantVokativs: linkedParticipants.map((p) => p.vokativ),
          participantNames: linkedParticipants.map((p) => p.name),
        }),
        isRestrictedList: user.role !== 'superadmin',
      }
    : {
        authenticated: false,
        displayName: null,
        greetingName: null,
        isRestrictedList: false,
      }

  return <ChataSelector chatas={items} viewer={viewer} />
}
