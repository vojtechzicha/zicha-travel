import { NextResponse } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'

/**
 * GET /api/chatas/slug/:slug
 * Looks up a chata by its slug and redirects to the full data endpoint
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

    return NextResponse.json(
      {
        found: false,
        message: 'No chata found with this slug',
      },
      { status: 404 }
    )
  } catch (error) {
    console.error('Error looking up chata by slug:', error)
    return NextResponse.json({ error: 'Failed to lookup chata' }, { status: 500 })
  }
}
