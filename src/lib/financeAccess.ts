// Who may open whose Finance view ("finance") — pure logic shared by the
// slug API (computing the viewer) and the FinanceView UI (filtering the
// participant selector). Rules:
// - superadmin / admin of this chata: every participant is selectable, the
//   selector defaults to their own linked participant (if any)
// - signed-in user linked to a participant of this chata: ONLY their own
//   participant, auto-selected, no switching
// - anonymous visitors (and signed-in users without a participant here):
//   only participants WITHOUT a linked account
//
// This is a UI/UX boundary, not data security — the finance API stays
// public like every other read endpoint in this project.

export interface FinanceViewer {
  /** a session cookie resolved to a user */
  authenticated: boolean
  email: string | null
  /** superadmin, or admin with this chata assigned */
  canViewAll: boolean
  /** this user's participant in THIS chata, when linked */
  linkedParticipantId: number | null
}

export const anonymousViewer: FinanceViewer = {
  authenticated: false,
  email: null,
  canViewAll: false,
  linkedParticipantId: null,
}

interface ParticipantLike {
  id: number
  account?: number | { id: number } | null
}

export function participantHasAccount(participant: ParticipantLike): boolean {
  return participant.account !== null && participant.account !== undefined
}

/** Participants the viewer may open in the Finance view. */
export function selectableParticipants<T extends ParticipantLike>(
  viewer: FinanceViewer,
  participants: T[],
): T[] {
  if (viewer.canViewAll) return participants
  if (viewer.linkedParticipantId != null) {
    const own = participants.filter((p) => p.id === viewer.linkedParticipantId)
    if (own.length > 0) return own
  }
  return participants.filter((p) => !participantHasAccount(p))
}

/** Pre-selected participant: the viewer's own, when they have one here. */
export function defaultParticipantId(viewer: FinanceViewer): number | null {
  return viewer.linkedParticipantId
}

/** Whether the "change participant" affordance makes sense for this viewer. */
export function canSwitchParticipant(
  viewer: FinanceViewer,
  participants: ParticipantLike[],
): boolean {
  return selectableParticipants(viewer, participants).length > 1
}
