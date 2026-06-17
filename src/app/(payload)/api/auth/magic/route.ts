import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { signSessionToken, sessionCookieOptions, PAYLOAD_TOKEN_COOKIE } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

/**
 * Magic-link login. The token is the participant's `inviteToken`.
 * On first use it creates (or links) an Account for the participant, then
 * issues a session and redirects to that chata's finance view.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const origin = request.nextUrl.origin

  if (!token) {
    return NextResponse.redirect(new URL('/?login=invalid', origin))
  }

  try {
    const payload = await getPayload({ config })

    const participants = await payload.find({
      collection: 'participants',
      where: { inviteToken: { equals: token } },
      limit: 1,
      depth: 0,
    })
    const participant = participants.docs[0]
    if (!participant) {
      return NextResponse.redirect(new URL('/?login=invalid', origin))
    }

    // Resolve the linked account, creating one on first login.
    let accountId = participant.account
    if (!accountId) {
      const account = await payload.create({
        collection: 'accounts',
        data: { name: participant.name },
      })
      accountId = account.id
      await payload.update({
        collection: 'participants',
        id: participant.id,
        data: { account: account.id },
      })
    }

    // Resolve the chata slug to redirect back to.
    const chataId = participant.chata
    let slug = ''
    if (chataId) {
      const chata = await payload.findByID({ collection: 'chatas', id: chataId as number, depth: 0 })
      slug = (chata?.slug as string) || ''
    }
    const redirectPath = slug ? `/${slug}?view=finance` : '/'

    const sessionToken = signSessionToken({ id: accountId as number, collection: 'accounts' })
    const res = NextResponse.redirect(new URL(redirectPath, origin))
    res.cookies.set(PAYLOAD_TOKEN_COOKIE, sessionToken, sessionCookieOptions())
    return res
  } catch (err) {
    console.error('Magic link error:', err)
    return NextResponse.redirect(new URL('/?login=error', origin))
  }
}
