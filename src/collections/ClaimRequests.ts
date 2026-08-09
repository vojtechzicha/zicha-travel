import crypto from 'crypto'
import { APIError, type CollectionConfig, type Where } from 'payload'
import type { ClaimRequest } from '../payload-types'
import { canManageChata, chataScopedAccess, isSuperadmin, refId } from '../lib/access'
import { autoApproveReason, verifyDecideToken } from '../lib/claimRequests'
import { requestOrigin, sendMagicLink, sendSuperadminNotice } from '../lib/auth/magicLink'
import { clientIp, verifyTurnstileToken } from '../lib/turnstile'
import {
  chataOrigin,
  notifyClaimDecisionMakers,
  runClaimDecisionSideEffects,
} from '../utils/claimRequests'

const isOAuthEnabled = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)

const REMINDER_AFTER_DAYS = 3

// "Žádosti o propojení" — a signed-in account claiming a participant as
// themselves ("Jsi to ty?"). One row per (participant, user) attempt; a
// participant may collect several rival pending claims and an admin picks
// the right one — approving it auto-rejects the rest. Kept separate from
// Participants so the audit trail (who claimed what, who decided, why
// rejected) survives the decision. See docs/PRD-claim.md.
export const ClaimRequests: CollectionConfig = {
  slug: 'claim-requests',
  labels: {
    singular: 'Claim Request',
    plural: 'Claim Requests',
  },
  admin: {
    defaultColumns: ['participant', 'user', 'status', 'createdAt'],
    group: 'Expense Tracking',
    description:
      'Requests to link a participant to a frontend account ("žádosti o propojení"). ' +
      'Approve by setting status to approved — that links the participant, rejects rival ' +
      'claims and emails the requester. Rejections require a reason (it is emailed).',
  },
  access: {
    // NOT public — rows link users (emails) to participants. Admins see
    // their chatas' queue; a frontend user only their own requests.
    read: ({ req: { user } }) => {
      if (!user) return false
      if (isSuperadmin(user)) return true
      if (user.role === 'admin') {
        const where: Where = { chata: { in: user.assignedChatas || [] } }
        return where
      }
      const own: Where = { user: { equals: user.id } }
      return own
    },
    create: chataScopedAccess,
    update: chataScopedAccess,
    delete: chataScopedAccess,
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation, req }) => {
        // Keep the denormalized chata in sync with the participant (the
        // chata field drives admin-scoped access)
        const participantRef = data?.participant ?? originalDoc?.participant
        if (participantRef != null) {
          try {
            const participant = await req.payload.findByID({
              collection: 'participants',
              id: refId(participantRef),
              depth: 0,
            })
            data.chata = Number(refId(participant.chata))

            // A decision is only valid while the claim is pending; approving
            // must never steal a participant linked to an ACTIVE account
            // (e.g. a rival claim approved a second earlier). A never-used
            // admin-created link is replaceable — the admin is explicitly
            // deciding the claim is the right identity.
            const decidingNow =
              operation === 'update' &&
              originalDoc?.status === 'pending' &&
              (data?.status === 'approved' || data?.status === 'rejected')
            if (decidingNow && data.status === 'approved') {
              const claimUser = data?.user ?? originalDoc?.user
              if (
                participant.account != null &&
                claimUser != null &&
                refId(participant.account) !== refId(claimUser)
              ) {
                const owner = await req.payload
                  .findByID({
                    collection: 'users',
                    id: refId(participant.account),
                    depth: 0,
                    overrideAccess: true,
                  })
                  .catch(() => null)
                if (owner?.lastLoginAt) {
                  throw new APIError(
                    'Participant is already linked to an active account — unlink it first if this claim is the right one.',
                    400,
                  )
                }
              }
            }
            if (decidingNow) {
              data.decidedAt = data.decidedAt ?? new Date().toISOString()
              // Auto-approvals record no decider; panel/endpoint decisions do
              if (!data.autoApproved && data.decidedBy == null) {
                data.decidedBy = req.user?.id ?? null
              }
            }
          } catch (err) {
            if (err instanceof APIError) throw err
            // participant gone — leave data as-is, decide endpoints handle it
          }
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        // Single source of truth for decision side effects: linking the
        // participant, auto-rejecting rivals, emailing the requester. Runs
        // for the decide endpoint, the admin panel AND auto-approval alike.
        if (
          operation === 'update' &&
          previousDoc?.status === 'pending' &&
          (doc.status === 'approved' || doc.status === 'rejected') &&
          req.context?.skipClaimSideEffects !== true
        ) {
          await runClaimDecisionSideEffects(req.payload, doc as ClaimRequest)
        }
        return doc
      },
    ],
  },
  endpoints: [
    {
      // Signed-in claim ("Tohle jsem já"). Auto-approves known faces —
      // a linked participant in ANOTHER chata, or a chata admin — otherwise
      // files a pending request and emails the decision makers.
      path: '/submit',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        let participantId: unknown
        try {
          const body = await req.json?.()
          participantId = body?.participantId
        } catch {
          participantId = undefined
        }
        if (typeof participantId !== 'number' && typeof participantId !== 'string') {
          return Response.json({ error: 'Missing participantId' }, { status: 400 })
        }

        let participant
        try {
          participant = await req.payload.findByID({
            collection: 'participants',
            id: participantId,
            depth: 0,
          })
        } catch {
          return Response.json({ error: 'Participant not found' }, { status: 404 })
        }

        const chataId = Number(refId(participant.chata))
        const userId = req.user.id

        // Already this person's participant — nothing to claim
        if (participant.account != null && refId(participant.account) === String(userId)) {
          return Response.json({ status: 'already-linked' })
        }

        // Locked: the linked account is active (logged in at least once)
        if (participant.account != null) {
          const owner = await req.payload
            .findByID({
              collection: 'users',
              id: refId(participant.account),
              depth: 0,
              overrideAccess: true,
            })
            .catch(() => null)
          if (owner?.lastLoginAt) {
            return Response.json({ error: 'participant-locked' }, { status: 409 })
          }
        }

        // One participant per account and chata: an account that already
        // owns a participant HERE cannot claim another (children/partners
        // are linked by admins in the panel)
        const ownParticipants = await req.payload.find({
          collection: 'participants',
          where: { account: { equals: userId } },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        })
        if (ownParticipants.docs.some((p) => refId(p.chata) === String(chataId))) {
          return Response.json({ error: 'account-has-participant' }, { status: 409 })
        }

        // Idempotent: one pending claim per (participant, user)
        const existing = await req.payload.find({
          collection: 'claim-requests',
          where: {
            and: [
              { participant: { equals: participant.id } },
              { user: { equals: userId } },
              { status: { equals: 'pending' } },
            ],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (existing.docs.length > 0) {
          return Response.json({ status: 'pending', requestId: existing.docs[0].id })
        }
        const auto = autoApproveReason({
          requesterManagesChata: canManageChata(req.user, chataId),
          targetHasAccount: participant.account != null,
          requesterLinkedChataIds: ownParticipants.docs.map((p) => refId(p.chata)),
          targetChataId: chataId,
        })

        const claim = await req.payload.create({
          collection: 'claim-requests',
          data: {
            participant: participant.id,
            chata: chataId,
            user: userId,
            status: 'pending' as const,
          },
          overrideAccess: true,
          depth: 0,
        })

        if (auto) {
          await req.payload.update({
            collection: 'claim-requests',
            id: claim.id,
            data: {
              status: 'approved' as const,
              autoApproved: true,
              decidedAt: new Date().toISOString(),
            },
            overrideAccess: true,
            depth: 0,
          })
          return Response.json({ status: 'approved', requestId: claim.id, auto })
        }

        const chata = await req.payload
          .findByID({
            collection: 'chatas',
            id: chataId,
            depth: 0,
            context: { triggerAfterRead: false },
          })
          .catch(() => null)
        if (chata) {
          await notifyClaimDecisionMakers(req.payload, {
            claim,
            participant,
            chata,
            requester: req.user,
            origin: requestOrigin(req.headers),
          })
        }
        return Response.json({ status: 'pending', requestId: claim.id })
      },
    },
    {
      // "Jsem tu poprvé" — create (or quietly reuse) an account for the
      // email and send a magic link whose click is both the email
      // verification and the first login. The response NEVER reveals
      // whether the email already had an account.
      path: '/register',
      method: 'post',
      handler: async (req) => {
        let email: unknown
        let participantId: unknown
        let returnTo: unknown
        let turnstileToken: unknown
        try {
          const body = await req.json?.()
          email = body?.email
          participantId = body?.participantId
          returnTo = body?.returnTo
          turnstileToken = body?.turnstileToken
        } catch {
          // fall through to validation
        }
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          return Response.json({ error: 'A valid email is required' }, { status: 400 })
        }
        if (typeof participantId !== 'number' && typeof participantId !== 'string') {
          return Response.json({ error: 'Missing participantId' }, { status: 400 })
        }

        // Bot gate — this endpoint can CREATE accounts, so it gets the
        // visible Turnstile check (no-op where not configured — local dev)
        if (!(await verifyTurnstileToken(turnstileToken, clientIp(req.headers)))) {
          return Response.json({ error: 'captcha' }, { status: 403 })
        }

        // The participant must be claimable — this endpoint can create
        // accounts, so it must not be callable for arbitrary purposes
        let participant
        try {
          participant = await req.payload.findByID({
            collection: 'participants',
            id: participantId,
            depth: 0,
          })
        } catch {
          return Response.json({ error: 'Participant not found' }, { status: 404 })
        }
        if (participant.account != null) {
          const owner = await req.payload
            .findByID({
              collection: 'users',
              id: refId(participant.account),
              depth: 0,
              overrideAccess: true,
            })
            .catch(() => null)
          if (owner?.lastLoginAt) {
            return Response.json({ error: 'participant-locked' }, { status: 409 })
          }
        }

        const normalizedEmail = email.trim().toLowerCase()
        const existing = await req.payload.find({
          collection: 'users',
          where: { email: { equals: normalizedEmail } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })

        let user = existing.docs[0]
        if (user?.role === 'superadmin') {
          await sendSuperadminNotice(req.payload, user)
          return Response.json({ ok: true })
        }
        if (!user) {
          user = await req.payload.create({
            collection: 'users',
            data: {
              email: normalizedEmail,
              role: 'user' as const,
              // The local (password) strategy only exists where OAuth is not
              // configured — give it an unguessable throwaway password there
              ...(isOAuthEnabled ? {} : { password: crypto.randomBytes(24).toString('hex') }),
            },
            overrideAccess: true,
          })
        }

        try {
          await sendMagicLink(req.payload, user, {
            origin: requestOrigin(req.headers),
            returnTo: typeof returnTo === 'string' ? returnTo : null,
          })
        } catch (err) {
          req.payload.logger.error({ err }, 'Failed to send claim registration magic link')
          return Response.json({ error: 'Failed to send email' }, { status: 500 })
        }
        return Response.json({ ok: true })
      },
    },
    {
      // "Vzít žádost zpět" — the requester withdraws their own pending claim
      path: '/:id/cancel',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const id = req.routeParams?.id as string | undefined
        if (!id) {
          return Response.json({ error: 'Missing claim id' }, { status: 400 })
        }
        let claim
        try {
          claim = await req.payload.findByID({ collection: 'claim-requests', id, depth: 0 })
        } catch {
          return Response.json({ error: 'Claim not found' }, { status: 404 })
        }
        if (claim.user == null || refId(claim.user) !== String(req.user.id)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        if (claim.status !== 'pending') {
          return Response.json({ error: 'already-decided', status: claim.status }, { status: 409 })
        }
        await req.payload.update({
          collection: 'claim-requests',
          id: claim.id,
          data: { status: 'cancelled' as const },
          overrideAccess: true,
          depth: 0,
        })
        return Response.json({ ok: true })
      },
    },
    {
      // Decision via the signed email link (the /claims/decide page POSTs
      // here). The token is the credential — no session needed — but the
      // admin it names must STILL be allowed to manage the chata.
      path: '/decide',
      method: 'post',
      handler: async (req) => {
        let token: unknown
        let action: unknown
        let reason: unknown
        try {
          const body = await req.json?.()
          token = body?.token
          action = body?.action
          reason = body?.reason
        } catch {
          // fall through to validation
        }
        if (typeof token !== 'string' || (action !== 'approve' && action !== 'reject')) {
          return Response.json({ error: 'invalid' }, { status: 400 })
        }
        const secret = process.env.PAYLOAD_SECRET
        if (!secret) {
          return Response.json({ error: 'invalid' }, { status: 500 })
        }
        const verified = verifyDecideToken(token, secret)
        if (!verified.ok) {
          return Response.json({ error: verified.code }, { status: 400 })
        }

        const [admin, claim] = await Promise.all([
          req.payload
            .findByID({
              collection: 'users',
              id: verified.adminId,
              depth: 0,
              overrideAccess: true,
            })
            .catch(() => null),
          req.payload
            .findByID({ collection: 'claim-requests', id: verified.claimId, depth: 0 })
            .catch(() => null),
        ])
        if (!claim) {
          return Response.json({ error: 'not-found' }, { status: 404 })
        }
        if (!admin || !canManageChata({ ...admin, collection: 'users' }, refId(claim.chata))) {
          return Response.json({ error: 'forbidden' }, { status: 403 })
        }
        if (claim.status !== 'pending') {
          return Response.json({ error: 'already-decided', status: claim.status }, { status: 409 })
        }
        const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
        if (action === 'reject' && !trimmedReason) {
          return Response.json({ error: 'reason-required' }, { status: 400 })
        }

        try {
          await req.payload.update({
            collection: 'claim-requests',
            id: claim.id,
            data: {
              status: action === 'approve' ? ('approved' as const) : ('rejected' as const),
              decidedBy: admin.id,
              decidedAt: new Date().toISOString(),
              ...(action === 'reject' ? { reason: trimmedReason } : {}),
            },
            overrideAccess: true,
            depth: 0,
          })
        } catch (err) {
          if (err instanceof APIError && err.status === 400) {
            // beforeChange conflict guard: participant already linked elsewhere
            return Response.json({ error: 'conflict' }, { status: 409 })
          }
          throw err
        }
        return Response.json({ ok: true, action })
      },
    },
    {
      // Cron: one reminder per claim pending >= 3 days (Vercel cron sends
      // Authorization: Bearer CRON_SECRET). Never spams twice.
      path: '/remind',
      method: 'get',
      handler: async (req) => {
        const secret = process.env.CRON_SECRET
        const authorized =
          (secret && req.headers.get('authorization') === `Bearer ${secret}`) ||
          isSuperadmin(req.user)
        if (!authorized) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const cutoff = new Date(Date.now() - REMINDER_AFTER_DAYS * 24 * 60 * 60 * 1000)
        const stale = await req.payload.find({
          collection: 'claim-requests',
          where: {
            and: [
              { status: { equals: 'pending' } },
              { createdAt: { less_than: cutoff.toISOString() } },
              { reminderSentAt: { exists: false } },
            ],
          },
          limit: 100,
          depth: 0,
          overrideAccess: true,
        })
        let reminded = 0
        for (const claim of stale.docs) {
          try {
            const [participant, chata, requester] = await Promise.all([
              claim.participant != null
                ? req.payload
                    .findByID({
                      collection: 'participants',
                      id: refId(claim.participant),
                      depth: 0,
                    })
                    .catch(() => null)
                : null,
              claim.chata != null
                ? req.payload
                    .findByID({
                      collection: 'chatas',
                      id: refId(claim.chata),
                      depth: 0,
                      context: { triggerAfterRead: false },
                    })
                    .catch(() => null)
                : null,
              claim.user != null
                ? req.payload
                    .findByID({
                      collection: 'users',
                      id: refId(claim.user),
                      depth: 0,
                      overrideAccess: true,
                    })
                    .catch(() => null)
                : null,
            ])
            if (participant && chata && requester) {
              await notifyClaimDecisionMakers(req.payload, {
                claim,
                participant,
                chata,
                requester,
                origin: chataOrigin(chata),
                reminder: true,
              })
              reminded++
            }
            await req.payload.update({
              collection: 'claim-requests',
              id: claim.id,
              data: { reminderSentAt: new Date().toISOString() },
              overrideAccess: true,
              depth: 0,
              context: { skipClaimSideEffects: true },
            })
          } catch (err) {
            req.payload.logger.error({ err, claim: claim.id }, 'Claim reminder failed')
          }
        }
        return Response.json({ ok: true, stale: stale.totalDocs, reminded })
      },
    },
  ],
  fields: [
    {
      name: 'participant',
      type: 'relationship',
      relationTo: 'participants',
      required: true,
      admin: {
        description: 'The participant being claimed',
      },
    },
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      admin: {
        readOnly: true,
        description: 'Derived from the participant — drives admin-scoped access',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        description: 'The account that claims to be this participant',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Cancelled (by requester)', value: 'cancelled' },
      ],
      admin: {
        description:
          'Approving links the participant to the account and auto-rejects rival claims; ' +
          'rejecting requires a reason (emailed to the requester).',
      },
    },
    {
      name: 'reason',
      type: 'textarea',
      validate: (value: string | null | undefined, { data }: { data?: { status?: string } }) => {
        if (data?.status === 'rejected' && !value?.trim()) {
          return 'A reason is required when rejecting — it is emailed to the requester.'
        }
        return true
      },
      admin: {
        description: 'Rejection reason — emailed to the requester',
        condition: (data) => data?.status === 'rejected',
      },
    },
    {
      name: 'decidedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        readOnly: true,
        description: 'Admin who decided (empty for auto-approvals)',
      },
    },
    {
      name: 'decidedAt',
      type: 'date',
      admin: {
        readOnly: true,
        date: { displayFormat: 'yyyy-MM-dd HH:mm' },
      },
    },
    {
      name: 'autoApproved',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        readOnly: true,
        description: 'Approved without an admin ("známá tvář" — linked participant in another chata)',
      },
    },
    {
      name: 'reminderSentAt',
      type: 'date',
      admin: {
        readOnly: true,
        description: 'When the 3-day reminder went out to admins',
        date: { displayFormat: 'yyyy-MM-dd HH:mm' },
      },
    },
  ],
}
