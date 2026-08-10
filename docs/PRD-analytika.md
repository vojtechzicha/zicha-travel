# PRD: Analytika a souhlas s cookies

## Motivation

Right now nobody knows whether anything on zicha.travel is used. Features
ship (pozvání, společný účet, přehled, výdaje od účastníků, claim flow) and
the only feedback is somebody complaining in person. Four questions worth
answering:

1. **Reach** — does anyone even open a chata after the link is sent around?
2. **Feature usage** — is the new thing used, or was it built for nobody?
3. **Drop-off** — people start the login / claim / expense wizard; do they
   finish? Where do they bail?
4. **Errors** — a failed save on someone's phone is currently invisible.

"Integrated to solution" here means: **the app owns its event taxonomy, its
consent state and its measurement points**; the vendor behind it is a
swappable detail behind one module. Not: sprinkle a third-party snippet into
`layout.tsx` and hope.

## Non-goals

- Per-chata dashboards for chata admins. Numbers are for the site owner
  (superadmin) only, at least in phase 1.
- Marketing attribution, A/B testing, session replay, heatmaps.
- Any measurement inside the Payload admin panel (`/admin`) — it is a
  back-office tool used by three people.
- Replacing Vercel's own runtime logs / observability.

## Decision: which engine

**PostHog EU Cloud (Frankfurt), behind a first-party `/ingest` proxy and a
thin in-repo wrapper.** Reasoning, given that all four question categories
above are in scope:

| Option                       | Traffic | Feature usage | Funnels          | Errors / vitals | Cookieless mode | Cost                        |
| ---------------------------- | ------- | ------------- | ---------------- | --------------- | --------------- | --------------------------- |
| **PostHog EU Cloud**         | ✅      | ✅            | ✅               | ✅              | ✅ first-class  | free ≤ 1M events/mo         |
| Vercel Web Analytics         | ✅      | custom events | ❌               | ❌              | ✅              | Hobby: 50k events/mo, hard stop |
| Umami Cloud                  | ✅      | ✅            | ❌ (paid plan)   | ❌              | ✅              | free ≤ 100k events/mo       |
| Cloudflare Web Analytics     | ✅      | ❌            | ❌               | ❌              | ✅              | free                        |
| GA4                          | ✅      | ✅            | ✅               | partial         | ❌              | free, but consent-hostile   |
| Own Payload collection       | ✅      | ✅            | build it         | build it        | ✅              | free + every chart is work  |

Why not the free lightweight ones (Umami / Cloudflare): they answer question
1 and half of question 2. Funnels and error tracking — questions 3 and 4,
which the user explicitly asked for — are exactly what they don't do. Two
tools to answer four questions is worse than one.

Why not our own `analytics-events` collection: it is the most "integrated"
option and the most expensive one. Ingest is easy; the analysis UI is not —
funnels, retention, cohorts, time-series with breakdowns are weeks of work
to build badly. It also puts high-write rows on the same pooled Supabase
connection the app depends on. Revisit only if the vendor becomes a problem.

Why PostHog specifically:

- **EU hosting** (Frankfurt) — no third-country transfer discussion, DPA
  available. Matters because this site is used exclusively by Czech users.
- **`cookieless_mode: 'on_reject'`** maps exactly onto the consent model
  chosen below: anonymous pageviews before/without consent, full sessions
  after. No custom glue.
- Funnels, error tracking (`$exception`) and Core Web Vitals in one product.
- Free tier is 1M events/month. This site will produce single-digit
  thousands. It will not outgrow free.

**Escape hatch:** everything the app calls goes through `src/lib/analytics.ts`
(`track('expense_created', {...})`). Swapping the vendor means rewriting that
one file — no component touches `posthog` directly.

**Cost check before implementing:** confirm whether the Vercel project is on
Hobby or Pro — only relevant if we ever also enable Vercel Speed Insights;
PostHog itself is unaffected.

## Consent model

Chosen: **cookieless always-on, cookie only after opt-in.**

### Two states

