/**
 * Bodies of the /.well-known/* discovery files (RFC 8615). Pure builders so
 * the route handlers under src/app/.well-known/ stay thin and the contents
 * are unit-testable (tests/int/wellKnown.int.spec.ts).
 */

/** Security contact — the address the privacy policy (/soukromi) publishes. */
export const SECURITY_CONTACT = 'mailto:mail@vojtechzicha.com'

/**
 * security.txt (RFC 9116) is generated, not a static file, because the RFC
 * makes `Expires` mandatory and recommends keeping it under a year out — a
 * checked-in file would silently go stale. The expiry rolls 180 days ahead
 * of the request (calendar months would land on nonexistent dates like
 * Feb 30), truncated to midnight UTC so the body only changes once a
 * day (cache-friendly). The origin comes from the request: every host the
 * deployment serves (apex + wildcard chata subdomains) answers with links to
 * itself, the same host-independent posture as robots.ts.
 */
export function securityTxtBody(origin: string, now: Date): string {
  const expires = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
  expires.setUTCHours(0, 0, 0, 0)
  return [
    `Contact: ${SECURITY_CONTACT}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: cs, en',
    `Canonical: ${origin}/.well-known/security.txt`,
    `Policy: ${origin}/soukromi`,
    '',
  ].join('\n')
}

/**
 * microsoft-identity-association.json ties the serving domain to the Azure
 * app registration ("publisher domain" verification — removes the
 * "unverified" wording on the Microsoft consent screen). Its only content is
 * the application (client) ID the deployment already holds as
 * AZURE_CLIENT_ID; null means OAuth isn't configured here and the route
 * answers 404 instead of an empty association.
 */
export function microsoftIdentityAssociation(
  clientId: string | undefined,
): { associatedApplications: { applicationId: string }[] } | null {
  if (!clientId) return null
  return { associatedApplications: [{ applicationId: clientId }] }
}
