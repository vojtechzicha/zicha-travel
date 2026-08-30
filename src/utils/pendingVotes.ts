import crypto from 'crypto'
import type { Payload, PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Chata, PendingVote, User } from '../payload-types'
import type { AppLocale } from '../i18n/config'
import { refId } from '../lib/access'
import { sendAppEmail } from '../lib/email'
import {
  describeVoteSelection,
  resolveVoter,
  validateVoteSelection,
  type PendingVoteIntent,
  type PendingVoteIssue,
  type VoteSelectionError,
} from '../lib/planning'
import { VOTE_CONFIRM_TTL_DAYS, signVoteConfirmToken } from '../lib/pendingVotes'
import { voteConfirmEmail } from '../lib/planningVoteEmail'

// Server-side plumbing of planning votes (docs/PRD-planovani.md): the one
// place a vote is written (`recordVote`), the pending rows anonymous votes
// wait in ("Nepotvrzené hlasy"), the email that carries their confirm
// link, and the confirmation that every sign-in path runs. Pure rules live
// in src/lib/planning.ts and src/lib/pendingVotes.ts.

export type RecordVoteError =
  | 'planning-closed'
  | 'name-required'
  | 'name-taken'
  | 'forbidden'
  | 'not-found'
  | VoteSelectionError

export type RecordVoteResult =
  | { ok: true; voteId: number; participantId: number; created: boolean }
  | { ok: false; error: RecordVoteError }

type DbSession = { execute?: (q: unknown) => Promise<unknown> } | undefined

/** The drizzle session of a Payload transaction, for raw locking SQL. */
function transactionSession(payload: Payload, tid: number | string): DbSession {
  return (
    payload.db as unknown as {
      sessions?: Record<string, { db?: DbSession }>
    }
  ).sessions?.[String(tid)]?.db
}

/**
 * Run `fn` inside one transaction that holds an advisory lock on
 * (account, chata): every materialization of a vote for that pair —
 * the signed-in submit, the confirm link, the self-heal, an OAuth
 * callback — is serialized, so two of them cannot create a participant
 * or a vote twice. Postgres releases the lock with the transaction.
 */