| State                       | What runs                                                                                | Storage                       |
| --------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| **Default** (no answer yet, or "Jen nezbytné") | Anonymous pageviews + feature events. No cookie, no `localStorage`, no persistent identifier. PostHog derives a daily-rotating pseudonymous id server-side. | none                          |
| **After "Povolit"**         | The same, plus a stable visitor/session id ⇒ funnels, drop-off, returning visitors, error grouping per session. | `zt_consent` + PostHog cookies |

### Legal basis

- Storing/reading anything on the device requires consent (ePrivacy →
  zákon č. 127/2005 Sb. o elektronických komunikacích, § 89 odst. 3 — opt-in
  since 2022). The default state stores **nothing**, so no consent is needed
  for it; the banner asks only for the part that does store something.
- Processing the resulting anonymous aggregates: legitimate interest
  (čl. 6 odst. 1 písm. f GDPR), documented on the privacy page.
- The banner must offer reject with **equal prominence** to accept. Two
  buttons, same size, same visual weight. No dark pattern, no "×" that means
  accept.
- Consent must be as easy to withdraw as to give ⇒ permanent
  "Nastavení soukromí" link in the footer that reopens the banner.

### Cookie details

| Cookie              | Purpose                          | TTL      | Consent needed  |
| ------------------- | -------------------------------- | -------- | --------------- |
| `zt_consent`        | remembers the answer (`granted` / `denied`) | 12 months | no — strictly necessary (it *is* the consent record) |
| `ph_*` (PostHog)    | visitor + session id             | 12 months | **yes**         |
| `payload-token`     | login session (already exists)   | 30 d / 2 h | no — strictly necessary |

`zt_consent` is set with `domain=${SESSION_COOKIE_DOMAIN}` (`.zicha.travel`),
the same variable the auth session already uses — otherwise every chata
subdomain would re-ask. Locally (variable unset) it is host-scoped, same as
the session cookie. PostHog is configured with `cross_subdomain_cookie: true`
for the same reason.

Re-prompt after 12 months, and immediately if the cookie list above changes
materially.

## The banner

**Where:** bottom sheet on mobile, bottom-left card on desktop. Glass card
styling consistent with the rest of the frontend (`GlassCard`), rendered via
a portal on `body` — the same `backdrop-filter` clipping problem the expense
lightbox already hit.

**When:** first visit, after the page content has painted (never blocking
first paint, never a full-screen modal — the chata content must be readable
underneath). Not shown on `/admin`.

**Czech copy:**

> **Měření návštěvnosti**
>
> Anonymní statistiky sbíráme vždy — bez cookies a bez toho, abychom věděli,
> kdo jste. Když povolíte cookies, uvidíme navíc, jestli se něco nedokončí
> nebo nerozbije, a budeme to umět spravit.
>
> [ Povolit ] [ Jen nezbytné ]   ·   [Více o soukromí](/soukromi)

**Footer:** new link "Nastavení soukromí" next to "Administrace", reopens the
banner with the current choice preselected.

**Privacy page** (`/soukromi`, new): what is measured, what is explicitly
never measured (list below), who the processor is (PostHog, EU/Frankfurt),
retention, how to withdraw consent, contact. Linked from the banner and the
footer.

## Event taxonomy

Names are `snake_case`, English, defined as a union type in
`src/lib/analytics.ts` so a typo is a compile error. Every event carries the
common properties:

| property  | values                                              |
| --------- | --------------------------------------------------- |
| `chata`   | chata **slug** (never id, never name)                |
| `role`    | `anonymous` \| `user` \| `admin` \| `superadmin`     |
| `surface` | `mobile` \| `desktop` (from viewport, not UA sniffing) |

### 1. Traffic & reach

- `$pageview` — captured **manually**, not automatically (see integration
  notes: the frontend rewrites the URL via `history.pushState` on every view
  and participant change, which would produce phantom pageviews).
- Properties: sanitized `$current_url`, referrer host only, device class.
- Answers: visits per chata per day, how many distinct visitors, where the
  link was opened from, phone vs desktop split.

### 2. Feature usage

