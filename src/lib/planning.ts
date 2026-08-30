// Pure rules of the planning phase ("Plánujeme" — docs/PRD-planovani.md):
// which accommodation options a date selection admits, whether a vote
// submission is valid, who may see the results, and the tallies the
// results view renders. Shared by the trip-votes submit endpoint, the slug
// API and the frontend; unit-tested in tests/int/planning.int.spec.ts.

export interface PlanningDateOption {
  id: number
  label: string
  dateFrom: string
  dateTo: string
  note?: string | null
}

export interface PlanningAccommodationOption {
  id: number
  name: string
  locationNote?: string | null
  url?: string | null
  description?: string | null
  imageUrl?: string | null
  /** empty = available for every date option */
  dateOptionIds: number[]
}

/** One participant's vote as the slug API ships it (ids only). */
export interface PlanningVote {
  participantId: number
  dateOptionIds: number[]
  accommodationOptionIds: number[]
}

export interface PlanningPayload {
  enabled: boolean
  intro: string | null
  dateOptions: PlanningDateOption[]
  accommodations: PlanningAccommodationOption[]
  /** anonymous-safe headcount — how many people voted */
  voteCount: number
  /** per-person votes; null for viewers who may not see results */
  votes: PlanningVote[] | null
  /** ids of date options the viewer's own participants voted (empty = no vote yet) */
  viewerVoted: boolean
  /** the signed-in viewer's vote that could not be confirmed at sign-in
   *  (docs/PRD-planovani.md, "Nepotvrzené hlasy"); null otherwise */
  pendingVote: PendingVoteIntent | null
}

/**
 * Whether an accommodation can be picked given the currently selected date
 * options. An accommodation with NO explicit dates is available for every
 * date; otherwise at least one selected date must be among its dates. With
 * no dates selected yet, everything shows as available (the date step
 * decides first).
 */
export function accommodationAvailableFor(
  accommodation: Pick<PlanningAccommodationOption, 'dateOptionIds'>,
  selectedDateIds: Array<number | string>,
): boolean {
  if (accommodation.dateOptionIds.length === 0) return true
  if (selectedDateIds.length === 0) return true
  const selected = new Set(selectedDateIds.map(String))
  return accommodation.dateOptionIds.some((id) => selected.has(String(id)))
}

export type VoteSelectionError =
  | 'no-dates'
  | 'unknown-date'
  | 'unknown-accommodation'
  | 'accommodation-unavailable'

/**
 * Validates the id selection of a vote against the chata's options. The
 * date selection must be non-empty (voting IS the "I'm coming" — someone
 * who can make no date simply doesn't vote); every id must belong to the
 * chata; every picked accommodation must be available on at least one
 * picked date. Accommodations may be empty (no preference).
 */
export function validateVoteSelection(args: {
  dateOptionIds: Array<number | string>
  accommodationOptionIds: Array<number | string>
  dateOptions: Array<Pick<PlanningDateOption, 'id'>>
  accommodations: Array<Pick<PlanningAccommodationOption, 'id' | 'dateOptionIds'>>
}): VoteSelectionError | null {
  if (args.dateOptionIds.length === 0) return 'no-dates'
  const knownDates = new Set(args.dateOptions.map((d) => String(d.id)))
  if (!args.dateOptionIds.every((id) => knownDates.has(String(id)))) return 'unknown-date'
  const byId = new Map(args.accommodations.map((a) => [String(a.id), a]))
  for (const id of args.accommodationOptionIds) {
    const accommodation = byId.get(String(id))
    if (!accommodation) return 'unknown-accommodation'
    if (!accommodationAvailableFor(accommodation, args.dateOptionIds)) {
      return 'accommodation-unavailable'
    }
  }
  return null
}

/**
 * Results gating (docs/PRD-planovani.md): chata admins and viewers with a
 * linked participant in this chata see who voted and how; everyone else
 * only the anonymous headcount.
 */
export function canSeePlanningResults(viewer: {
  canViewAll: boolean
  linkedParticipantIds: number[]
}): boolean {
  return viewer.canViewAll || viewer.linkedParticipantIds.length > 0
}

export interface PlanningTallyRow {
  id: number
  count: number
  /** share of voters, 0..1 (0 when nobody voted) */
  share: number
  leading: boolean
}

export interface PlanningTally {
  total: number
  dates: PlanningTallyRow[]
  accommodations: PlanningTallyRow[]
}

/**
 * Vote counts per option, in the option order given. `leading` marks every
 * option tied for the top NON-ZERO count, so the results view can badge
 * the current favourite(s).
 */
