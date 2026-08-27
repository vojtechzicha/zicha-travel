import type { Payload } from 'payload'
import type { Background, Chata, Icon, Media } from '@/payload-types'
import type { ImageAttribution } from './attribution'

export interface ChataIdentity {
  /** URL of the chata's icon SVG, if it has one */
  iconUrl: string | null
  /** URL of the chata's cover photo (external URL or uploaded image) */
  coverUrl: string | null
  /** Credit owed for that cover, for licences that require one */
  coverAttribution: ImageAttribution | null
}

const refId = (ref: unknown): number | null => {
  if (typeof ref === 'number') return ref
  if (typeof ref === 'object' && ref !== null) {
    const id = (ref as { id?: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

const mediaUrl = (ref: unknown): string | null =>
  typeof ref === 'object' && ref !== null ? (ref as Media).url || null : null

/**
 * Resolves icon + cover URLs for a list of chatas read at `depth: 0`.
 *
 * The homepage used to read chatas at `depth: 2` purely to reach
 * `icon → svg → url` and `background → image → url`. That populates EVERY
 * relationship two levels deep — banker, bedroom occupants, car passengers,
 * domains — which is a dozen or so sequential queries for two URLs per chata.
 * Here the two appearance collections are fetched once each (at depth 1, so
 * Payload resolves the media rows) for all chatas together.
 */
export async function resolveChataIdentities(
  payload: Payload,
  chatas: Chata[]
): Promise<Map<number, ChataIdentity>> {
  const iconIds = [...new Set(chatas.map((c) => refId(c.icon)).filter((id): id is number => id !== null))]
  const bgIds = [
    ...new Set(chatas.map((c) => refId(c.background)).filter((id): id is number => id !== null)),
  ]

  const empty = { docs: [] as never[] }
  const [iconsResult, backgroundsResult] = await Promise.all([
    iconIds.length
      ? payload.find({
          collection: 'icons',
          where: { id: { in: iconIds } },
          depth: 1,
          limit: 0,
          pagination: false,
        })
      : empty,
    bgIds.length
      ? payload.find({
          collection: 'backgrounds',
          where: { id: { in: bgIds } },
          depth: 1,
          limit: 0,
          pagination: false,
        })
      : empty,
  ])

  const icons = new Map<number, Icon>((iconsResult.docs as Icon[]).map((i) => [i.id, i]))
  const backgrounds = new Map<number, Background>(
    (backgroundsResult.docs as Background[]).map((b) => [b.id, b])
  )

  const result = new Map<number, ChataIdentity>()
  for (const chata of chatas) {
    const icon = icons.get(refId(chata.icon) ?? -1)
    const background = backgrounds.get(refId(chata.background) ?? -1)

    let coverUrl: string | null = null
    let coverAttribution: ImageAttribution | null = null
    if (background) {
      coverUrl =
        background.type === 'url' && background.url ? background.url : mediaUrl(background.image)
      if (background.attribution) {
        coverAttribution = { text: background.attribution, url: background.attributionUrl }
      }
    }

    result.set(chata.id, {
      iconUrl: icon ? mediaUrl(icon.svg) : null,
      coverUrl,
      coverAttribution,
    })
  }

  return result
}
