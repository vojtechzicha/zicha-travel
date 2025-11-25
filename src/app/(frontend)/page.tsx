import { headers } from 'next/headers'
import { getPayload } from 'payload'
import type { Metadata } from 'next'
import config from '@/payload.config'
import { ChataSelector } from './components/ChataSelector'
import { ChataView } from './components/ChataView'
import { fetchChataBySlug } from './utils/fetchChata'
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

  // Depth 2 to include icon → svg (media) with URL
  const chatasResult = await payload.find({
    collection: 'chatas',
    limit: 100,
    depth: 2,
  })

  return <ChataSelector chatas={chatasResult.docs} />
}