export function tallyVotes(
  votes: PlanningVote[],
  dateOptions: Array<Pick<PlanningDateOption, 'id'>>,
  accommodations: Array<Pick<PlanningAccommodationOption, 'id'>>,
): PlanningTally {
  const total = votes.length
  const rows = (
    optionIds: number[],
    picked: (vote: PlanningVote) => Array<number | string>,
  ): PlanningTallyRow[] => {
    const counts = new Map<string, number>(optionIds.map((id) => [String(id), 0]))
    for (const vote of votes) {
      for (const id of picked(vote)) {
        const key = String(id)
        if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    const top = Math.max(0, ...counts.values())
    return optionIds.map((id) => {
      const count = counts.get(String(id)) ?? 0
      return {
        id,
        count,
        share: total > 0 ? count / total : 0,
        leading: count > 0 && count === top,
      }
    })
  }
  return {
    total,
    dates: rows(
      dateOptions.map((d) => d.id),
      (vote) => vote.dateOptionIds,
    ),
    accommodations: rows(
      accommodations.map((a) => a.id),
      (vote) => vote.accommodationOptionIds,
    ),
  }
}

/**
 * The hero "Kdy" line from the candidate windows: "říjen 2026",
 * "říjen nebo listopad 2026" (two months), "říjen až prosinec 2026" (a
 * longer stretch). The year appears once when shared. Null with no options.
 */
export function planningMonthsLabel(
  options: Array<Pick<PlanningDateOption, 'dateFrom'>>,
  locale: 'cs' | 'en' = 'cs',
): string | null {
  if (options.length === 0) return null
  const tag = locale === 'cs' ? 'cs-CZ' : 'en-GB'
  const monthName = (d: Date) => new Intl.DateTimeFormat(tag, { month: 'long' }).format(d)
  const seen = new Map<string, { date: Date; year: number }>()
  for (const option of options) {
    const date = new Date(option.dateFrom)
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`
    if (!seen.has(key)) seen.set(key, { date, year: date.getUTCFullYear() })
  }
  const months = [...seen.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
  const sameYear = months.every((m) => m.year === months[0].year)
  const named = months.map((m) => (sameYear ? monthName(m.date) : `${monthName(m.date)} ${m.year}`))
  const joiner = locale === 'cs' ? ' nebo ' : ' or '
  const rangeJoiner = locale === 'cs' ? ' až ' : ' to '
  let joined: string
  if (named.length === 1) joined = named[0]
  else if (named.length === 2) joined = named.join(joiner)
  else joined = `${named[0]}${rangeJoiner}${named[named.length - 1]}`
  return sameYear ? `${joined} ${months[0].year}` : joined
}

/** Trimmed voter name, refused when empty or absurdly long. */
export function normalizeVoterName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length === 0 || trimmed.length > 100) return null
  return trimmed
}

// ---------------------------------------------------------------------------
// Who a vote belongs to. Shared by the submit endpoint (signed-in voters),
// the pending-vote confirmation that runs at sign-in, and the OAuth path's
// pre-check. Pure so the name rule is tested once.

export interface VoterCandidate {
  id: number
  name: string
  /** the account the participant is linked to, if any */
  accountId: number | string | null
}

export type VoterResolution =
  | { kind: 'linked'; participantId: number }
  | { kind: 'create'; name: string }
  | { kind: 'name-taken' }
  | { kind: 'name-required' }
  | { kind: 'forbidden' }

/**
 * Which participant a signed-in account votes as: the participant it
 * asked for (`participantId`, must be one of its own — an account may own
 * a parent and children in the same chata), else its first linked
 * participant here (the typed name is then irrelevant), otherwise a new
 * participant with the given name, unless that name is already somebody
 * else's. Never silently takes over an existing participant by name:
 * linking identities is the claim flow's job.
 */
export function resolveVoter(args: {
  participants: VoterCandidate[]
  userId: number | string
  name: string | null | undefined
  participantId?: number | null
}): VoterResolution {
  const user = String(args.userId)
  if (args.participantId != null) {
    const chosen = args.participants.find((p) => p.id === args.participantId)
    if (!chosen || chosen.accountId == null || String(chosen.accountId) !== user) {
      return { kind: 'forbidden' }
    }
    return { kind: 'linked', participantId: chosen.id }
  }
  const linked = args.participants.find(
    (p) => p.accountId != null && String(p.accountId) === user,
  )
  if (linked) return { kind: 'linked', participantId: linked.id }
  const name = normalizeVoterName(args.name)
  if (!name) return { kind: 'name-required' }
  const clash = args.participants.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())
  if (clash) return { kind: 'name-taken' }
  return { kind: 'create', name }
}

/**
 * Human-readable summary of a selection (email, confirm page): option
 * labels in the order picked; ids the chata no longer has are dropped.
 */
export function describeVoteSelection(
  selection: { dateOptionIds: Array<number | string>; accommodationOptionIds: Array<number | string> },
  dateOptions: Array<Pick<PlanningDateOption, 'id' | 'label'>>,
  accommodations: Array<Pick<PlanningAccommodationOption, 'id' | 'name'>>,
): { dates: string[]; places: string[] } {
  const dateById = new Map(dateOptions.map((d) => [String(d.id), d.label]))
  const placeById = new Map(accommodations.map((a) => [String(a.id), a.name]))
  return {
    dates: selection.dateOptionIds
      .map((id) => dateById.get(String(id)))
      .filter((label): label is string => Boolean(label)),
    places: selection.accommodationOptionIds
      .map((id) => placeById.get(String(id)))
      .filter((name): name is string => Boolean(name)),
  }
}

/** The viewer's own unconfirmed vote here, as the slug API ships it. */
export interface PendingVoteIntent {
  id: number
  name: string
  dateOptionIds: number[]
  accommodationOptionIds: number[]
  /** why confirmation at sign-in could not finish (null = not tried yet) */
  issue: PendingVoteIssue | null
  /** filed anonymously against an account that already existed: the
   *  person must look at it before it counts (docs/PRD-planovani.md) */
  needsApproval: boolean
}

export type PendingVoteIssue = 'name-taken' | 'planning-closed' | 'invalid-selection'