| event                 | fired when                                        | extra props            |
| --------------------- | ------------------------------------------------- | ---------------------- |
| `view_opened`         | Header nav switches view                          | `view` (finance / information / organization / participants / finance-overview) |
| `overview_opened`     | "Přehled" entry link under Finance                | `layout` (matrix / cards) |
| `breakdown_expanded`  | fair-share breakdown expanded in PersonView       | —                      |
| `settlement_viewed`   | SettlementActions rendered for a debtor/creditor  | `side` (debtor / creditor) |
| `qr_payment_shown`    | QR code rendered                                  | —                      |
| `expense_attachment_opened` | receipt thumbnail / PDF chip opened         | `kind` (image / pdf)   |
| `login_link_clicked`  | any entry into `/login`                           | `from`                 |

Answers: "does anyone use the thing I built last month."

### 3. Funnels & drop-off

Only meaningful with a session id ⇒ these are effectively consent-gated
(without consent the id rotates daily, so same-day funnels still work, which
is good enough).

- **Expense wizard:** `expense_compose_started` (`entry`: photo / manual) →
  `expense_compose_step` (`step`: 1–3, `split_mode`) →
  `expense_created` | `expense_compose_abandoned`.
- **Login:** `login_started` (`method`: magic-link / microsoft) →
  `login_link_requested` → `login_completed`.
- **Claim:** `claim_started` → `claim_submitted` → `claim_resolved`
  (`outcome`: auto-approved / pending). (Lands with the claim feature; the
  collection is not on `main` yet.)

### 4. Errors & performance

- `$exception` — client-side autocapture, plus explicit
  `posthog.captureException` in the frontend error boundary.
- `save_failed` — explicit, on every failed write from the frontend
  (expense create/update/delete, attachment upload, claim submit) with
  `{ operation, status, code }`. **Never the response body** — it can contain
  names or emails.
- `$web_vitals` — PostHog's `capture_performance.web_vitals`, so LCP/CLS/INP
  on real phones are visible without paying for Speed Insights.

## Privacy rules — what must never leave the app

Non-negotiable, enforced in `src/lib/analytics.ts`, not by convention:

1. **No names, no emails, no phone numbers, no bank account / IBAN.**
2. **No participant ids and no user ids.** This is subtle and important: the
   public read API resolves a participant id to a real name, so a
   participant id *is* a direct identifier, not a pseudonym.
3. **No amounts in Kč.** Who owes whom is the most sensitive thing here. If
   an expense-size signal is ever wanted, send a bucket (`<500`,
   `500–2000`, `>2000`), not the number.
4. **URL scrubbing is mandatory.** `?participant=`, `?claim=`, `?token=`,
   `?returnTo=` are stripped from `$current_url`, `$referrer` and
   `$pathname` in a `before_send` hook before anything is transmitted. The
   participant id lives in the URL on every finance view, so without this
   rule 90 % of pageviews would leak an identifier.
5. **Never call `posthog.identify()`.** Users stay anonymous; `role` is a
   coarse property, not an identity.
6. **No autocapture of DOM text.** `autocapture: false` — the app renders
   names and amounts as ordinary text and PostHog's autocapture would ship
   element content.
7. **Nothing is captured from `/admin`,** from preview deployments, or in
   local dev.

Point 7 mirrors the existing `src/lib/email.ts` rule that preview
deployments must never touch real recipients — same principle, applied to
real analytics data.

## Integration in the codebase

New:

- `src/lib/consent.ts` — read/write `zt_consent`, a pure
  `resolveConsent(cookieValue, now)` helper. Unit-tested.
- `src/lib/analytics.ts` — the event union type, common-property builder,
  `sanitizeUrl()`, `track()`, `trackPageview()`. The pure parts
  (`sanitizeUrl`, property builder, PII guard) unit-tested in
  `tests/int/analytics.int.spec.ts` — same pattern as `expenseAuthoring.ts`
  and `financeAccess.ts`.
