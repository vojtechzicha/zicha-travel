import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { ChataSelector } from './components/ChataSelector'
import { ChataView } from './components/ChataView'
import './styles.css'

export default async function HomePage() {
  const headersList = await headers()

  // Check if middleware set a matched chata slug
  const matchedSlug = headersList.get('x-matched-chata-slug')

  if (matchedSlug) {
    // SINGLE-CHATA MODE: Render chata directly, no switch allowed
    return <ChataView slug={matchedSlug} allowSwitch={false} />
  }

  // MULTI-CHATA MODE: Show selector
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const chatasResult = await payload.find({
    collection: 'chatas',
    limit: 100,
    depth: 0,
  })

  return <ChataSelector chatas={chatasResult.docs} />
}
