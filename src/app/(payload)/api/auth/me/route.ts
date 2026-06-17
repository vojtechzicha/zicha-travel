import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { getSessionFromHeaders } from '@/lib/auth/session'
import { configuredProviders } from '@/lib/auth/config'
import type { Identity } from '@/lib/auth/identity'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const providers = configuredProviders()
  const session = getSessionFromHeaders(request.headers)
  if (!session) {
    return NextResponse.json({ type: 'none', providers } satisfies Identity)
  }

  const slug = request.nextUrl.searchParams.get('slug') || ''
  const payload = await getPayload({ config })

  // Resolve chata id from slug (needed for participant + manage checks).
  let chataId: number | null = null
  let assignedUserIds: string[] = []
  if (slug) {
    const chatas = await payload.find({
      collection: 'chatas',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      context: { triggerAfterRead: false },
    })
    const chata = chatas.docs[0]
    if (chata) {
      chataId = chata.id as number
      assignedUserIds = ((chata.assignedUsers || []) as { user?: number | string }[])
        .map((a) => (a.user != null ? String(a.user) : ''))
        .filter(Boolean)
    }
  }

  try {
    if (session.collection === 'users') {
      const user = await payload.findByID({ collection: 'users', id: session.id, depth: 0 })
      const canManage =
        user.role === 'admin' || assignedUserIds.includes(String(user.id))
      return NextResponse.json({
        type: 'admin',
        providers,
        name: user.email,
        email: user.email,
        canManage,
      } satisfies Identity)
    }

    // Account (participant) session
    const account = await payload.findByID({ collection: 'accounts', id: session.id, depth: 0 })
    const emails = ((account.emails || []) as { email: string }[]).map((e) => e.email)

    if (chataId != null) {
      const participants = await payload.find({
        collection: 'participants',
        where: { and: [{ account: { equals: account.id } }, { chata: { equals: chataId } }] },
        limit: 1,
        depth: 0,
      })
      const participant = participants.docs[0]
      if (participant) {
        return NextResponse.json({
          type: 'participant',
          providers,
          accountName: account.name ?? undefined,
          emails,
          participant: { id: participant.id as number, name: participant.name },
        } satisfies Identity)
      }
    }

    return NextResponse.json({
      type: 'participant-unlinked',
      providers,
      accountName: account.name ?? undefined,
      emails,
    } satisfies Identity)
  } catch (err) {
    console.error('me error:', err)
    return NextResponse.json({ type: 'none', providers } satisfies Identity)
  }
}
