import crypto from 'crypto'
import { APIError, type CollectionConfig, type Where } from 'payload'
import { canManageChata, chataScopedAccess, isSuperadmin, refId } from '../lib/access'
import { NextResponse } from 'next/server'
import { normalizeVoterName, resolveVoter, validateVoteSelection } from '../lib/planning'
import { requestOrigin, sendSuperadminNotice } from '../lib/auth/magicLink'
import {
  OAUTH_PROVIDER_IDS,
  isOAuthConfigured,
  isProviderConfigured,
  type OAuthProviderId,
} from '../lib/auth/config'
import { sessionCookieDomain } from '../lib/auth/session'
import {
  VOTE_CONFIRM_TTL_DAYS,
  VOTE_INTENT_COOKIE,
  VOTE_INTENT_TTL_MINUTES,
  signVoteIntentToken,
} from '../lib/pendingVotes'
import { clientIp, verifyTurnstileToken } from '../lib/turnstile'
import { RATE_LIMITS, checkRateLimit, rateLimitResponse } from '../lib/rateLimit'
import { LOCALE_COOKIE, pickLocale } from '../i18n/config'
import {
  discardPendingVote,
  recordVote,
  sendVoteConfirmEmail,
  upsertPendingVote,
  type RecordVoteError,
} from '../utils/pendingVotes'

const isOAuthEnabled = isOAuthConfigured()

