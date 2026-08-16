// Fixed-window rate limiting for the public POST endpoints (compliance
// blocker 9): magic-link requests, claim registration and the decide
// endpoints. Pure logic with an injectable clock, unit-tested in
// tests/int/rateLimit.int.spec.ts.
//
// The store is in-memory, which on serverless means per-warm-instance. That
// is an honest limitation, not an accident: it still stops the practical
// abuse (mail-bombing one address, hammering one endpoint from one IP in a
// burst), and the magic-link endpoint ADDITIONALLY has a database-backed
// per-address cooldown (see the request route) that survives cold starts.
// Turnstile remains the first line on both public forms.

export interface RateLimitOptions {
  /** allowed requests per window */
  limit: number
  windowMs: number
}

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Bound the map so a scan of many keys cannot grow memory without limit
const MAX_BUCKETS = 10_000

export interface RateLimitResult {
  allowed: boolean
  /** seconds until the window resets — for the Retry-After header */
  retryAfterSeconds: number
}

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k)
      }
      if (buckets.size >= MAX_BUCKETS) buckets.clear()
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  bucket.count += 1
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

/** Test hook — the store is module-global. */
export function resetRateLimits(): void {
  buckets.clear()
}

/** Standard 429 body + Retry-After header for a refused request. */
export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: 'rate-limited' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } },
  )
}

// Shared knobs so every endpoint states its policy in one place
export const RATE_LIMITS = {
  /** magic-link requests per IP */
  magicLinkPerIp: { limit: 5, windowMs: 15 * 60 * 1000 },
  /** magic-link sends per email address (in-memory layer) */
  magicLinkPerEmail: { limit: 3, windowMs: 15 * 60 * 1000 },
  /** claim submissions/registrations per IP */
  claimPerIp: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** decide-link attempts per IP (claims + expenses) */
  decidePerIp: { limit: 30, windowMs: 60 * 60 * 1000 },
} as const

/** Minimum pause between two magic-link emails to the SAME address —
 *  database-backed via the issue time derived from loginTokenExpires. */
export const MAGIC_LINK_RESEND_COOLDOWN_SECONDS = 60
