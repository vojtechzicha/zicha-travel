import { NextResponse } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'

/**
 * GET /api/domains/:hostname
 * Resolves a domain name to a chata configuration
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ hostname: string }> }
): Promise<NextResponse> {
  try {
    const { hostname } = await params
    const payload = await getPayload({ config })

    // Find chata with matching domain
    const chatasResult = await payload.find({
      collection: 'chatas',
      where: {
        'domains.domain': {
          equals: hostname,
        },
      },
      limit: 1,
    })

    if (chatasResult.docs.length > 0) {
      const chata = chatasResult.docs[0]
      return NextResponse.json({
        found: true,
        chata: {
          id: chata.id,
          name: chata.name,
          slug: chata.slug,
          location: chata.location,
        },
      })
    }

    // If not found, check for default chata in domain-mappings global
    try {
      const domainMappings = await payload.findGlobal({
        slug: 'domain-mappings',
      })

      if (domainMappings?.defaultChata) {
        const defaultChata =
          typeof domainMappings.defaultChata === 'object' ? domainMappings.defaultChata : null

        if (defaultChata) {
          return NextResponse.json({
            found: true,
            isDefault: true,
            chata: {
              id: defaultChata.id,
              name: defaultChata.name,
              slug: defaultChata.slug,
              location: defaultChata.location,
            },
          })
        }
      }
    } catch (error) {
      // Domain mappings global might not exist yet
      console.warn('Domain mappings global not found:', error)
    }

    // No matching domain or default
    return NextResponse.json({
      found: false,
      message: 'No chata found for this domain',
    })
  } catch (error) {
    console.error('Error resolving domain:', error)
    return NextResponse.json({ error: 'Failed to resolve domain' }, { status: 500 })
  }
}
