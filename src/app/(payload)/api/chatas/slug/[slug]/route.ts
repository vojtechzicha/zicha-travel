import { NextResponse } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import {
  calculateStats,
  transformExpense,
  transformPrepayment,
  transformParticipant,
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

    // Find chata by slug
    const chatasResult = await payload.find({
      collection: 'chatas',
      where: {
        slug: {
          equals: slug,
        },
      },
      limit: 1,
      depth: 1,
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

    // Create participant map for name lookup
    const participantMap = new Map<string, string>()
    participantsResult.docs.forEach((p: any) => {
      participantMap.set(p.id, p.name)
    })

    // Get banker name
    let bankerName = ''
    if (typeof chata.banker === 'object' && chata.banker !== null) {
      bankerName = chata.banker.name
    } else if (typeof chata.banker === 'string') {
      bankerName = participantMap.get(chata.banker) || ''
    }

    // Transform data for calculation
    const participants = participantsResult.docs.map(transformParticipant)

    // Manually populate participant names in expenses
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

    // Return data with populated relationships for frontend
    return NextResponse.json({
      chata,
      participants: participantsResult.docs,
      expenses: expensesResult.docs.map((expense: any) => ({
        ...expense,
        payer: typeof expense.payer === 'string'
          ? participantsResult.docs.find((p) => p.id === expense.payer)
          : expense.payer,
        weights: expense.weights?.map((w: any) => ({
          ...w,
          participant: typeof w.participant === 'string'
            ? participantsResult.docs.find((p) => p.id === w.participant)
            : w.participant,
        })),
      })),
      prepayments: prepaymentsResult.docs.map((prepayment: any) => ({
        ...prepayment,
        from: typeof prepayment.from === 'string'
          ? participantsResult.docs.find((p) => p.id === prepayment.from)
          : prepayment.from,
      })),
      stats,
    })
  } catch (error) {
    console.error('Error looking up chata by slug:', error)
    return NextResponse.json({ error: 'Failed to lookup chata' }, { status: 500 })
  }
}
