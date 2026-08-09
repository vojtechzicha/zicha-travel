import type { CollectionAfterReadHook } from 'payload'
import type { Chata } from '../../../payload-types'
import { computeChataStats } from '../../../utils/chataStatsBatch'

/**
 * After read hook to calculate and append statistics to chata data
 *
 * The actual maths lives in `computeChataStats`, which fetches the four
 * related collections in parallel. Callers that read MANY chatas at once
 * (the homepage) should skip this hook via `context.triggerAfterRead === false`
 * and call `computeChataStats` with all the ids instead — otherwise every
 * document pays its own set of round-trips.
 */
export const afterReadHook: CollectionAfterReadHook<Chata> = async ({ doc, req, context }) => {
  try {
    // Skip expensive calculations for list views
    // Only run on single document reads (viewing/editing a specific chata)
    // Check if this is being called from a 'find' operation (list view)
    if (context?.triggerAfterRead === false) {
      return doc
    }

    const stats = await computeChataStats(req.payload, [{ id: doc.id, banker: doc.banker }])

    return {
      ...doc,
      _stats: stats.get(doc.id),
    }
  } catch (error) {
    // If calculation fails, return doc without stats
    console.error('Error calculating chata statistics:', error)
    return doc
  }
}