const statusFor = (error: RecordVoteError): number => {
  switch (error) {
    case 'not-found':
      return 404
    case 'planning-closed':
    case 'name-taken':
      return 409
    case 'forbidden':
      return 403
    default:
      return 400
  }
}

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
    // beforeVALIDATE, not beforeChange: the dates/accommodations fields are
    // validated against filterOptions keyed on `chata`, and validation runs
    // before beforeChange — deriving the chata any later makes every
    // selection "invalid" on a hand-created vote.
    beforeValidate: [
      async ({ data, originalDoc, req }) => {
        // Keep the denormalized chata in sync with the participant (it
        // drives admin-scoped access, like on claim requests)
        const participantRef = data?.participant ?? originalDoc?.participant
        if (data && participantRef != null) {
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
      // Anonymous callers file a PENDING vote (docs/PRD-planovani.md,
      // "Nepotvrzené hlasy"): with an email, the account is created like
      // claim registration and a confirm link goes out; with a provider,
      // the selection rides a signed cookie through the OAuth round trip.
      // Either way the vote becomes real the moment its owner signs in.
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

        // ── signed-in: record the vote right away ──
        if (req.user) {
          const result = await recordVote(req.payload, {
            chataId,
            user: req.user,
            name: typeof body.name === 'string' ? body.name : null,
            // the participant whose vote the page showed — an account may
            // own several here (a parent and children)
            participantId: Number.isInteger(Number(body.participantId))
              ? Number(body.participantId)
              : null,
            dateOptionIds,
            accommodationOptionIds,
          })
          if (!result.ok) {
            return Response.json({ error: result.error }, { status: statusFor(result.error) })
          }
          return Response.json({ ok: true, mode: 'saved' })
        }

        // ── anonymous: file a pending vote ──
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

        // Accounts are adults-only (terms section 4) — affirmed client-side
        // and enforced here, like claim registration
        if (body.adult !== true) {
          return Response.json({ error: 'adult-confirmation-required' }, { status: 400 })
        }
        const name = normalizeVoterName(body.name)
        if (!name) {
          return Response.json({ error: 'name-required' }, { status: 400 })
        }
        // Throttle + bot gate: this endpoint creates accounts and sends
        // email to a caller-supplied address (compliance blocker 9)
        const ip = clientIp(req.headers)
        const ipCheck = checkRateLimit(`planning-vote:ip:${ip}`, RATE_LIMITS.claimPerIp)
        if (!ipCheck.allowed) return rateLimitResponse(ipCheck)
        if (!(await verifyTurnstileToken(body.turnstileToken, ip))) {
          return Response.json({ error: 'captcha' }, { status: 403 })
        }

        const chataParticipants = await req.payload.find({
          collection: 'participants',
          where: { chata: { equals: chataId } },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        })
        const candidates = chataParticipants.docs.map((p) => ({
          id: p.id,
          name: p.name,
          accountId: p.account != null ? refId(p.account) : null,
        }))

        // ── provider: hand the selection to the OAuth round trip ──
        const provider = body.provider
        if (typeof provider === 'string') {
          if (
            !(OAUTH_PROVIDER_IDS as readonly string[]).includes(provider) ||
            !isProviderConfigured(provider as OAuthProviderId)
          ) {
            return Response.json({ error: 'invalid-provider' }, { status: 400 })
          }
          // Who they are is only known after the provider answers; a clash
          // with an UNLINKED participant is refused now (that name is
          // definitely not theirs to take — the claim flow is for that), a
          // linked one is theirs or not once signed in
          const unlinkedClash = candidates.some(
            (p) => p.accountId == null && p.name.trim().toLowerCase() === name.toLowerCase(),
          )
          if (unlinkedClash) {
            return Response.json({ error: 'name-taken' }, { status: 409 })
          }
          const secret = process.env.PAYLOAD_SECRET
          if (!secret) {
            return Response.json({ error: 'Server misconfigured' }, { status: 500 })
          }
          const returnTo =
            typeof body.returnTo === 'string' && body.returnTo.startsWith('/') ? body.returnTo : '/'
          const response = NextResponse.json({
            ok: true,
            mode: 'oauth',
            redirect: `/api/auth/login?provider=${provider}&returnTo=${encodeURIComponent(returnTo)}`,
          })
          // Same reach as oauth-return-to: the callback lands on the apex
          // even when the vote was cast on a chata subdomain
          response.cookies.set(
            VOTE_INTENT_COOKIE,
            signVoteIntentToken({ chataId, name, dateOptionIds, accommodationOptionIds }, secret),
            {
              httpOnly: true,
              path: '/',
              sameSite: provider === 'apple' ? 'none' : 'lax',
              secure: provider === 'apple' || process.env.NODE_ENV === 'production',
              maxAge: VOTE_INTENT_TTL_MINUTES * 60,
              ...sessionCookieDomain(),
            },
          )
          return response
        }

        // ── email: create the account, file the row, send the confirm link ──
        const email = body.email
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          return Response.json({ error: 'A valid email is required' }, { status: 400 })
        }
        const normalizedEmail = email.trim().toLowerCase()
        const emailCheck = checkRateLimit(
          `magic-link:email:${normalizedEmail}`,
          RATE_LIMITS.magicLinkPerEmail,
        )
        if (!emailCheck.allowed) return rateLimitResponse(emailCheck)

        const existing = await req.payload.find({
          collection: 'users',
          where: { email: { equals: normalizedEmail } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        let user = existing.docs[0] ?? null
        // An account that already existed is somebody's: a vote filed
        // against it without proof must be shown to them, not recorded
        // behind their back (docs/PRD-planovani.md). One the vote itself
        // creates has no such holder, so any sign-in may record it.
        let autoConfirm = user == null
        if (user && isSuperadmin(user)) {
          // Superadmins never magic-link; the generic success keeps the
          // form from probing for accounts — they sign in with OAuth and
          // vote from the results view.
          await sendSuperadminNotice(req.payload, user)
          return Response.json({ ok: true, mode: 'email', emailSent: true })
        }

        // A name clash with somebody else's participant is refused up
        // front (participant names are public data, so this reveals
        // nothing); a clash with a participant linked to THIS email's own
        // account is that person re-voting and passes through.
        const voter = resolveVoter({ participants: candidates, userId: user?.id ?? -1, name })
        if (voter.kind === 'name-taken') {
          return Response.json({ error: 'name-taken' }, { status: 409 })
        }

        if (!user) {
          try {
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
          } catch (err) {
            // Two first submits at once (a double tap): the email's unique
            // constraint let exactly one create through — use that account
            const raced = await req.payload.find({
              collection: 'users',
              where: { email: { equals: normalizedEmail } },
              limit: 1,
              depth: 0,
              overrideAccess: true,
            })
            user = raced.docs[0] ?? null
            if (!user) throw err
            autoConfirm = false
          }
        }

        const row = await upsertPendingVote(req.payload, {
          chataId,
          userId: user.id,
          name,
          dateOptionIds,
          accommodationOptionIds,
          source: 'email',
          autoConfirm,
          linkExpiresAt: new Date(
            Date.now() + VOTE_CONFIRM_TTL_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        })

        // The requester IS the recipient, so their UI locale picks the copy
        const cookies = req.headers.get('cookie') ?? ''
        const localeCookie = cookies
          .split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
          ?.slice(LOCALE_COOKIE.length + 1)
        const locale = pickLocale(localeCookie, req.headers.get('accept-language'))
        try {
          await sendVoteConfirmEmail(req.payload, {
            row,
            user,
            chata,
            origin: requestOrigin(req.headers),
            locale,
          })
        } catch (err) {
          // The row is filed (any sign-in still confirms it), but the
          // person expects an email — say so
          req.payload.logger.error({ err }, 'Failed to send vote confirm email')
          return Response.json({ ok: true, mode: 'email', emailSent: false })
        }
        return Response.json({ ok: true, mode: 'email', emailSent: true })
      },
    },
    {
      // "Tohle nejsem já" — the account holder throws away a pending vote
      // somebody filed under their email
      path: '/pending/discard',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        let id: number
        try {
          const body = ((await req.json?.()) ?? {}) as Record<string, unknown>
          id = Number(body.id)
        } catch {
          id = NaN
        }
        if (!Number.isInteger(id) || id <= 0) {
          return Response.json({ error: 'invalid-id' }, { status: 400 })
        }
        const ok = await discardPendingVote(req.payload, req.user.id, id)
        return ok
          ? Response.json({ ok: true })
          : Response.json({ error: 'not-found' }, { status: 404 })
      },
    },
    {
      // "Vzít hlas zpět" — the signed-in voter withdraws ONE participant's
      // vote (an account may own several here: a parent and children), and
      // only a participant their account owns. The participant stays.
      path: '/withdraw',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        let participantId: number
        try {
          const body = ((await req.json?.()) ?? {}) as Record<string, unknown>
          participantId = Number(body.participantId)
        } catch {
          participantId = NaN
        }
        if (!Number.isInteger(participantId) || participantId <= 0) {
          return Response.json({ error: 'invalid-participant' }, { status: 400 })
        }
        const own = await req.payload.find({
          collection: 'participants',
          where: {
            and: [{ id: { equals: participantId } }, { account: { equals: req.user.id } }],
          },
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        if (own.docs.length === 0) {
          return Response.json({ error: 'not-found' }, { status: 404 })
        }
        const votes = await req.payload.find({
          collection: 'trip-votes',
          where: { participant: { equals: participantId } },
          limit: 10,
          depth: 0,
          overrideAccess: true,
        })
        for (const vote of votes.docs) {
          await req.payload.delete({
            collection: 'trip-votes',
            id: vote.id,
            overrideAccess: true,
          })
        }
        return Response.json({ ok: true, removed: votes.docs.length })
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
          en:
            'Who voted. On a new vote, save right after picking the participant — ' +
            'the chata is derived from them and unlocks the date and place fields.',
          cs:
            'Kdo hlasoval. U nového hlasu po výběru účastníka nejdřív uložte – ' +
            'z účastníka se odvodí chata a zpřístupní se pole termínů a chalup.',
        },
      },
      filterOptions: ({ data, user }) => {
        // An existing vote stays within its chata; a fresh one offers only
        // participants of chatas that are actually in the planning phase —
        // and for scoped admins only their own chatas
        const and: Where[] = data?.chata
          ? [{ chata: { equals: data.chata } }]
          : [{ 'chata.planningEnabled': { equals: true } }]
        if (user && user.role === 'admin') {
          and.push({ chata: { in: (user.assignedChatas || []).map((ref) => refId(ref)) } })
        }
        return and.length === 1 ? and[0] : { and }
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
      admin: {
        // Hidden until the chata is derived (first save with a participant):
        // selections made before that would fail validation
        condition: (data) => Boolean(data?.chata),
      },
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
      admin: {
        condition: (data) => Boolean(data?.chata),
      },
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
