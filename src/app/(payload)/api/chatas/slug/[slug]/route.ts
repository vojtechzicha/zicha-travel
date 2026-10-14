import { NextResponse } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import { canManageChata, isSuperadmin, refId } from '@/lib/access'
import { type FinanceViewer, type LockedParticipant } from '@/lib/financeAccess'
import {
  deepScrubParticipants,
  scrubLockedStats,
  stripExpenseAttachments,
} from '@/lib/privacyScrub'
import { bankFieldVisibilityFor, findLockedParticipants } from '@/utils/participantPrivacy'
import { isCountedExpense, normalizePayer, payerAccountIds } from '@/lib/expenseAuthoring'
import { canViewPrivateExpense, visiblePrivatePayerIds } from '@/lib/privateExpenses'
import type { ViewerClaim } from '@/lib/claimRequests'
import { canSeePlanningResults, type PlanningPayload } from '@/lib/planning'
import { confirmPendingVotesForUser, pendingVoteIntentFor } from '@/utils/pendingVotes'
import { canEditShoppingItem, type ShoppingPayload } from '@/lib/shopping'
import { tapRental, type BeerItemView, type BeerPayload } from '@/lib/beer'
import { buildKegOrderEmail, kegOrderFingerprint } from '@/lib/kegOrderEmail'
import { isRohlikConnected } from '@/utils/rohlikConnection'
import { optOutView } from '@/lib/listSplit'
import { loadListOptOuts } from '@/utils/listExpense'
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
      // This route computes (and viewer-scrubs) `stats` itself below; the
      // Chatas afterRead hook would compute a second, anonymous `_stats`
      // (plus its locked-participants queries) that nothing here consumes.
      context: { triggerAfterRead: false },
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
      // "Soukromý výdaj" first — an approved private expense would otherwise
      // slip through the isCountedExpense shortcut below. Its circle is the
      // payer's account and the members' accounts, plus superadmins; chata
      // admins and the banker deliberately get nothing (the surprise target
      // could be either of them). See docs/PRD-soukromy-vydaj.md.
      if (expense.isPrivate === true) {
        return canViewPrivateExpense({
          isSuperadminUser: isSuperadmin(user),
          userId: user?.id ?? null,
          payerAccountIds: payerAccountIds(
            normalizePayer(expense.payer),
            participantsResult.docs,
            jointAccountsResult.docs,
          ),
          linkedParticipantIds: viewer.linkedParticipantIds,
          expense,
        })
      }
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
    const lockedInfo = await findLockedParticipants(payload, participantsResult.docs)
    const locked: LockedParticipant[] = lockedInfo.map(({ id, maskedEmail }) => ({
      id,
      maskedEmail,
    }))

    // Server-side privacy scrubbing (compliance blocker 1). Non-banker bank
    // fields go only to the owner, the banker's account and chata admins;
    // populated user accounts are flattened back to ids everywhere (depth-2
    // population nests them inside the chata's banker/occupants/riders);
    // receipts are for signed-in eyes; and a locked participant's balance
    // and breakdown are withheld from viewers who could not open them in
    // the UI anyway. The debtors/creditors settlement lists stay — "who
    // owes what" is recorded as deliberately public in the compliance gate.
    const bankVisibility = bankFieldVisibilityFor({
      user,
      chataId: chata.id,
      bankerId: chata.banker != null ? refId(chata.banker) : null,
      participants: participantsResult.docs,
    })
    // Being in a private expense's split means paying that payer directly, so
    // the member's QR needs the payer's bank fields. Creating the private
    // expense is the payer's consent; the widening covers exactly the private
    // expenses this viewer already receives (docs/PRD-soukromy-vydaj.md).
    const privatePayerIds = visiblePrivatePayerIds(visibleExpenses, viewer.linkedParticipantIds)
    const widenedBankVisibility =
      bankVisibility === 'all' || privatePayerIds.length === 0
        ? bankVisibility
        : new Set([...bankVisibility, ...privatePayerIds])
    deepScrubParticipants(
      [chata, participantsResult.docs, visibleExpenses, prepaymentsResult.docs, jointAccountsResult.docs],
      widenedBankVisibility,
    )
    if (!user) {
      stripExpenseAttachments(visibleExpenses as unknown as Array<Record<string, unknown>>)
    }
    if (!viewer.canViewAll) {
      const ownIds = new Set(viewer.linkedParticipantIds.map(String))
      const hiddenNames = lockedInfo
        .filter((l) => !ownIds.has(String(l.id)))
        .map((l) => l.name)
      scrubLockedStats(stats, hiddenNames)
    }

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

    // Planning phase ("Plánujeme" — docs/PRD-planovani.md): options are
    // public; per-person votes ship only to chata admins and viewers with a
    // linked participant here. Everyone else gets the anonymous headcount.
    let planning: PlanningPayload | null = null
    if (chata.planningEnabled === true) {
      // Self-heal for "Nepotvrzené hlasy": a signed-in viewer whose vote is
      // still waiting (a sign-in path that failed mid-way) gets it recorded
      // now; what cannot be recorded ships as `pendingVote` so the page can
      // ask them to finish by hand
      let pendingVote = null
      if (user && user.role !== 'superadmin') {
        try {
          await confirmPendingVotesForUser(payload, user.id, { chataId: chata.id })
          pendingVote = await pendingVoteIntentFor(payload, user.id, chata.id)
        } catch (err) {
          console.error('Pending vote self-heal failed:', err)
        }
      }
      const [dateOptionsResult, accommodationsResult, votesResult] = await Promise.all([
        payload.find({
          collection: 'trip-date-options',
          where: { chata: { equals: chata.id } },
          sort: 'dateFrom',
          limit: 100,
          depth: 0,
        }),
        payload.find({
          collection: 'trip-accommodation-options',
          where: { chata: { equals: chata.id } },
          limit: 100,
          depth: 1,
        }),
        payload.find({
          collection: 'trip-votes',
          where: { chata: { equals: chata.id } },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        }),
      ])
      const votes = votesResult.docs.map((vote: any) => ({
        participantId: Number(refId(vote.participant)),
        dateOptionIds: (vote.dates || []).map((ref: unknown) => Number(refId(ref))),
        accommodationOptionIds: (vote.accommodations || []).map((ref: unknown) =>
          Number(refId(ref)),
        ),
      }))
      const canSeeResults = canSeePlanningResults(viewer)
      const ownIds = new Set(viewer.linkedParticipantIds.map(String))
      planning = {
        enabled: true,
        intro: chata.planningIntro ?? null,
        dateOptions: dateOptionsResult.docs.map((option: any) => ({
          id: option.id,
          label: option.label ?? '',
          dateFrom: option.dateFrom,
          dateTo: option.dateTo,
          note: option.note ?? null,
        })),
        accommodations: accommodationsResult.docs.map((option: any) => ({
          id: option.id,
          name: option.name,
          locationNote: option.locationNote ?? null,
          url: option.url ?? null,
          description: option.description ?? null,
          imageUrl:
            typeof option.image === 'object' && option.image?.url ? option.image.url : null,
          dateOptionIds: (option.dateOptions || []).map((ref: unknown) => Number(refId(ref))),
        })),
        voteCount: votes.length,
        votes: canSeeResults ? votes : null,
        viewerVoted: votes.some((vote) => ownIds.has(String(vote.participantId))),
        pendingVote,
      }
    }

    // "tohle nechci" (src/lib/listSplit.ts): the banker and chata admins may
    // set anyone's opt-out, everybody else only their own participants';
    // nobody on a closed list
    const optOutsFor = async (list: 'shopping' | 'beer', closed: boolean) =>
      optOutView(await loadListOptOuts(payload, chata.id, list), {
        signedIn: user != null,
        canSetFor:
          user == null || closed
            ? []
            : viewerIsBanker || canManageChata(user, chata.id)
              ? participantsResult.docs.map((p: any) => Number(p.id))
              : viewer.linkedParticipantIds.map(Number),
      })

    // "Nákup" (src/lib/shopping.ts): the shared shopping list, once the trip
    // is booked. Everyone reads it; the flags say what this viewer may do.
    // authoredBy is compared, never shipped.
    let shopping: ShoppingPayload | null = null
    if (chata.shoppingListEnabled === true && chata.planningEnabled !== true) {
      const itemsResult = await payload.find({
        collection: 'shopping-items',
        where: { chata: { equals: chata.id } },
        sort: 'createdAt',
        limit: 500,
        depth: 0,
        overrideAccess: true,
      })
      const nameOf = new Map(participantsResult.docs.map((p: any) => [String(p.id), p.name as string]))
      const isChataAdmin = canManageChata(user, chata.id)
      const bankerAccountId =
        bankerParticipant?.account != null ? refId(bankerParticipant.account) : null
      shopping = {
        items: itemsResult.docs.map((item) => {
          const participantId = item.participant != null ? Number(refId(item.participant)) : null
          const authoredBy = item.authoredBy != null ? refId(item.authoredBy) : null
          const product = item.rohlik?.productId
            ? {
                productId: item.rohlik.productId,
                name: item.rohlik.name ?? item.title,
                price: item.rohlik.price ?? null,
                amount: item.rohlik.amount ?? null,
                imageUrl: item.rohlik.imageUrl ?? null,
                url: item.rohlik.url ?? null,
                inStock: item.rohlik.inStock ?? null,
              }
            : null
          return {
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            note: item.note ?? null,
            participantId,
            participantName: participantId != null ? (nameOf.get(String(participantId)) ?? null) : null,
            mine: user != null && authoredBy === String(user.id),
            canEdit:
              !chata.shoppingClosedAt &&
              canEditShoppingItem({
                viewerId: user?.id ?? null,
                authoredBy,
                isChataAdmin,
                isBanker: viewerIsBanker,
              }),
            rohlik: product,
            sentToCartAt: item.sentToCartAt ?? null,
            sentQuantity: item.sentQuantity ?? null,
          }
        }),
        canAdd:
          !chata.shoppingClosedAt &&
          user != null &&
          (isChataAdmin || viewer.linkedParticipantIds.length > 0),
        ownParticipants: participantsResult.docs
          .filter((p: any) => viewer.linkedParticipantIds.map(String).includes(String(p.id)))
          .map((p: any) => ({ id: p.id, name: p.name })),
        closedAt: chata.shoppingClosedAt ?? null,
        optOuts: await optOutsFor('shopping', Boolean(chata.shoppingClosedAt)),
        shopper: {
          name: bankerParticipant?.name ?? null,
          connected: bankerAccountId != null && (await isRohlikConnected(payload, bankerAccountId)),
          isMe: viewerIsBanker,
          canManage: viewerIsBanker || canManageChata(user, chata.id),
        },
      }
    }

    // "Pivo" (src/lib/beer.ts): the shared keg order, same visibility and
    // flags as "Nákup"; authoredBy is compared, never shipped
    let beer: BeerPayload | null = null
    if (chata.beerListEnabled === true && chata.planningEnabled !== true) {
      const kegsResult = await payload.find({
        collection: 'keg-items',
        where: { chata: { equals: chata.id } },
        sort: 'createdAt',
        limit: 500,
        depth: 0,
        overrideAccess: true,
      })
      const nameOf = new Map(participantsResult.docs.map((p: any) => [String(p.id), p.name as string]))
      const isChataAdmin = canManageChata(user, chata.id)
      const items: BeerItemView[] = kegsResult.docs.map((item) => {
        const participantId = item.participant != null ? Number(refId(item.participant)) : null
        const authoredBy = item.authoredBy != null ? refId(item.authoredBy) : null
        return {
          id: item.id,
          code: item.code,
          name: item.name ?? item.code,
          liters: item.liters ?? null,
          price: item.price ?? 0,
          unit: item.unit === 'day' ? 'day' : 'keg',
          kind: (item.kind ?? 'beer') as BeerItemView['kind'],
          quantity: item.quantity,
          note: item.note ?? null,
          participantId,
          participantName: participantId != null ? (nameOf.get(String(participantId)) ?? null) : null,
          mine: user != null && authoredBy === String(user.id),
          canEdit:
            !chata.beerClosedAt &&
            canEditShoppingItem({
              viewerId: user?.id ?? null,
              authoredBy,
              isChataAdmin,
              isBanker: viewerIsBanker,
            }),
          summaryQuantity: item.summarySentAt ? (item.summaryQuantity ?? null) : null,
        }
      })
      const summarySentAt = chata.beerSummarySentAt ?? null
      beer = {
        items,
        canAdd:
          !chata.beerClosedAt &&
          user != null &&
          (isChataAdmin || viewer.linkedParticipantIds.length > 0),
        ownParticipants: participantsResult.docs
          .filter((p: any) => viewer.linkedParticipantIds.map(String).includes(String(p.id)))
          .map((p: any) => ({ id: p.id, name: p.name })),
        tapDays: tapRental(chata).days,
        tapWeekend: tapRental(chata).weekend,
        closedAt: chata.beerClosedAt ?? null,
        optOuts: await optOutsFor('beer', Boolean(chata.beerClosedAt)),
        orderer: {
          name: bankerParticipant?.name ?? null,
          isMe: viewerIsBanker,
          canManage: viewerIsBanker || canManageChata(user, chata.id),
        },
        summarySentAt,
        summaryChanged:
          summarySentAt != null &&
          chata.beerSummarySignature !==
            kegOrderFingerprint(
              buildKegOrderEmail(
                chata as any,
                kegsResult.docs,
                participantsResult.docs.map((p: any) => ({ id: p.id, name: p.name })),
              ),
            ),
      }
    }

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
      planning,
      shopping,
      beer,
    })
  } catch (error) {
    console.error('Error looking up chata by slug:', error)
    return NextResponse.json({ error: 'Failed to lookup chata' }, { status: 500 })
  }
}
