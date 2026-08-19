import type { CollectionAfterReadHook } from 'payload'
import type { Chata } from '../../../payload-types'
import { computeChataStats } from '../../../utils/chataStatsBatch'
import { canManageChata, refId } from '../../../lib/access'
import { scrubLockedStats } from '../../../lib/privacyScrub'
import { findLockedParticipants } from '../../../utils/participantPrivacy'

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
    const chataStats = stats.get(doc.id)

    // Locked participants' balances and breakdowns are withheld from
    // everyone but this chata's admins (compliance blocker 1) — the REST
    // chata read is public, so the scrub has to happen here, not in the UI.
    if (chataStats && !canManageChata(req?.user, doc.id)) {
      const participantsResult = await req.payload.find({
        collection: 'participants',
        where: { chata: { equals: doc.id } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      const locked = await findLockedParticipants(req.payload, participantsResult.docs)
      const viewerId = req?.user ? String(req.user.id) : null
      const ownIds = viewerId
        ? new Set(
            participantsResult.docs
              .filter((p) => p.account != null && refId(p.account) === viewerId)
              .map((p) => String(p.id)),
          )
        : new Set<string>()
      scrubLockedStats(
        chataStats,
        locked.filter((l) => !ownIds.has(String(l.id))).map((l) => l.name),
      )
    }

    return {
      ...doc,
      _stats: chataStats,
    }
  } catch (error) {
    // If calculation fails, return doc without stats
    console.error('Error calculating chata statistics:', error)
    return doc
  }
}
