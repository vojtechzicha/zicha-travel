/**
 * Rolling session refresh (the "stay signed in on the installed app"
 * piece): POST /api/auth/refresh re-signs the payload-token cookie for its
 * full role-based duration whenever the current token is old enough to be
 * worth replacing. An account that opens the app at least once per token
 * lifetime therefore never sees a login screen again; a stolen or
 * abandoned token still dies at its own absolute expiry.
 *
 * Pure decision logic here, unit-tested in
 * tests/int/sessionRefresh.int.spec.ts; the route does the JWT and cookie
 * work.
 */

/** Don't bother re-signing tokens younger than this — keeps the endpoint a
 *  cheap no-op for rapid repeat calls. */
export const REFRESH_MIN_AGE_SECONDS = 15 * 60

/**
 * Whether a verified token should be replaced by a fresh full-duration one.
 * `iat`/`exp` are JWT seconds; `nowMs` is Date.now(). An expired token
 * never refreshes (jwt.verify refuses it before we get here — this guard
 * is for callers passing decoded values around).
 */
export function shouldRefreshSessionToken(
  { iat, exp }: { iat?: number; exp?: number },
  nowMs: number,
): boolean {
  if (typeof iat !== 'number' || typeof exp !== 'number') return false
  const nowSeconds = Math.floor(nowMs / 1000)
  if (exp <= nowSeconds) return false
  return nowSeconds - iat >= REFRESH_MIN_AGE_SECONDS
}
