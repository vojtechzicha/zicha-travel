/**
 * Czech declension helpers ("skloňování"). Participants can optionally
 * provide their name in other grammatical cases (Participant.akuzativ,
 * Participant.vokativ); every helper falls back to the base nominative
 * name so the extra forms stay optional.
 *
 * English has no declension — the locale-aware variants below return the
 * plain nominative name for any locale other than Czech, so ICU messages
 * can interpolate a pre-declined name: `t('invites', { guest })`.
 */

import type { AppLocale } from '@/i18n/config'

type DeclinableName = { name: string; akuzativ?: string | null }
type GreetableName = { name: string; vokativ?: string | null }

/** Accusative ("koho/co") form of a participant's name, e.g. "Vojta zve Katku". */
export function akuzativName(participant: DeclinableName): string {
  return participant.akuzativ?.trim() || participant.name
}

/** Locale-aware accusative: Czech declines, English keeps the plain name. */
export function accusativeName(participant: DeclinableName, locale: AppLocale): string {
  return locale === 'cs' ? akuzativName(participant) : participant.name
}

/** Vocative ("oslovujeme") form, e.g. "Ahoj, Katko." — Czech only. */
export function vocativeName(participant: GreetableName, locale: AppLocale): string {
  if (locale === 'cs') return participant.vokativ?.trim() || participant.name
  return participant.name
}

/**
 * Map of participant name → accusative form, for places that only carry
 * name strings (e.g. stats costBreakdown entries). Locale-aware: for
 * non-Czech locales the map is identity.
 */
export function akuzativByName(
  participants: DeclinableName[],
  locale: AppLocale = 'cs',
): Map<string, string> {
  return new Map(
    participants.map((p) => [p.name, locale === 'cs' ? akuzativName(p) : p.name]),
  )
}
