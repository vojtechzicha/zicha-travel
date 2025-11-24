import type { AfterReadHook } from 'payload'
import {
  calculateStats,
  transformExpense,
  transformPrepayment,
  transformParticipant,
} from '../../../utils/calculateStats'

/**
 * After read hook to calculate and append statistics to chata data
 */
export const afterReadHook: AfterReadHook = async ({ doc, req, context }) => {
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

    // Create a map of participant IDs to names for manual population
    const participantMap = new Map<string, string>()
    participantsResult.docs.forEach((p: any) => {
      participantMap.set(p.id, p.name)
    })

    // Get banker name
    let bankerName = ''
    if (typeof doc.banker === 'object' && doc.banker !== null) {
      bankerName = doc.banker.name
    } else if (typeof doc.banker === 'string') {
      // Look up banker name from our participant map
      bankerName = participantMap.get(doc.banker) || ''
    }

    // Transform data for calculation
    const participants = participantsResult.docs.map(transformParticipant)

    // Manually populate participant names in expenses and prepayments
    const expenses = expensesResult.docs.map((expense: any) => {
      const transformed = transformExpense(expense)
      // Replace payer ID with object containing name
      if (typeof transformed.payer === 'string') {
        transformed.payer = {
          id: transformed.payer,
          name: participantMap.get(transformed.payer) || transformed.payer,
        }
      }
      // Replace participant IDs in weights
      if (transformed.weights) {
        transformed.weights = transformed.weights.map((w: any) => ({
          ...w,
          participant: typeof w.participant === 'string'
            ? { id: w.participant, name: participantMap.get(w.participant) || w.participant }
            : w.participant,
        }))
      }
      return transformed
    })

    const prepayments = prepaymentsResult.docs.map((prepayment: any) => {
      const transformed = transformPrepayment(prepayment)
      // Replace from ID with object containing name
      if (typeof transformed.from === 'string') {
        transformed.from = {
          id: transformed.from,
          name: participantMap.get(transformed.from) || transformed.from,
        }
      }
      return transformed
    })

    // Calculate statistics
    const stats = calculateStats(participants, expenses, prepayments, bankerName)

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
