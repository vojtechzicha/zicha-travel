import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import { getTranslations } from 'next-intl/server'
import config from '@/payload.config'
import { refId } from '@/lib/access'
import { verifyVoteConfirmToken } from '@/lib/pendingVotes'
import { describeVoteSelection } from '@/lib/planning'
import { chataPagePath } from '@/utils/pendingVotes'
import { GlassCard } from '../../components/GlassCard'
import { ConfirmVoteCard, ConfirmVoteSignIn } from '../../components/ConfirmVoteCard'
import '../../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('planning')
  return {
    title: t('confirm.metaTitle'),
    description: t('confirm.metaDescription'),
    // Signed-link page — never index
    robots: { index: false, follow: false },
  }
}

// "Potvrď svůj hlas" (docs/PRD-planovani.md, "Nepotvrzené hlasy"): the voter
// lands here from the vote email. The signed token in the URL is the
// credential; the confirmation itself (which also signs them in) is a POST
// from the client card — a mutating GET would be triggered by mail-scanner
// link prefetches, which is how votes used to get lost.
export default async function ConfirmVotePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const t = await getTranslations('planning')
  const host = (await headers()).get('host')

  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
      <div className="relative z-10 max-w-app mx-auto px-5 py-10 flex items-center justify-center min-h-screen">
        {content}
      </div>
    </div>
  )

  const message = (title: string, body: string, extra?: React.ReactNode) =>
    shell(
      <GlassCard padding="large" className="w-full max-w-md text-center">
        <h1 className="font-serif text-2xl font-bold text-gray-900 mb-3">{title}</h1>
        <p className="text-gray-600">{body}</p>
        {extra}
      </GlassCard>,
    )

  const secret = process.env.PAYLOAD_SECRET
  if (!token || !secret) {
    return message(t('confirm.invalidTitle'), t('confirm.invalidBody'), <ConfirmVoteSignIn />)
  }
  const verified = verifyVoteConfirmToken(token, secret)
  if (!verified.ok) {
    // An expired link is the common case worth a real answer: the vote is
    // still filed, any sign-in records it
    return verified.code === 'expired'
      ? message(t('confirm.expiredTitle'), t('confirm.expiredBody'), <ConfirmVoteSignIn />)
      : message(t('confirm.invalidTitle'), t('confirm.invalidBody'), <ConfirmVoteSignIn />)
  }

  const payload = await getPayload({ config: await config })
  const row = await payload
    .findByID({
      collection: 'pending-votes',
      id: verified.pendingVoteId,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)
  if (!row || refId(row.user) !== String(verified.userId)) {
    return message(t('confirm.goneTitle'), t('confirm.goneBody'))
  }
  const chata = await payload
    .findByID({
      collection: 'chatas',
      id: refId(row.chata),
      depth: 0,
      context: { triggerAfterRead: false },
    })
    .catch(() => null)
  if (!chata) {
    return message(t('confirm.goneTitle'), t('confirm.goneBody'))
  }
  const pagePath = chataPagePath(chata, host)

  // A spent link is not a lost vote (any sign-in records it); say so and
  // point at the page rather than signing anyone in again
  if (row.linkUsedAt) {
    return message(t('confirm.usedTitle'), t('confirm.usedBody'), <ConfirmVoteSignIn />)
  }
  if (row.status === 'confirmed') {
    return message(
      t('confirm.doneTitle'),
      t('confirm.doneBody'),
      <a
        href={pagePath}
        className="inline-block mt-5 bg-primary hover:bg-primary-dark text-white font-semibold px-6 py-3 rounded-xl transition-colors"
      >
        {t('confirm.open')}
      </a>,
    )
  }

  const [dateOptions, accommodations] = await Promise.all([
    payload.find({
      collection: 'trip-date-options',
      where: { chata: { equals: chata.id } },
      sort: 'dateFrom',
      limit: 100,
      depth: 0,
    }),
    payload.find({
      collection: 'trip-accommodation-options',
      where: { chata: { equals: chata.id } },
      limit: 100,
      depth: 0,
    }),
  ])
  const summary = describeVoteSelection(
    {
      dateOptionIds: (row.dates || []).map((ref) => Number(refId(ref))),
      accommodationOptionIds: (row.accommodations || []).map((ref) => Number(refId(ref))),
    },
    dateOptions.docs.map((d) => ({ id: d.id, label: d.label ?? '' })),
    accommodations.docs.map((a) => ({ id: a.id, name: a.name })),
  )

  return shell(
    <ConfirmVoteCard
      token={token}
      voterName={row.name}
      chataName={chata.name}
      dates={summary.dates}
      places={summary.places}
      pagePath={pagePath}
    />,
  )
}
