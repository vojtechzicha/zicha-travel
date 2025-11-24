import { NextResponse } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'

/**
 * GET /api/chatas/:id/full
 * Returns complete chata data with statistics in format compatible with original JSON config
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const payload = await getPayload({ config })

    // Fetch chata with all related data
    const chata = await payload.findByID({
      collection: 'chatas',
      id,
      depth: 2, // Populate relationships
    })

    // Fetch participants
    const participantsResult = await payload.find({
      collection: 'participants',
      where: {
        chata: {
          equals: id,
        },
      },
      limit: 1000,
    })

    // Fetch expenses
    const expensesResult = await payload.find({
      collection: 'expenses',
      where: {
        chata: {
          equals: id,
        },
      },
      limit: 1000,
      depth: 1,
    })

    // Fetch prepayments
    const prepaymentsResult = await payload.find({
      collection: 'prepayments',
      where: {
        chata: {
          equals: id,
        },
      },
      limit: 1000,
      depth: 1,
    })

    // Get banker info
    const banker = typeof chata.banker === 'object' ? chata.banker : null

    // Transform to match original JSON structure
    const response = {
      name: chata.name,
      shortName: chata.shortName,
      location: chata.location,
      config: {
        banker: banker?.name || '',
        account: {
          number: chata.bankerAccountNumber || '',
          iban: chata.bankerIban || '',
        },
        contacts: {} as Record<string, { number: string; iban: string }>,
      },
      participants: participantsResult.docs.map((p) => p.name),
      expenses: expensesResult.docs.map((e) => {
        const payer = typeof e.payer === 'object' ? e.payer : null

        // Transform weights
        let weights: 'ALL' | Record<string, number> = 'ALL'
        if (e.splitType === 'weighted' && e.weights && e.weights.length > 0) {
          weights = {}
          e.weights.forEach((w) => {
            const participant = typeof w.participant === 'object' ? w.participant : null
            if (participant) {
              weights[participant.name] = w.weight
            }
          })
        }

        return {
          id: e.id,
          title: e.title,
          amount: e.amount,
          payer: payer?.name || '',
          weights,
        }
      }),
      prepayments: prepaymentsResult.docs.map((p) => {
        const from = typeof p.from === 'object' ? p.from : null
        return {
          from: from?.name || '',
          amount: p.amount,
          note: p.note || '',
        }
      }),
      information: chata.informationEnabled
        ? {
            enabled: true,
            dates: {
              from: chata.tripDateFrom || '',
              to: chata.tripDateTo || '',
            },
            destination: {
              name: chata.destinationName || '',
              location: chata.destinationLocation || '',
              description: chata.destinationDescription || '',
              links: (chata.destinationLinks || []).map((l) => ({
                title: l.title,
                url: l.url,
              })),
            },
            photos: (chata.photos || []).map((p) => {
              const photo = typeof p.photo === 'object' ? p.photo : null
              return photo?.url || ''
            }),
            basicInfo: (chata.basicInfo || []).map((i) => i.info),
            transportation: {
              car: (chata.carRoutes || []).map((r) => ({
                from: r.from,
                duration: r.duration,
                distance: r.distance,
                route: r.route,
              })),
              parking: chata.parking || '',
              publicTransport: (chata.publicTransportOptions || []).map((pt) => ({
                title: pt.title,
                connections: (pt.connections || []).map((c) => ({
                  type: c.type,
                  number: c.number,
                  from: c.from,
                  to: c.to,
                  departure: c.departure,
                  arrival: c.arrival,
                })),
                totalDuration: pt.totalDuration || '',
                notes: pt.notes || '',
              })),
            },
            bedrooms: (chata.bedrooms || []).map((br) => ({
              name: br.name,
              beds: (br.beds || []).map((b) => ({
                type: b.type,
                occupants: (b.occupants || [])
                  .map((o) => (typeof o === 'object' ? o.name : ''))
                  .filter((n) => n),
              })),
            })),
          }
        : { enabled: false },
    }

    // Build contacts map for participants with banking info
    participantsResult.docs.forEach((p) => {
      if (p.accountNumber && p.iban) {
        response.config.contacts[p.name] = {
          number: p.accountNumber,
          iban: p.iban,
        }
      }
    })

    // Add statistics if available
    const chataWithStats = chata as any
    if (chataWithStats._stats) {
      response['_stats'] = chataWithStats._stats
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching chata full data:', error)
    return NextResponse.json({ error: 'Failed to fetch chata data' }, { status: 500 })
  }
}
