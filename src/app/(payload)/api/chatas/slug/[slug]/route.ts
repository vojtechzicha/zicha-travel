import { NextResponse } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import {
  calculateStats,
  transformExpense,
  transformPrepayment,
  transformParticipant,
  transformJointAccount,
  normalizePayerRef,
} from '@/utils/calculateStats'

/**
 * GET /api/chatas/slug/:slug
 * Returns complete chata data with all related collections and statistics
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  try {
    const { slug } = await params
    const payload = await getPayload({ config })

    // Find chata by slug (depth: 2 to include background/icon with their nested media)
    const chatasResult = await payload.find({
      collection: 'chatas',
      where: {
        slug: {
          equals: slug,
        },
      },
      limit: 1,
      depth: 2,
    })

    if (chatasResult.docs.length === 0) {
      return NextResponse.json(
        {
          error: 'No chata found with this slug',
        },
        { status: 404 }
      )
    }

    const chata = chatasResult.docs[0]

    // Fetch all participants for this chata
    const participantsResult = await payload.find({
      collection: 'participants',
      where: {
        chata: {
          equals: chata.id,
        },
      },
      limit: 1000,
      depth: 0,
    })

    // Fetch all expenses for this chata (depth: 1 to get weights array)
    const expensesResult = await payload.find({
      collection: 'expenses',
      where: {
        chata: {
          equals: chata.id,
        },
      },
      limit: 1000,
      depth: 1, // Need depth 1 to get weights array
    })

    // Fetch all prepayments for this chata (depth: 1 to get from relationship)
    const prepaymentsResult = await payload.find({
      collection: 'prepayments',
      where: {
        chata: {
          equals: chata.id,
        },
      },
      limit: 1000,
      depth: 1,
    })

    // Fetch all joint accounts ("společný účet") for this chata
    const jointAccountsResult = await payload.find({
      collection: 'joint-accounts',
      where: {
        chata: {
          equals: chata.id,
        },
      },
      limit: 1000,
      depth: 0,
    })

    // Create participant map for name lookup
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
    if (typeof chata.banker === 'object' && chata.banker !== null) {
      bankerName = chata.banker.name
    } else if (chata.banker !== null && chata.banker !== undefined) {
      bankerName = participantMap.get(String(chata.banker)) || ''
    }

    // Transform data for calculation
    const participants = participantsResult.docs.map(transformParticipant)

    // Normalize polymorphic payer/from refs (participant or joint account)
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

    // Return data with populated relationships for frontend
    // (payer/from arrive populated via depth: 1 as { relationTo, value })
    return NextResponse.json({
      chata,
      participants: participantsResult.docs,
      expenses: expensesResult.docs,
      prepayments: prepaymentsResult.docs,
      jointAccounts: jointAccountsResult.docs,
      stats,
    })
  } catch (error) {
    console.error('Error looking up chata by slug:', error)
    return NextResponse.json({ error: 'Failed to lookup chata' }, { status: 500 })
  }
}
