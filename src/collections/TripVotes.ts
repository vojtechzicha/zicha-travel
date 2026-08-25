import crypto from 'crypto'
import { APIError, type CollectionConfig, type Where } from 'payload'
import { canManageChata, chataScopedAccess, isSuperadmin, refId } from '../lib/access'
import {
  normalizeVoterName,
  planningVoteReturnTo,
  validateVoteSelection,
} from '../lib/planning'
import { requestOrigin, sendMagicLink, sendSuperadminNotice } from '../lib/auth/magicLink'
import { isOAuthConfigured } from '../lib/auth/config'
import { clientIp, verifyTurnstileToken } from '../lib/turnstile'
import { RATE_LIMITS, checkRateLimit, rateLimitResponse } from '../lib/rateLimit'

const isOAuthEnabled = isOAuthConfigured()

function idList(value: unknown): number[] | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null
  const ids: number[] = []
  for (const item of value) {
    const id = Number(item)
    if (!Number.isInteger(id) || id <= 0) return null
    ids.push(id)
  }
  return [...new Set(ids)]
}

// "Hlasy" — one participant's answer to the planning poll ("Plánujeme" —
// docs/PRD-planovani.md): every date that works for them and every place
// they'd be happy with. One row per participant and chata; the submit
// endpoint upserts, so re-voting updates in place. NOT publicly readable
// (votes are preference data): admins see their chatas' votes, a frontend
// user their own; everyone else gets results only through the slug API's
// viewer gating.
export const TripVotes: CollectionConfig = {
  slug: 'trip-votes',
  labels: {
    singular: { en: 'Planning vote', cs: 'Hlas v plánování' },
    plural: { en: 'Planning votes', cs: 'Hlasy v plánování' },
  },
  admin: {
    defaultColumns: ['participant', 'chata', 'updatedAt'],
    group: { en: 'Planning', cs: 'Plánování' },
    description: {
      en: 'Votes cast on the planning page. Created by the public vote form; edit only to fix mistakes.',
      cs: 'Hlasy z plánovací stránky. Vznikají veřejným formulářem, upravujte jen kvůli opravám.',
    },
  },
  access: {
    read: async ({ req }) => {
      const user = req.user
      if (!user) return false
      if (isSuperadmin(user)) return true
      if (user.role === 'admin') {
        const where: Where = { chata: { in: user.assignedChatas || [] } }
        return where
      }
      const own = await req.payload.find({
        collection: 'participants',
        where: { account: { equals: user.id } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      if (own.docs.length === 0) return false
      const ownWhere: Where = { participant: { in: own.docs.map((p) => p.id) } }
      return ownWhere
    },
    // Admin writes are chata-scoped like the other chata-owned collections
    // (the Where matches the denormalized chata field); the public flow
    // goes through the submit endpoint below (overrideAccess)
    create: chataScopedAccess,
    update: chataScopedAccess,
    delete: chataScopedAccess,
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        // Keep the denormalized chata in sync with the participant (it
        // drives admin-scoped access, like on claim requests)
        const participantRef = data?.participant ?? originalDoc?.participant
        if (participantRef != null) {
          try {
            const participant = await req.payload.findByID({
              collection: 'participants',
              id: refId(participantRef),
              depth: 0,
            })
            data.chata = Number(refId(participant.chata))
          } catch {
            // participant gone — leave data as-is
          }
        }
        // The access Where can only scope by the STORED chata; the chata
        // just derived from the incoming participant must be manageable
        // too, or a scoped admin could write into another chata by picking
        // its participant. (The submit endpoint writes without req.user.)
        if (req.user && data?.chata != null && !canManageChata(req.user, data.chata)) {
          throw new APIError('Forbidden', 403)
        }
        return data
      },
    ],
  },
  endpoints: [
    {
      // The public vote ("Chci jet"). Signed-in callers vote as their linked
      // participant (or get one created) and the vote lands immediately.
      // Anonymous callers leave a name and email — the account is created
      // like claim registration (Turnstile, rate limits), but NOTHING else
      // is recorded until the magic-link click verifies the email: the
      // selection rides the link's returnTo and the signed-in auto-submit
      // on the planning page records it.
      path: '/submit',
      method: 'post',
      handler: async (req) => {
        let body: Record<string, unknown>
        try {
          body = ((await req.json?.()) ?? {}) as Record<string, unknown>
        } catch {
          body = {}
        }
        const chataId = Number(body.chataId)
        if (!Number.isInteger(chataId) || chataId <= 0) {
          return Response.json({ error: 'invalid-chata' }, { status: 400 })
        }
        const dateOptionIds = idList(body.dateOptionIds)
        const accommodationOptionIds = idList(body.accommodationOptionIds)
        if (dateOptionIds == null || accommodationOptionIds == null) {
          return Response.json({ error: 'invalid-selection' }, { status: 400 })
        }

        let chata
        try {
          chata = await req.payload.findByID({
            collection: 'chatas',
            id: chataId,
            depth: 0,
            context: { triggerAfterRead: false },
          })
        } catch {
          return Response.json({ error: 'not-found' }, { status: 404 })
        }
        if (chata.planningEnabled !== true) {
          return Response.json({ error: 'planning-closed' }, { status: 409 })
        }

        const [dateOptions, accommodations] = await Promise.all([
          req.payload.find({
            collection: 'trip-date-options',
            where: { chata: { equals: chataId } },
            limit: 100,
            depth: 0,
          }),
          req.payload.find({
            collection: 'trip-accommodation-options',
            where: { chata: { equals: chataId } },
            limit: 100,
            depth: 0,
          }),
        ])
        const selectionError = validateVoteSelection({
          dateOptionIds,
          accommodationOptionIds,
          dateOptions: dateOptions.docs.map((d) => ({ id: d.id })),
          accommodations: accommodations.docs.map((a) => ({
            id: a.id,
            dateOptionIds: (a.dateOptions || []).map((ref) => Number(refId(ref))),
          })),
        })
        if (selectionError) {
          return Response.json({ error: selectionError }, { status: 400 })
        }

        const chataParticipants = await req.payload.find({
          collection: 'participants',
          where: { chata: { equals: chataId } },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        })

        // ── signed-in: record the vote right away ──
        if (req.user) {
          const user = req.user
          let voter = chataParticipants.docs.find(
            (p) => p.account != null && refId(p.account) === String(user.id),
          )
          if (!voter) {
            const name = normalizeVoterName(body.name)
            if (!name) {
              return Response.json({ error: 'name-required' }, { status: 400 })
            }
            // Never silently take over an existing participant by name —
            // linking identities is the claim flow's job
            const clash = chataParticipants.docs.some(
              (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
            )
            if (clash) {
              return Response.json({ error: 'name-taken' }, { status: 409 })
            }
            voter = await req.payload.create({
              collection: 'participants',
              data: {
                name,
                chata: chataId,
                account: user.id,
              },
              overrideAccess: true,
              depth: 0,
            })
          }

          const existingVote = await req.payload.find({
            collection: 'trip-votes',
            where: { participant: { equals: voter.id } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          const voteData = {
            chata: chataId,
            participant: voter.id,
            dates: dateOptionIds,
            accommodations: accommodationOptionIds,
          }
          if (existingVote.docs.length > 0) {
            await req.payload.update({
              collection: 'trip-votes',
              id: existingVote.docs[0].id,
              data: voteData,
              overrideAccess: true,
              depth: 0,
            })
          } else {
            await req.payload.create({
              collection: 'trip-votes',
              data: voteData,
              overrideAccess: true,
              depth: 0,
            })
          }
          return Response.json({ ok: true, emailSent: false })
        }

        // ── anonymous: defer everything to the magic-link click ──
        // Knowing an email address proves nothing, so an unauthenticated
        // submission must not touch any existing participant's vote (or
        // create one in somebody's name). The server records NOTHING here:
        // the selection rides the magic-link returnTo as intent params, and
        // the click — which IS the verification — lands back on the
        // planning page, where the signed-in auto-submit records the vote
        // through the branch above.
        const email = body.email
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          return Response.json({ error: 'A valid email is required' }, { status: 400 })
        }
        // Accounts are adults-only (terms section 4) — affirmed client-side
        // and enforced here, like claim registration
        if (body.adult !== true) {
          return Response.json({ error: 'adult-confirmation-required' }, { status: 400 })
        }
        // Throttle + bot gate: this endpoint creates accounts and sends
        // email to a caller-supplied address (compliance blocker 9)
        const ip = clientIp(req.headers)
        const ipCheck = checkRateLimit(`planning-vote:ip:${ip}`, RATE_LIMITS.claimPerIp)
        if (!ipCheck.allowed) return rateLimitResponse(ipCheck)
        const emailCheck = checkRateLimit(
          `magic-link:email:${email.trim().toLowerCase()}`,
          RATE_LIMITS.magicLinkPerEmail,
        )
        if (!emailCheck.allowed) return rateLimitResponse(emailCheck)
        if (!(await verifyTurnstileToken(body.turnstileToken, ip))) {
          return Response.json({ error: 'captcha' }, { status: 403 })
        }

        const name = normalizeVoterName(body.name)
        if (!name) {
          return Response.json({ error: 'name-required' }, { status: 400 })
        }

        const normalizedEmail = email.trim().toLowerCase()
        const existing = await req.payload.find({
          collection: 'users',
          where: { email: { equals: normalizedEmail } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        let user = existing.docs[0] ?? null
        if (user && isSuperadmin(user)) {
          // Superadmins never magic-link; the generic success keeps the
          // form from probing for accounts — they sign in with OAuth and
          // vote from the results view.
          await sendSuperadminNotice(req.payload, user)
          return Response.json({ ok: true, emailSent: true })
        }

        // A name clash with somebody else's participant is refused up
        // front (participant names are public data, so this reveals
        // nothing); a clash with a participant linked to THIS email's own
        // account is that person re-voting and passes through.
        const clash = chataParticipants.docs.some(
          (p) =>
            p.name.trim().toLowerCase() === name.toLowerCase() &&
            !(user != null && p.account != null && refId(p.account) === String(user.id)),
        )
        if (clash) {
          return Response.json({ error: 'name-taken' }, { status: 409 })
        }

        if (!user) {
          user = await req.payload.create({
            collection: 'users',
            data: {
              email: normalizedEmail,
              role: 'user' as const,
              // The local (password) strategy only exists where OAuth is
              // not configured — give it an unguessable throwaway there
              ...(isOAuthEnabled ? {} : { password: crypto.randomBytes(24).toString('hex') }),
            },
            overrideAccess: true,
          })
        }

        // The click lands back on the planning page with the intent params,
        // where the signed-in auto-submit records the vote
        const returnTo = planningVoteReturnTo(
          typeof body.returnTo === 'string' && body.returnTo ? body.returnTo : '/',
          { name, dateOptionIds, accommodationOptionIds },
        )
        try {
          await sendMagicLink(req.payload, user, {
            origin: requestOrigin(req.headers),
            returnTo,
          })
        } catch (err) {
          // Nothing was recorded, so a failed send is an honest failure —
          // the voter can simply try again
          req.payload.logger.error({ err }, 'Failed to send planning-vote magic link')
          return Response.json({ error: 'Failed to send email' }, { status: 500 })
        }

        return Response.json({ ok: true, emailSent: true })
      },
    },
  ],
  fields: [
    {
      name: 'participant',
      type: 'relationship',
      relationTo: 'participants',
      required: true,
      index: true,
      admin: {
        description: {
          en: 'Who voted',
          cs: 'Kdo hlasoval',
        },
      },
    },
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      index: true,
      admin: {
        readOnly: true,
        description: {
          en: 'Derived from the participant — drives admin-scoped access',
          cs: 'Odvozeno z účastníka – řídí přístup správců podle chaty',
        },
      },
    },
    {
      name: 'dates',
      type: 'relationship',
      relationTo: 'trip-date-options',
      hasMany: true,
      label: { en: 'Dates that work', cs: 'Vyhovující termíny' },
      filterOptions: ({ data }) => {
        if (data?.chata) {
          return {
            chata: {
              equals: data.chata,
            },
          }
        }
        return false
      },
    },
    {
      name: 'accommodations',
      type: 'relationship',
      relationTo: 'trip-accommodation-options',
      hasMany: true,
      label: { en: 'Liked places', cs: 'Líbí se' },
      filterOptions: ({ data }) => {
        if (data?.chata) {
          return {
            chata: {
              equals: data.chata,
            },
          }
        }
        return false
      },
    },
  ],
}
