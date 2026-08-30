import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { refId } from '@/lib/access'
import { verifyVoteConfirmToken } from '@/lib/pendingVotes'
import { setLoginEventCookie, setSessionCookie, signSessionToken } from '@/lib/auth/session'
import { RATE_LIMITS, checkRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { clientIp } from '@/lib/turnstile'
import { chataPagePath, claimVoteLink, confirmPendingVotesForUser } from '@/utils/pendingVotes'

/**
 * POST /api/trip-votes/confirm { token }
 *
 * The button on /votes/confirm. The signed token from the vote email is the
 * credential: it signs the account in (the click IS the email verification,
 * like a magic link) and turns the pending vote into a real one. A POST on
 * purpose — mail scanners prefetch GETs. Single-use and bound to one
 * submission: the first POST spends the link in one conditional UPDATE
 * (`linkUsedAt`), because a link that signs you in must not keep working
 * from a mailbox copy, and the token's `key` must match the row's current
 * `submissionKey`, so an email from an earlier submission cannot confirm
 * a later one. The vote itself never depends on the link.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = clientIp(request.headers)
  const ipCheck = checkRateLimit(`vote-confirm:ip:${ip}`, RATE_LIMITS.decidePerIp)
  if (!ipCheck.allowed) return rateLimitResponse(ipCheck) as NextResponse

  let token: unknown
  try {
    token = (await request.json())?.token
  } catch {
    token = undefined
  }
  const secret = process.env.PAYLOAD_SECRET
  if (typeof token !== 'string' || !secret) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const verified = verifyVoteConfirmToken(token, secret)
  if (!verified.ok) {
    return NextResponse.json({ error: verified.code }, { status: 400 })
  }

  const payload = await getPayload({ config })
  const [row, user] = await Promise.all([
    payload
      .findByID({
        collection: 'pending-votes',
        id: verified.pendingVoteId,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null),
    payload
      .findByID({ collection: 'users', id: verified.userId, depth: 0, overrideAccess: true })
      .catch(() => null),
  ])
  if (!row || !user || refId(row.user) !== String(user.id)) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  // Defense in depth: superadmins never sign in through an emailed link
  if (user.role === 'superadmin') {
    return NextResponse.json({ error: 'superadmin_oauth' }, { status: 403 })
  }
  const chata = await payload
    .findByID({
      collection: 'chatas',
      id: refId(row.chata),
      depth: 0,
      context: { triggerAfterRead: false },
    })
    .catch(() => null)
  if (!chata) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  // Spend the link before doing anything with it
  const refused = await claimVoteLink(payload, row, verified.key)
  if (refused) {
    return NextResponse.json({ error: refused }, { status: 410 })
  }

  // The click activates the account (lastLoginAt), which also locks the
  // linked participants away from anonymous visitors
  await payload.update({
    collection: 'users',
    id: user.id,
    data: { lastLoginAt: new Date().toISOString() },
    overrideAccess: true,
    depth: 0,
  })

  // The link IS the proof, so this row is recorded whatever its trust flag
  const summary = await confirmPendingVotesForUser(payload, user.id, { pendingVoteId: row.id })
  const stillPending = await payload
    .findByID({ collection: 'pending-votes', id: row.id, depth: 0, overrideAccess: true })
    .catch(() => null)
  const issue = stillPending?.status === 'pending' ? (stillPending.issue ?? null) : null

  const { token: sessionToken, maxAge } = signSessionToken(user)
  const response = NextResponse.json({
    ok: true,
    confirmed: summary.confirmed > 0 || stillPending?.status === 'confirmed',
    issue,
    redirectTo: chataPagePath(chata, request.headers.get('host')),
  })
  setSessionCookie(response, sessionToken, maxAge)
  setLoginEventCookie(response, 'magic-link')
  return response
}
