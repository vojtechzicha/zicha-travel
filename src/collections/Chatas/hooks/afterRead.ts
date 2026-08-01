import type { CollectionAfterReadHook } from 'payload'
import type { Chata } from '../../../payload-types'
import {
  calculateStats,
  transformExpense,
  transformPrepayment,
  transformParticipant,
  transformJointAccount,
  normalizePayerRef,
} from '../../../utils/calculateStats'

/**
 * After read hook to calculate and append statistics to chata data
 */
export const afterReadHook: CollectionAfterReadHook<Chata> = async ({ doc, req, context }) => {
  try {
    // Skip expensive calculations for list views
    // Only run on single document reads (viewing/editing a specific chata)
    // Check if this is being called from a 'find' operation (list view)
    if (context?.triggerAfterRead === false) {
      return doc
    }

    const { payload } = req

    // Fetch all participants for this chata
    const participantsResult = await payload.find({
      collection: 'participants',
      where: {
        chata: {
          equals: doc.id,
        },
      },
      limit: 1000, // Reasonable limit for a single trip
      depth: 0, // Avoid circular dependencies
    })

    // Fetch all expenses for this chata
    const expensesResult = await payload.find({
      collection: 'expenses',
      where: {
        chata: {
          equals: doc.id,
        },
      },
      limit: 1000,
      depth: 0, // Avoid circular dependencies - we'll map names manually
    })

    // Fetch all prepayments for this chata
    const prepaymentsResult = await payload.find({
      collection: 'prepayments',
      where: {
        chata: {
          equals: doc.id,
        },
      },
      limit: 1000,
      depth: 0, // Avoid circular dependencies - we'll map names manually
    })

    // Fetch all joint accounts ("společný účet") for this chata
    const jointAccountsResult = await payload.find({
      collection: 'joint-accounts',
      where: {
        chata: {
          equals: doc.id,
        },
      },
      limit: 1000,
      depth: 0, // Avoid circular dependencies - we'll map names manually
    })

    // Create a map of participant IDs to names for manual population
    const participantMap = new Map<string, string>()
    participantsResult.docs.forEach((p: any) => {
      participantMap.set(String(p.id), p.name)
    })

    const jointAccounts = jointAccountsResult.docs.map((ja: any) =>
      transformJointAccount(ja, participantMap)
    )
    const jointAccountMap = new Map(jointAccounts.map((ja) => [String(ja.id), ja]))

    // Get banker name
    let bankerName = ''
    if (typeof doc.banker === 'object' && doc.banker !== null) {
      bankerName = doc.banker.name
    } else if (doc.banker !== null && doc.banker !== undefined) {
      // Look up banker name from our participant map
      bankerName = participantMap.get(String(doc.banker)) || ''
    }

    // Transform data for calculation
    const participants = participantsResult.docs.map(transformParticipant)

    // Manually populate payer/participant names in expenses and prepayments
    // (payer/from are polymorphic: participant or joint account)
    const expenses = expensesResult.docs.map((expense: any) => {
      const transformed = transformExpense(expense)
      transformed.payer = normalizePayerRef(transformed.payer, participantMap, jointAccountMap)
      // Replace participant IDs in weights
      if (transformed.weights) {
        transformed.weights = transformed.weights.map((w: any) => ({
          ...w,
          participant:
            typeof w.participant === 'object' && w.participant !== null
              ? w.participant
              : {
                  id: w.participant,
                  name: participantMap.get(String(w.participant)) || String(w.participant),
                },
        }))
      }
      return transformed
    })

    const prepayments = prepaymentsResult.docs.map((prepayment: any) => {
      const transformed = transformPrepayment(prepayment)
      transformed.from = normalizePayerRef(transformed.from, participantMap, jointAccountMap)
      return transformed
    })

    // Calculate statistics
    const stats = calculateStats(participants, expenses, prepayments, bankerName, jointAccounts)

    // Append statistics to the document
    return {
      ...doc,
      _stats: stats,
    }
  } catch (error) {
    // If calculation fails, return doc without stats
    console.error('Error calculating chata statistics:', error)
    return doc
  }
}
