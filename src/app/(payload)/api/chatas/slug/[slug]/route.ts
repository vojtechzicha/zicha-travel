import { NextResponse } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import { canManageChata, refId } from '@/lib/access'
import { maskEmail, type FinanceViewer, type LockedParticipant } from '@/lib/financeAccess'
import { isCountedExpense, normalizePayer, payerAccountIds } from '@/lib/expenseAuthoring'
import type { ViewerClaim } from '@/lib/claimRequests'
import {
  calculateStats,
  transformExpense,
  transformPrepayment,
  transformParticipant,
  transformJointAccount,
  normalizePayerRef,
  populateExpenseParticipants,
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
      // Replace participant IDs in weights and invitations
      return populateExpenseParticipants(transformed, participantMap)
    })

    const prepayments = prepaymentsResult.docs.map((prepayment: any) => {
      const transformed = transformPrepayment(prepayment)
      transformed.from = normalizePayerRef(transformed.from, participantMap, jointAccountMap)
      return transformed
    })

    // Calculate statistics (calculateStats itself drops expenses waiting for
    // approval — see docs/PRD-vydaj-za-jineho.md)
    const stats = calculateStats(participants, expenses, prepayments, bankerName, jointAccounts)

    // Who is looking? Drives the Finance view gating (see lib/financeAccess):
    // admins of this chata see everyone, linked users only their own
    // participants, anonymous visitors everyone except LOCKED participants
    // (linked account that has logged in at least once)
    const { user } = await payload.auth({ headers: request.headers })
    const viewer: FinanceViewer = {
      authenticated: !!user,
      email: user?.email ?? null,
      userId: user?.id ?? null,
      role: user?.role ?? null,
      canViewAll: canManageChata(user, chata.id),
      linkedParticipantIds: user
        ? participantsResult.docs
            .filter((p: any) => p.account != null && refId(p.account) === String(user.id))
            .map((p: any) => p.id)
        : [],
    }

    // "Výdaj za jiného plátce": an expense recorded for somebody else is
    // stored but stays out of the journal until it is confirmed. It ships
    // ONLY to the people who have business with it — the chata's admins, the
    // author, the accounts speaking for the payer (the named participant, or
    // every member of the paying joint account) and the banker's account —
    // so they can act on it; for everyone else it does not exist. The maths
    // above already ignores it either way. (The plain REST API is stricter
    // still: it hides an unconfirmed expense from everyone but the admins,
    // the author and the payer participant's account. This route runs on the
    // local API, which has the chata context those Where filters lack.)
    const bankerParticipant = participantsResult.docs.find(
      (p: any) => String(p.id) === refId(chata.banker),
    )
    const viewerIsBanker =
      user != null &&
      bankerParticipant?.account != null &&
      refId(bankerParticipant.account) === String(user.id)
    const visibleExpenses = expensesResult.docs.filter((expense: any) => {
      if (isCountedExpense(expense.approvalStatus)) return true
      if (!user) return false
      if (canManageChata(user, chata.id) || viewerIsBanker) return true
      if (expense.authoredBy != null && refId(expense.authoredBy) === String(user.id)) return true
      return payerAccountIds(
        normalizePayer(expense.payer),
        participantsResult.docs,
        jointAccountsResult.docs,
      ).includes(String(user.id))
    })

    // "Klíče a Wi-Fi": the values (passwords, key codes) are for signed-in
    // eyes only. Anonymous visitors keep the LABELS so the page can show
    // that these details exist, but every value is blanked before the
    // response leaves the server. The scrub walks the WHOLE payload: the
    // local API skips field access (overrideAccess default) and depth-2
    // population nests the chata doc inside participants (banker, bed
    // occupants, riders) and expenses, so a top-level strip alone leaks.
    // (Payload's own REST API hides the array from anonymous reads via
    // field-level access.)
    if (!viewer.authenticated) {
      const blankPrivateInfoValues = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(blankPrivateInfoValues)
          return
        }
        if (node && typeof node === 'object') {
          const obj = node as Record<string, unknown>
          if (Array.isArray(obj.privateInfo)) {
            for (const row of obj.privateInfo) {
              if (row && typeof row === 'object') (row as { value?: string }).value = ''
            }
          }
          Object.values(obj).forEach(blankPrivateInfoValues)
        }
      }
      blankPrivateInfoValues([
        chata,
        participantsResult.docs,
        visibleExpenses,
        prepaymentsResult.docs,
        jointAccountsResult.docs,
      ])
    }

    // Locked participants: account owner has an ACTIVE account (lastLoginAt
    // set). Shipped with a masked email so the anonymous selector can show
    // "sign in as d***.n***@g***.com" instead of silently hiding people.
    const accountIds = [
      ...new Set(
        participantsResult.docs
          .filter((p: any) => p.account != null)
          .map((p: any) => refId(p.account)),
      ),
    ]
    const accountUsers = new Map<string, { email: string; lastLoginAt?: string | null }>()
    if (accountIds.length > 0) {
      const usersResult = await payload.find({
        collection: 'users',
        where: { id: { in: accountIds } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      usersResult.docs.forEach((u: any) => accountUsers.set(String(u.id), u))
    }
    const locked: LockedParticipant[] = participantsResult.docs.flatMap((p: any) => {
      if (p.account == null) return []
      const account = accountUsers.get(refId(p.account))
      if (!account?.lastLoginAt) return []
      return [{ id: p.id, maskedEmail: maskEmail(account.email) }]
    })

    // Claim state for the "Jsi to ty?" flow (docs/PRD-claim.md): which
    // participants have a PENDING claim (ids only — no accounts or emails
    // leak), plus the signed-in viewer's own requests in this chata
    const claimsResult = await payload.find({
      collection: 'claim-requests',
      where: { chata: { equals: chata.id } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    const pendingClaims = [
      ...new Set(
        claimsResult.docs
          .filter((c: any) => c.status === 'pending' && c.participant != null)
          .map((c: any) => Number(refId(c.participant)))
      ),
    ]
    const viewerClaims: ViewerClaim[] = user
      ? claimsResult.docs
          .filter((c: any) => c.user != null && refId(c.user) === String(user.id))
          .map((c: any) => ({
            id: c.id,
            participantId: Number(refId(c.participant)),
            status: c.status,
            createdAt: c.createdAt,
          }))
      : []

    // Return data with populated relationships for frontend
    // (payer/from arrive populated via depth: 1 as { relationTo, value })
    return NextResponse.json({
      chata,
      participants: participantsResult.docs,
      expenses: visibleExpenses,
      prepayments: prepaymentsResult.docs,
      jointAccounts: jointAccountsResult.docs,
      stats,
      viewer,
      locked,
      pendingClaims,
      viewerClaims,
    })
  } catch (error) {
    console.error('Error looking up chata by slug:', error)
    return NextResponse.json({ error: 'Failed to lookup chata' }, { status: 500 })
  }
}
