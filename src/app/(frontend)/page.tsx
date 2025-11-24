import { getPayload } from 'payload'
import config from '@/payload.config'
import { ChataSelector } from './components/ChataSelector'
import './styles.css'

export default async function HomePage() {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  // Fetch all chatas
  const chatasResult = await payload.find({
    collection: 'chatas',
    limit: 100,
    depth: 0,
  })

  return <ChataSelector chatas={chatasResult.docs} />
}
