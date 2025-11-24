import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ChataView } from '../components/ChataView'
import { fetchChataBySlug } from '../utils/fetchChata'

interface ChataPageProps {
  params: Promise<{
    chataSlug: string
  }>
}

export async function generateMetadata({ params }: ChataPageProps): Promise<Metadata> {
  const { chataSlug } = await params
  const chata = await fetchChataBySlug(chataSlug)

  if (chata) {
    return {
      title: chata.name,
      description: `${chata.name} - ${chata.location} - plánování, informace, finance`,
      openGraph: {
        title: `${chata.name} | Aplikace Chata`,
        description: `Společně na chatu: ${chata.location}`,
      },
    }
  }

  return {
    title: 'Chata nenalezena',
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

  // Multi-chata mode: render with switch capability
  return <ChataView slug={chataSlug} allowSwitch={true} />
}
