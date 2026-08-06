// Who may open whose Finance view ("finance") — pure logic shared by the
// slug API (computing the viewer + locked list) and the FinanceView UI
// (filtering the participant selector). Rules:
// - superadmin / admin of this chata: every participant is selectable, the
//   selector defaults to their own linked participant (if any)
// - signed-in user with participant(s) in this chata: ONLY their own
//   participants (one user may own several, e.g. a parent and children)
// - anonymous visitors (and signed-in users without a participant here):
//   everyone except LOCKED participants — those whose account is ACTIVE
//   (has logged in at least once). Inactive accounts change nothing, so a
//   participant never silently disappears before their owner ever signed in.
//   Locked participants still show greyed-out with a masked-email hint.
//
// This is a UI/UX boundary, not data security — the finance API stays
// public like every other read endpoint in this project.

export interface FinanceViewer {
  /** a session cookie resolved to a user */
  authenticated: boolean
  email: string | null
  /** the signed-in user's id — matched against Expense.authoredBy to show
   *  the "Přidali jste vy" footer with edit/delete on own expenses */
  userId: number | null
  /** superadmin, or admin with this chata assigned */
  canViewAll: boolean
  /** this user's participants in THIS chata (a user may own several) */
  linkedParticipantIds: number[]
}

/** A participant hidden from anonymous visitors: account owner is active. */
export interface LockedParticipant {
  id: number
  /** e.g. "d***.n***@g***.com" — enough for the owner to recognise it */
  maskedEmail: string
}

export const anonymousViewer: FinanceViewer = {
  authenticated: false,
  email: null,
  userId: null,
  canViewAll: false,
  linkedParticipantIds: [],
}

interface ParticipantLike {
  id: number
}

const toIdSet = (locked: ReadonlyArray<LockedParticipant | number>): Set<number> =>
  new Set(locked.map((l) => (typeof l === 'number' ? l : l.id)))

/** Participants the viewer may open in the Finance view. */
export function selectableParticipants<T extends ParticipantLike>(
  viewer: FinanceViewer,
  participants: T[],
  locked: ReadonlyArray<LockedParticipant | number> = [],
): T[] {
  if (viewer.canViewAll) return participants
  if (viewer.linkedParticipantIds.length > 0) {
    const own = participants.filter((p) => viewer.linkedParticipantIds.includes(p.id))
    if (own.length > 0) return own
  }
  const lockedIds = toIdSet(locked)
  return participants.filter((p) => !lockedIds.has(p.id))
}

/** Pre-selected participant: the viewer's first own one, when linked here. */
export function defaultParticipantId(viewer: FinanceViewer): number | null {
  return viewer.linkedParticipantIds[0] ?? null
}

/** Whether the "change participant" affordance makes sense for this viewer. */
export function canSwitchParticipant(
  viewer: FinanceViewer,
  participants: ParticipantLike[],
  locked: ReadonlyArray<LockedParticipant | number> = [],
): boolean {
  return selectableParticipants(viewer, participants, locked).length > 1
}

/**
 * Mask an email for the "locked participant" hint:
 * "daniel.novak@gmail.com" → "d***.n***@g***.com". Keeps the first letter
 * of every dot-separated part and the TLD — recognisable to the owner,
 * useless to anyone else.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  const maskPart = (part: string): string => (part.length > 0 ? `${part[0]}***` : part)
  const local = email
    .slice(0, at)
    .split('.')
    .map(maskPart)
    .join('.')
  const domainParts = email.slice(at + 1).split('.')
  const domain =
    domainParts.length > 1
      ? [...domainParts.slice(0, -1).map(maskPart), domainParts[domainParts.length - 1]].join('.')
      : maskPart(domainParts[0])
  return `${local}@${domain}`
}
