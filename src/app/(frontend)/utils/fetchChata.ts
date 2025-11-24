import { getPayload } from 'payload'
import config from '@/payload.config'
import type { Chata } from '@/payload-types'

export async function fetchChataBySlug(slug: string): Promise<Chata | null> {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const result = await payload.find({
    collection: 'chatas',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })

  return result.docs[0] || null
}
