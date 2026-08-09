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
import { computeChataStats } from '@/utils/chataStatsBatch'
import { resolveChataIdentities } from '@/lib/chataIdentity'
import type { Chata, Participant } from '@/payload-types'
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

  // depth 0: the page needs two URLs off the appearance relationships
  // (icon → svg, background → image) and nothing else, so they are resolved
  // separately by resolveChataIdentities instead of making Payload walk every
  // relationship two levels deep. `triggerAfterRead: false` disables the
  // per-document stats hook, which would fire four queries for EVERY chata in
  // the list; the settlement chips come from one batched pass instead.
  const [chatasResult, { user }] = await Promise.all([
    payload.find({
      collection: 'chatas',
      limit: 100,
      depth: 0,
      context: { triggerAfterRead: false },
    }),
    payload.auth({ headers: headersList }),
  ])

  let chatas = chatasResult.docs as Chata[]

  // Appearance URLs, plus all participants linked to this account (across
  // chatas — they drive the greeting, the "own chata" checks and the balance
  // chips). The two are independent, so they share one round-trip.
  const [identities, linkedParticipants] = await Promise.all([
    resolveChataIdentities(payload, chatas),
    user
      ? payload
          .find({
            collection: 'participants',
            where: { account: { equals: user.id } },
            limit: 1000,
            depth: 0,
          })
          .then((r) => r.docs)
      : Promise.resolve([] as Participant[]),
  ])
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

  // One batched stats pass for the chatas that survived the visibility filter
  const statsByChata = await computeChataStats(
    payload,
    chatas.map((c) => ({ id: c.id, banker: c.banker }))
  )

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
    const stats = statsByChata.get(chata.id)
    const allNames = stats ? Object.keys(stats.participants) : []
    // viewer's own participants first — they lead the avatar stack
    const participantNames = [
      ...allNames.filter((n) => ownNames.includes(n)),
      ...allNames.filter((n) => !ownNames.includes(n)),
    ]
    const from = chata.tripDateFrom ?? null
    const to = chata.tripDateTo ?? null
    // either date may be missing independently — fall back to the other
    const rangeStart = from ?? to
    const rangeEnd = from ? to : null
    const archiveDate = to ?? from

    return {
      id: chata.id,
      name: chata.name,
      slug: chata.slug,
      location: chata.location,
      themeColor: chata.themeColor || '#d97706',
      iconUrl: identities.get(chata.id)?.iconUrl ?? null,
      coverUrl: identities.get(chata.id)?.coverUrl ?? null,
      status,
      countdown:
        status === 'upcoming' && rangeStart ? countdownLabel(daysUntil(rangeStart, today)) : null,
      untilLabel: status === 'live' && to ? untilLabel(to) : null,
      dateRangeLong: rangeStart ? formatDateRangeLong(rangeStart, rangeEnd) : null,
      dateRangeShort: rangeStart ? formatDateRangeShort(rangeStart, rangeEnd) : null,
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
