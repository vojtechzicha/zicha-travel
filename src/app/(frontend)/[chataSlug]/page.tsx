import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ChataView } from '../components/ChataView'
import { fetchChataBySlug } from '../utils/fetchChata'
import {
  isIndexableChataRender,
  NOINDEX_FOLLOW,
  type ChataRenderParams,
} from '@/lib/chataSeo'

interface ChataPageProps {
  params: Promise<{
    chataSlug: string
  }>
  searchParams: Promise<ChataRenderParams>
}

export async function generateMetadata({
  params,
  searchParams,
}: ChataPageProps): Promise<Metadata> {
  const [{ chataSlug }, query] = await Promise.all([params, searchParams])
  const [chata, t] = await Promise.all([fetchChataBySlug(chataSlug), getTranslations('chata.meta')])

  if (chata) {
    // Only the default (name-free) Informace render is indexable; the tab
    // views live behind ?view=/?participant= and carry noindex — see
    // src/lib/chataSeo.ts and compliance blocker 3.
    const indexable = isIndexableChataRender(query, chata.informationEnabled === true)
    return {
      title: chata.name,
      description: t('chataDescription', { name: chata.name, location: chata.location }),
      openGraph: {
        title: `${chata.name} | zicha.travel`,
        description: t('ogDescription', { location: chata.location }),
      },
      ...(indexable ? {} : { robots: NOINDEX_FOLLOW }),
    }
  }

  return {
    title: t('notFoundTitle'),
    robots: NOINDEX_FOLLOW,
  }
}

export default async function ChataPage({ params }: ChataPageProps) {
  const headersList = await headers()
  const matchedSlug = headersList.get('x-matched-chata-slug')

  // If we're in single-chata mode, redirect to home
  // (middleware should have already done this, but this is a safety fallback)
  if (matchedSlug) {
    redirect('/')
  }

  const { chataSlug } = await params

  // Fetch chata to get theme color for skeleton
  const chata = await fetchChataBySlug(chataSlug)

  // Multi-chata mode: render with switch capability
  return <ChataView slug={chataSlug} allowSwitch={true} initialThemeColor={chata?.themeColor} />
}