- `src/app/(frontend)/components/AnalyticsProvider.tsx` — `'use client'`,
  initialises posthog-js once, wires consent state, renders nothing.
- `src/app/(frontend)/components/ConsentBanner.tsx` — the banner + the
  footer-triggered reopen.
- `src/app/(frontend)/soukromi/page.tsx` — privacy page.
- `src/app/(frontend)/error.tsx` — error boundary that reports `$exception`.

Changed:

- `src/app/(frontend)/layout.tsx` — mount `AnalyticsProvider` +
  `ConsentBanner` inside the frontend route group **only**, so `/admin`
  (a different route group) is untouched by construction.
- `src/app/(frontend)/components/Footer.tsx` — "Nastavení soukromí" link.
- `src/app/(frontend)/components/ChataView.tsx` — `trackPageview()` on
  `handleViewChange`, plus `view_opened`. Automatic history-change capture
  stays **off**: `handleParticipantChange` calls `history.replaceState` on
  every participant switch and would otherwise register as a pageview
  carrying a participant id.
- `ExpenseComposer.tsx`, `LoginCard.tsx`, `SettlementActions.tsx`,
  `QRPayment.tsx`, `FinanceOverview.tsx`, `ExpenseCard.tsx` — one `track()`
  call each, at the points listed in the taxonomy.
- `next.config.mjs` — rewrite `/ingest/:path*` → `https://eu.i.posthog.com/:path*`
  (and `/ingest/static/:path*` → `eu-assets.i.posthog.com`). First-party
  requests: not blocked by ad blockers, no third-party cookie problems, no
  extra DNS lookup on mobile.
- `middleware.ts` — **add `ingest` to the matcher exclusion.** Otherwise
  every analytics beacon triggers a domain lookup (and a `fetch` back into
  the deployment) in middleware. This is a correctness issue, not an
  optimisation.

## Environment variables

Gated exactly like `RESEND_API_KEY`, `S3_ENDPOINT` and
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` already are — unset means the feature is
inert, so local dev needs no setup:

| variable                     | where            | effect                                        |
| ---------------------------- | ---------------- | --------------------------------------------- |
| `NEXT_PUBLIC_POSTHOG_KEY`    | Vercel production | unset ⇒ no analytics, **and no cookie banner** |
| `NEXT_PUBLIC_POSTHOG_HOST`   | optional         | defaults to `/ingest`                          |

Capture additionally requires `VERCEL_ENV === 'production'`, so preview
deployments never pollute the dataset. The banner is hidden when analytics
is off — a cookie banner with no cookies behind it is noise.

## Rollout

1. **Consent infrastructure** — `consent.ts`, banner, footer link, privacy
   page. Ships alone, measures nothing. Verifies the banner behaves across
   subdomains before any data flows.
2. **Traffic** — provider, `/ingest` proxy, middleware fix, manual
   pageviews, `view_opened`. First real numbers.
3. **Feature usage + funnels** — the remaining `track()` calls.
4. **Errors & vitals** — error boundary, `save_failed`, web vitals.

## Decided edge cases

- **Consent cookie missing but PostHog cookies present** (user cleared one
  half): treat as no consent, re-ask, and call `posthog.opt_out_capturing()`
  which clears its own cookies.
- **Anonymous visitor on a locked participant's chata**: nothing special —
  no participant id is ever sent anyway (rule 2).
- **Multiple chata subdomains**: one consent decision covers all of them via
  the shared cookie domain; `chata` is a property, not a separate project.
- **Ad blockers** blocking `/ingest`: accepted. Undercounting is fine; the
  questions are directional, not accounting.
- **Bot traffic**: PostHog filters known bots by default; link-preview
  fetchers (WhatsApp, Messenger) run no JS and never register.
- **`prefers-reduced-motion`**: banner slides in without animation.

## Open question

Chata admins currently have no way to see "kolik lidí se na to podívalo" —
PostHog access is superadmin-only. If that turns out to matter, phase 5 is a
single aggregate number per chata, read from the PostHog query API server-side
and rendered in the chata view. Deliberately deferred: it is speculative
until someone asks.
