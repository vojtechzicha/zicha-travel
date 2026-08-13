// The app's ONLY analytics surface (docs/PRD-analytika.md). Components call
// track()/trackPageview(); the vendor (PostHog) is an implementation detail
// wired up by AnalyticsProvider — swapping it means rewriting this file, not
// touching components.
//
// Capture policy (PRD rule 7, mirroring src/lib/email.ts): real events flow
// ONLY on Vercel production. Previews and local dev log every would-be event
// to the console instead ([analytika] …), so the instrumentation is visible
// and debuggable without polluting the dataset.
//
// Privacy rules enforced HERE, not by convention: no names/e-mails/bank
// data, no participant or user ids, no amounts in Kč, URLs scrubbed of
// identifying params before anything leaves the page.

import type { PostHog } from 'posthog-js'

/** Every event name and its allowed properties — a typo is a compile error. */
export interface AnalyticsEvents {
  // 2. feature usage
  view_opened: { view: string }
  overview_opened: { layout: 'table' | 'cards' }
  breakdown_expanded: Record<string, never>
  settlement_viewed: { side: 'debtor' | 'creditor' }
  qr_payment_shown: Record<string, never>
  expense_attachment_opened: { kind: 'image' | 'pdf' }
  login_link_clicked: { from: string }
  // 3. funnels
  expense_compose_started: { entry: 'photo' | 'manual' }
  expense_compose_step: { step: 1 | 2 | 3; split_mode: string }
  expense_created: { split_mode: string; planned: boolean }
  expense_compose_abandoned: { step: number }
  login_started: { method: 'magic-link' | 'microsoft' }
  login_link_requested: Record<string, never>
  login_completed: { method: string }
  claim_started: Record<string, never>
  claim_submitted: Record<string, never>
  claim_resolved: { outcome: 'auto-approved' | 'pending' }
  // 4. errors
  save_failed: { operation: string; status?: number; code?: string }
}

export type AnalyticsEventName = keyof AnalyticsEvents

export type AnalyticsRole = 'anonymous' | 'user' | 'admin' | 'superadmin'

/** Query params that identify a person or carry secrets — never transmitted.
 *  `participant` is subtle but critical: the PUBLIC read API resolves a
 *  participant id to a real name, so the id itself is a direct identifier. */
const FORBIDDEN_PARAMS = ['participant', 'claim', 'token', 'returnTo']

/** Prop keys that must never appear on an event (defense in depth). */
const FORBIDDEN_PROP_KEYS = new Set([
  'name',
  'email',
  'phone',
  'amount',
  'balance',
  'iban',
  'account',
  'accountnumber',
  'participant',
  'participantid',
  'userid',
  'user_id',
  'participant_id',
])

/** Strip identifying query params; on unparsable input return '' (never leak). */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return ''
  try {
    const parsed = new URL(url, 'http://relative.invalid')
    for (const param of FORBIDDEN_PARAMS) parsed.searchParams.delete(param)
    if (parsed.hostname === 'relative.invalid') {
      return parsed.pathname + parsed.search
    }
    return parsed.toString()
  } catch {
    return ''
  }
}

/** Referrer reduced to its host — the page path someone came from is not our
 *  business, the source site is. */
export function referrerHost(referrer: string | null | undefined): string {
  if (!referrer) return ''
  try {
    return new URL(referrer).host
  } catch {
    return ''
  }
}

/** Drop props whose key is on the denylist — a misuse becomes a silently
 *  missing prop (and a failing unit test), never transmitted PII. */
export function scrubProps<T extends Record<string, unknown>>(props: T): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN_PROP_KEYS.has(key.toLowerCase().replace(/[^a-z_]/g, ''))) continue
    safe[key] = value
  }
  return safe
}

// ── ambient context (set by components that know it) ─────────────────────

interface AnalyticsContext {
  /** chata SLUG — never id, never name */
  chata: string | null
  role: AnalyticsRole
}

const context: AnalyticsContext = { chata: null, role: 'anonymous' }

export function setAnalyticsContext(update: Partial<AnalyticsContext>): void {
  Object.assign(context, update)
}

/** Common properties stamped on every event (pure — unit-tested). */
export function commonProps(
  ctx: AnalyticsContext,
  viewportWidth: number,
): { chata: string | null; role: AnalyticsRole; surface: 'mobile' | 'desktop' } {
  return {
    chata: ctx.chata,
    role: ctx.role,
    // viewport, not UA sniffing — same 850px breakpoint the layout uses
    surface: viewportWidth < 850 ? 'mobile' : 'desktop',
  }
}

// ── capture plumbing ─────────────────────────────────────────────────────

let client: PostHog | null = null

/** AnalyticsProvider hands over the initialised PostHog instance (production
 *  only). Without it, track() logs to the console. */
export function registerAnalyticsClient(posthog: PostHog | null): void {
  client = posthog
}

/** Real capture only on Vercel production — previews and dev log instead. */
export function isCaptureEnvironment(): boolean {
  return process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
}

function send(name: string, props: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const payload = { ...props, ...commonProps(context, window.innerWidth) }
  if (client) {
    client.capture(name, payload)
  } else {
    // preview / local dev: show what WOULD be captured
    console.debug(`[analytika] ${name}`, payload)
  }
}

export function track<N extends AnalyticsEventName>(name: N, props: AnalyticsEvents[N]): void {
  send(name, scrubProps(props))
}

export function trackPageview(): void {
  if (typeof window === 'undefined') return
  send('$pageview', {
    $current_url: sanitizeUrl(window.location.href),
    $referrer: referrerHost(document.referrer),
  })
}

/** Explicit exception reporting (frontend error boundary). */
export function reportException(error: unknown): void {
  if (client) {
    client.captureException(error)
  } else if (typeof window !== 'undefined') {
    console.debug('[analytika] $exception', error)
  }
}
