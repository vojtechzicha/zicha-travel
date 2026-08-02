/**
 * Czech declension helpers ("skloňování"). Participants can optionally
 * provide their name in other grammatical cases (Participant.akuzativ,
 * Participant.vokativ); every helper falls back to the base nominative
 * name so the extra forms stay optional.
 */

type DeclinableName = { name: string; akuzativ?: string | null }

/** Accusative ("koho/co") form of a participant's name, e.g. "Vojta zve Katku". */
export function akuzativName(participant: DeclinableName): string {
  return participant.akuzativ?.trim() || participant.name
}

/**
 * Map of participant name → accusative form, for places that only carry
 * name strings (e.g. stats costBreakdown entries).
 */
export function akuzativByName(participants: DeclinableName[]): Map<string, string> {
  return new Map(participants.map((p) => [p.name, akuzativName(p)]))
}
