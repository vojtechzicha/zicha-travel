import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ChataView } from '../components/ChataView'

interface ChataPageProps {
  params: Promise<{
    chataSlug: string
  }>
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
