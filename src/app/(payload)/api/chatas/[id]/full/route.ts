import { NextResponse } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import { resolveBankAccount } from '@/utils/czechBankAccount'

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

    // Fetch expenses. This export is anonymous, so expenses still waiting
    // for approval ("výdaj za jiného plátce") never appear here — and
    // private expenses ("soukromý výdaj") never do either.
    const expensesResult = await payload.find({
      collection: 'expenses',
      where: {
        and: [
          { chata: { equals: id } },
          {
            or: [
              { approvalStatus: { equals: 'approved' } },
              { approvalStatus: { exists: false } },
            ],
          },
          { isPrivate: { not_equals: true } },
        ],
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

    // Get banker info. Banking lives on the banker participant — derive the
    // missing half of the account/IBAN pair the way the frontend does.
    const banker = typeof chata.banker === 'object' ? chata.banker : null
    const bankerAccount = banker ? resolveBankAccount(banker.accountNumber, banker.iban) : null

    // Unwrap a populated polymorphic payer/from ({ relationTo, value }) to
    // the referenced doc's name (participant or joint account)
    const getRefName = (ref: unknown): string => {
      if (typeof ref !== 'object' || ref === null) return ''
      if ('relationTo' in ref) {
        const value = (ref as { relationTo: string; value?: unknown }).value
        return typeof value === 'object' && value !== null
          ? ((value as { name?: string }).name ?? '')
          : ''
      }
      return (ref as { name?: string }).name ?? ''
    }

    // Transform to match original JSON structure
    const response = {
      name: chata.name,
      shortName: chata.shortName,
      location: chata.location,
      config: {
        banker: banker?.name || '',
        account: {
          number: bankerAccount?.accountNumber || '',
          iban: bankerAccount?.iban || '',
        },
        contacts: {} as Record<string, { number: string; iban: string }>,
      },
      participants: participantsResult.docs.map((p) => p.name),
      expenses: expensesResult.docs.map((e) => {
        // Transform weights
        let weights: 'ALL' | Record<string, number> = 'ALL'
        if (e.splitType === 'weighted' && e.weights && e.weights.length > 0) {
          const weightMap: Record<string, number> = {}
          e.weights.forEach((w) => {
            const participant = typeof w.participant === 'object' ? w.participant : null
            if (participant) {
              weightMap[participant.name] = w.weight
            }
          })
          weights = weightMap
        }

        return {
          id: e.id,
          title: e.title,
          amount: e.amount,
          payer: getRefName(e.payer),
          weights,
        }
      }),
      prepayments: prepaymentsResult.docs.map((p) => {
        return {
          from: getRefName(p.from),
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
            rooms: (chata.rooms || []).map((room) => ({
              name: room.name,
              description: room.description || '',
              maxSleepingSpaces: room.maxSleepingSpaces,
              beds: (room.beds || []).map((bed) => ({
                name: bed.name,
                occupants: (bed.occupants || []).map((occ) => ({
                  name: typeof occ.participant === 'object' ? occ.participant.name : '',
                  nights: occ.nights || null,
                })).filter((o) => o.name),
              })),
            })),
          }
        : { enabled: false },
    }

    // Contacts: this export is anonymous, so only the banker's own account
    // may appear (compliance blocker 1 — non-banker bank fields are not
    // public). The banker's details are already in config.account; the map
    // repeats them under their name for legacy-format compatibility.
    if (banker?.name && bankerAccount?.accountNumber && bankerAccount?.iban) {
      response.config.contacts[banker.name] = {
        number: bankerAccount.accountNumber,
        iban: bankerAccount.iban,
      }
    }

    // Add statistics if available
    const chataWithStats = chata as { _stats?: unknown }
    if (chataWithStats._stats) {
      return NextResponse.json({ ...response, _stats: chataWithStats._stats })
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching chata full data:', error)
    return NextResponse.json({ error: 'Failed to fetch chata data' }, { status: 500 })
  }
}