async function withVoteLock<T>(
  payload: Payload,
  userId: number | string,
  chataId: number,
  fn: (req: PayloadRequest) => Promise<T>,
): Promise<T> {
  const tid = await payload.db.beginTransaction()
  if (tid == null) throw new Error('Transactions unavailable')
  const req = { transactionID: tid } as unknown as PayloadRequest
  try {
    const session = transactionSession(payload, tid)
    if (session?.execute) {
      await session.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`vote:${userId}:${chataId}`}))`,
      )
    }
    const result = await fn(req)
    await payload.db.commitTransaction(tid)
    return result
  } catch (err) {
    await payload.db.rollbackTransaction(tid).catch(() => undefined)
    throw err
  }
}

/**
 * Record (or update) a signed-in account's vote in a chata. The voter is
 * the participant asked for (`participantId`, must be the account's own),
 * else their linked participant here, else a participant created with
 * `name`. Also closes the account's pending rows for the chata — a vote
 * cast directly supersedes what was waiting. Serialized per (account,
 * chata) — see withVoteLock.
 */
export async function recordVote(
  payload: Payload,
  args: {
    chataId: number
    user: Pick<User, 'id'>
    name?: string | null
    participantId?: number | null
    dateOptionIds: number[]
    accommodationOptionIds: number[]
  },
): Promise<RecordVoteResult> {
  const { chataId, user } = args
  return withVoteLock(payload, user.id, chataId, async (req) => {
    let chata: Chata
    try {
      chata = await payload.findByID({
        collection: 'chatas',
        id: chataId,
        depth: 0,
        context: { triggerAfterRead: false },
        overrideAccess: true,
        req,
      })
    } catch {
      return { ok: false, error: 'not-found' }
    }
    if (chata.planningEnabled !== true) return { ok: false, error: 'planning-closed' }

    const [dateOptions, accommodations, participants] = await Promise.all([
      payload.find({
        collection: 'trip-date-options',
        where: { chata: { equals: chataId } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
        req,
      }),
      payload.find({
        collection: 'trip-accommodation-options',
        where: { chata: { equals: chataId } },
        limit: 100,
        depth: 0,
        overrideAccess: true,
        req,
      }),
      payload.find({
        collection: 'participants',
        where: { chata: { equals: chataId } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
        req,
      }),
    ])
    const selectionError = validateVoteSelection({
      dateOptionIds: args.dateOptionIds,
      accommodationOptionIds: args.accommodationOptionIds,
      dateOptions: dateOptions.docs.map((d) => ({ id: d.id })),
      accommodations: accommodations.docs.map((a) => ({
        id: a.id,
        dateOptionIds: (a.dateOptions || []).map((ref) => Number(refId(ref))),
      })),
    })
    if (selectionError) return { ok: false, error: selectionError }

    const voter = resolveVoter({
      participants: participants.docs.map((p) => ({
        id: p.id,
        name: p.name,
        accountId: p.account != null ? refId(p.account) : null,
      })),
      userId: user.id,
      name: args.name,
      participantId: args.participantId ?? null,
    })
    if (voter.kind !== 'linked' && voter.kind !== 'create') {
      return { ok: false, error: voter.kind }
    }

    let participantId: number
    let created = false
    if (voter.kind === 'linked') {
      participantId = voter.participantId
    } else {
      const participant = await payload.create({
        collection: 'participants',
        data: { name: voter.name, chata: chataId, account: user.id },
        overrideAccess: true,
        depth: 0,
        req,
      })
      participantId = participant.id
      created = true
    }

    const existingVote = await payload.find({
      collection: 'trip-votes',
      where: { participant: { equals: participantId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const voteData = {
      chata: chataId,
      participant: participantId,
      dates: args.dateOptionIds,
      accommodations: args.accommodationOptionIds,
    }
    let voteId: number
    if (existingVote.docs.length > 0) {
      voteId = existingVote.docs[0].id
      await payload.update({
        collection: 'trip-votes',
        id: voteId,
        data: voteData,
        overrideAccess: true,
        depth: 0,
        req,
      })
    } else {
      const vote = await payload.create({
        collection: 'trip-votes',
        data: voteData,
        overrideAccess: true,
        depth: 0,
        req,
      })
      voteId = vote.id
    }

    // Whatever was waiting for this account here is now superseded
    const pending = await payload.find({
      collection: 'pending-votes',
      where: {
        and: [
          { user: { equals: user.id } },
          { chata: { equals: chataId } },
          { status: { equals: 'pending' } },
        ],
      },
      limit: 100,
      depth: 0,
      overrideAccess: true,
      req,
    })
    for (const row of pending.docs) {
      await payload.update({
        collection: 'pending-votes',
        id: row.id,
        data: {
          status: 'confirmed',
          issue: null,
          confirmedAt: new Date().toISOString(),
          vote: voteId,
        },
        overrideAccess: true,
        depth: 0,
        req,
      })
    }

    return { ok: true, voteId, participantId, created }
  })
}

export type PendingVoteSource = 'email' | 'microsoft' | 'google' | 'apple'

/**
 * File (or refresh) the account's pending vote for a chata. One pending
 * row per account and chata: voting again before confirming replaces the
 * selection rather than queueing a second row. The partial unique index
 * `pending_votes_user_chata_pending_uq` (NEW_SCHEMA_DDL) is what makes
 * that hold under concurrent submissions — a create that loses the race
 * fails on it and falls back to updating the winner. Every (re)submission
 * gets a fresh `submissionKey` and an unspent link: the emailed token
 * carries the key, so links from earlier emails go stale.
 */
export async function upsertPendingVote(
  payload: Payload,
  args: {
    chataId: number
    userId: number
    name: string
    dateOptionIds: number[]
    accommodationOptionIds: number[]
    source: PendingVoteSource
    /** any sign-in may record it (account created by this submission, or
     *  same-browser OAuth intent); false = the holder must look first */
    autoConfirm: boolean
    /** when the emailed confirm link stops working (email source only) */
    linkExpiresAt?: string | null
  },
): Promise<PendingVote> {
  const findPending = () =>
    payload.find({
      collection: 'pending-votes',
      where: {
        and: [
          { user: { equals: args.userId } },
          { chata: { equals: args.chataId } },
          { status: { equals: 'pending' } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  const data = {
    name: args.name,
    dates: args.dateOptionIds,
    accommodations: args.accommodationOptionIds,
    source: args.source,
    issue: null,
    autoConfirm: args.autoConfirm,
    submissionKey: crypto.randomBytes(16).toString('hex'),
    linkExpiresAt: args.linkExpiresAt ?? null,
    linkUsedAt: null,
  }
  const existing = await findPending()
  if (existing.docs.length > 0) {
    return payload.update({
      collection: 'pending-votes',
      id: existing.docs[0].id,
      // a re-submission for an existing account stays untrusted even if an
      // earlier trusted row is being refreshed — trust never goes up here
      data: { ...data, autoConfirm: existing.docs[0].autoConfirm === true && args.autoConfirm },
      overrideAccess: true,
      depth: 0,
    })
  }
  try {
    return await payload.create({
      collection: 'pending-votes',
      data: { ...data, chata: args.chataId, user: args.userId, status: 'pending' },
      overrideAccess: true,
      depth: 0,
    })
  } catch (err) {
    // Lost the race to a concurrent submission: the unique index refused
    // a second pending row, so refresh the one that got in first
    const winner = await findPending()
    if (winner.docs.length === 0) throw err
    return payload.update({
      collection: 'pending-votes',
      id: winner.docs[0].id,
      data: { ...data, autoConfirm: winner.docs[0].autoConfirm === true && args.autoConfirm },
      overrideAccess: true,
      depth: 0,
    })
  }
}

/** Absolute confirm-page URL for a pending row, on the given origin. */
export function voteConfirmLink(
  origin: string,
  row: Pick<PendingVote, 'id' | 'submissionKey'>,
  userId: number,
  secret: string,
): string {
  const token = signVoteConfirmToken(
    { pendingVoteId: row.id, userId, key: row.submissionKey ?? '' },
    secret,
  )
  return `${origin}/votes/confirm?token=${encodeURIComponent(token)}`
}

/**
 * Spend the emailed link: ONE statement, `UPDATE … WHERE link_used_at IS
 * NULL AND submission_key = … RETURNING`, so two concurrent POSTs cannot
 * both win and a link from an earlier submission (stale key) never
 * matches. Returns why it did not claim, or null on success.
 */
export async function claimVoteLink(
  payload: Payload,
  row: Pick<PendingVote, 'id' | 'submissionKey' | 'linkUsedAt'>,
  key: string,
): Promise<'stale' | 'used' | null> {
  if (!row.submissionKey || row.submissionKey !== key) return 'stale'
  const drizzle = (payload.db as unknown as { drizzle?: { execute: (q: unknown) => Promise<unknown> } })
    .drizzle
  if (!drizzle) throw new Error('Database driver unavailable')
  const result = (await drizzle.execute(
    sql`UPDATE pending_votes SET link_used_at = now()
        WHERE id = ${row.id} AND link_used_at IS NULL AND submission_key = ${key}
        RETURNING id`,
  )) as { rows?: unknown[]; rowCount?: number } | unknown[]
  const claimed = Array.isArray(result)
    ? result.length > 0
    : (result.rows?.length ?? result.rowCount ?? 0) > 0
  return claimed ? null : 'used'
}

/**
 * "Potvrď svůj hlas" — the email with the signed confirm link and the vote
 * spelled out. Throws on delivery failure so the endpoint can report an
 * honest error (nothing is lost: the row is filed and any sign-in confirms
 * it, but the person should know no email is coming).
 */
export async function sendVoteConfirmEmail(
  payload: Payload,
  args: {
    row: PendingVote
    user: Pick<User, 'id' | 'email'>
    chata: Pick<Chata, 'id' | 'name'>
    origin: string
    locale: AppLocale
  },
): Promise<void> {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET missing – cannot sign vote confirm links')
  const [dateOptions, accommodations] = await Promise.all([
    payload.find({
      collection: 'trip-date-options',
      where: { chata: { equals: args.chata.id } },
      limit: 100,
      depth: 0,
    }),
    payload.find({
      collection: 'trip-accommodation-options',
      where: { chata: { equals: args.chata.id } },
      limit: 100,
      depth: 0,
    }),
  ])
  const summary = describeVoteSelection(
    {
      dateOptionIds: (args.row.dates || []).map((ref) => Number(refId(ref))),
      accommodationOptionIds: (args.row.accommodations || []).map((ref) => Number(refId(ref))),
    },
    dateOptions.docs.map((d) => ({ id: d.id, label: d.label ?? '' })),
    accommodations.docs.map((a) => ({ id: a.id, name: a.name })),
  )
  await sendAppEmail(payload, {
    to: args.user.email,
    ...voteConfirmEmail(args.locale, {
      link: voteConfirmLink(args.origin, args.row, args.user.id, secret),
      chataName: args.chata.name,
      voterName: args.row.name,
      dates: summary.dates,
      places: summary.places,
      ttlDays: VOTE_CONFIRM_TTL_DAYS,
    }),
  })
}

export interface ConfirmPendingVotesSummary {
  confirmed: number
  /** rows left pending with an issue set */
  issues: number
  /** chatas that gained a vote, for the redirect after a sign-in */
  confirmedChataIds: number[]
}

const issueFor = (error: RecordVoteError): PendingVoteIssue => {
  if (error === 'name-taken' || error === 'name-required' || error === 'forbidden') {
    return 'name-taken'
  }
  if (error === 'planning-closed' || error === 'not-found') return 'planning-closed'
  return 'invalid-selection'
}

/**
 * Turn pending rows of an account into real votes. Runs on EVERY
 * successful sign-in (magic link, OAuth, password fallback), as a
 * self-heal when a signed-in viewer opens a planning chata, and from the
 * confirm link. By default only rows marked `autoConfirm` are recorded:
 * a row filed anonymously against an account that already existed is
 * somebody's unproven claim, and an ordinary sign-in must not turn it
 * into a vote behind the holder's back — it is revealed on the page
 * instead. The confirm link (mailbox proof) passes `pendingVoteId` to
 * record that one row regardless. A row that cannot be recorded keeps
 * waiting with `issue` set.
 */
export async function confirmPendingVotesForUser(
  payload: Payload,
  userId: number,
  opts?: { chataId?: number; pendingVoteId?: number },
): Promise<ConfirmPendingVotesSummary> {
  const summary: ConfirmPendingVotesSummary = { confirmed: 0, issues: 0, confirmedChataIds: [] }
  const rows = await payload.find({
    collection: 'pending-votes',
    where: {
      and: [
        { user: { equals: userId } },
        { status: { equals: 'pending' } },
        ...(opts?.pendingVoteId != null
          ? [{ id: { equals: opts.pendingVoteId } }]
          : [{ autoConfirm: { equals: true } }]),
        ...(opts?.chataId != null ? [{ chata: { equals: opts.chataId } }] : []),
      ],
    },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  })
  for (const row of rows.docs) {
    const chataId = Number(refId(row.chata))
    // recordVote re-reads the row under the (account, chata) lock and
    // flips it to confirmed; a concurrent confirmation that got there
    // first leaves nothing pending for it to flip
    const result = await recordVote(payload, {
      chataId,
      user: { id: userId },
      name: row.name,
      dateOptionIds: (row.dates || []).map((ref) => Number(refId(ref))),
      accommodationOptionIds: (row.accommodations || []).map((ref) => Number(refId(ref))),
    })
    if (result.ok) {
      summary.confirmed++
      summary.confirmedChataIds.push(chataId)
      continue
    }
    const issue = issueFor(result.error)
    if (row.issue !== issue) {
      await payload.update({
        collection: 'pending-votes',
        id: row.id,
        data: { issue },
        overrideAccess: true,
        depth: 0,
      })
    }
    summary.issues++
  }
  return summary
}

/** The account's still-pending vote in a chata, as the slug API ships it. */
export async function pendingVoteIntentFor(
  payload: Payload,
  userId: number,
  chataId: number,
): Promise<PendingVoteIntent | null> {
  const rows = await payload.find({
    collection: 'pending-votes',
    where: {
      and: [
        { user: { equals: userId } },
        { chata: { equals: chataId } },
        { status: { equals: 'pending' } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const row = rows.docs[0]
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    dateOptionIds: (row.dates || []).map((ref) => Number(refId(ref))),
    accommodationOptionIds: (row.accommodations || []).map((ref) => Number(refId(ref))),
    issue: (row.issue as PendingVoteIssue | null | undefined) ?? null,
    needsApproval: row.autoConfirm !== true,
  }
}

/** "Tohle nejsem já": the account holder throws a pending row away. */
export async function discardPendingVote(
  payload: Payload,
  userId: number,
  pendingVoteId: number,
): Promise<boolean> {
  const rows = await payload.find({
    collection: 'pending-votes',
    where: {
      and: [
        { id: { equals: pendingVoteId } },
        { user: { equals: userId } },
        { status: { equals: 'pending' } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (rows.docs.length === 0) return false
  await payload.update({
    collection: 'pending-votes',
    id: rows.docs[0].id,
    data: { status: 'discarded' },
    overrideAccess: true,
    depth: 0,
  })
  return true
}

/**
 * Where the chata's page lives as seen from `host`: "/" when the host IS
 * one of the chata's domains (subdomain mode), "/<slug>" otherwise.
 */
export function chataPagePath(chata: Pick<Chata, 'slug' | 'domains'>, host: string | null): string {
  const hostname = (host || '').split(':')[0].toLowerCase()
  const owns = (chata.domains || []).some((d) => d.domain?.toLowerCase() === hostname)
  return owns ? '/' : `/${chata.slug}`
}
