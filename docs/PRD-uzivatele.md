# PRD: Uživatelé a přihlašování (user accounts & auth redesign)

## Goals

1. The **admin panel** is only for admin roles; admins are either
   **superadmins** (all chatas) or **admins of some chatas**.
2. **Frontend users** sign in via **magic link** (email = username) and/or
   OAuth with a **Microsoft, Google or Apple account**. A signed-in user is
   linked to a
   participant and can only open chatas where they take part; the Finance
   view shows only *their* participant.
3. **Anonymous visitors** only see finances of participants **without** an
   account.
4. Accounts are created **in the admin panel** from a participant (email
   required). **No invitation/notification** is sent — the person receives
   email only when they themselves request a login link.
5. On Vercel **preview** deployments no email ever reaches real recipients.
6. The site gains a **footer** with general info, the deployed version and
   sign-in/sign-out.

## Roles (`users.role`)

| Role | Admin panel | Scope |
| --- | --- | --- |
| `superadmin` | yes | everything, all chatas |
| `admin` | yes | only chatas in `assignedChatas` |
| `user` | **no** | frontend only, linked to participant(s) |

- Admin-panel entry is gated by `access.admin` on the Users collection.
- Role changes are superadmin-only (field-level access); users themselves are
  managed by superadmins. Chata admins may still *create/link* frontend
  accounts through the participant endpoint below.
- Helpers live in `src/lib/access.ts` (`isSuperadmin`, `isAdminRole`,
  `chataScopedAccess`, `ownChataAccess`, `canManageChata`) and are used by
  every collection and custom endpoint.

### Database migration (legacy → new)

Legacy values meant: `admin` = all chatas, `user` = assigned chatas.
`scripts/migrate-payer-polymorphic.mjs auto` (run by every Vercel build)
migrates in place, idempotently:

- `ALTER TYPE ... RENAME VALUE`: `admin` → `superadmin`, `user` → `admin`
  (rows keep their meaning; guarded by "does `superadmin` exist yet")
- adds the new `user` enum value and resets the column default to it
  (autocommit statements — PostgreSQL refuses to *use* an enum value added in
  the same transaction, which is also why this step runs outside the main
  migration transaction)
- copies legacy `chatas.assignedUsers` rows into `users.assignedChatas`
  (`users_rels`) and drops `chatas_assigned_users` — access checks read only
  `users.assignedChatas` now
- additive DDL: `users.login_token`, `users.login_token_expires`,
  `participants.account_id` (FK → users, `ON DELETE SET NULL`)

Local dev: run `pnpm migrate:payer auto` once **before** starting `pnpm dev`
with this code, so the dev schema push finds the enum already migrated.

## Linking users to participants

- `participants.account` — relationship to `users`. Cardinality: a
  participant belongs to **at most one user** (single relationship — enforced
  by the schema), while one user may own **any number of participants, even
  in the same chata** (e.g. a parent plus their children).
- Admin flows on the participant edit form:
  - pick an existing user in the `account` field, or
  - "Create account from email..." (`CreateAccountButton`) →
    `POST /api/participants/:id/create-account { email }` — creates a
    `role: user` account (or links an existing one by email) and links it.
    Requires superadmin or admin of that chata. Sends **nothing**.
- The Users collection has a `participants` join field showing the links.

## Login flows

Both flows end the same way: a JWT signed with `PAYLOAD_SECRET` in the
`payload-token` cookie, verified by the always-registered `app-jwt` strategy
(`src/collections/Users.ts`), so one session works for the frontend *and* the
admin panel. Sessions: 30 days for `user`, 2 hours for admin roles
(`src/lib/auth/session.ts`). `SESSION_COOKIE_DOMAIN=.zicha.travel` makes the
cookie work across chata subdomains.

### Magic link

1. `/login` page → `POST /api/auth/magic-link/request { email, returnTo }`.
   Always answers `{ ok: true }` (no account probing). For a known account it
   stores a sha256 token hash + 15min expiry on the user and emails the link
   (`/api/auth/magic-link/verify?token=...`) — built on the requesting host,
   so subdomain visitors stay on their subdomain.
2. The verify route consumes the token (one-time), stamps `lastLoginAt`,
   sets the session cookie and redirects to `returnTo`.
3. **Superadmins never sign in via magic link** — the request route replies
   with the generic ok but emails an explanation instead of a link, and the
   verify route refuses superadmin tokens (`superadmin_oauth` error).
   Superadmins use OAuth (any provider); the local email+password strategy
   exists only where no OAuth provider is configured (first-time setup
   fallback).

### OAuth (Microsoft, Google, Apple)

`/api/auth/login?provider=<id>&returnTo=/...` → the provider → its fixed
callback: `/api/auth/callback` (Microsoft — the original path, so the Azure
registration needs no change), `/api/auth/callback/google`,
`/api/auth/callback/apple`. A missing/unknown `provider` falls back to the
first configured one (Microsoft first), so pre-existing links keep working.
The provider registry lives in `src/lib/auth/providers.ts`; each provider
(`microsoft.ts`, `google.ts`, `apple.ts`) implements the same interface and
the callback handling is shared (`src/lib/auth/oauthCallback.ts`). The
`oauth-return-to` cookie marks a frontend-initiated flow: errors then land on
`/login?error=...` instead of `/admin/login?error=...`, and after login the
user returns to `returnTo` (role `user` never lands in `/admin`). The account
must already exist (`unauthorized` otherwise) — the callback never creates
users, so a "Hide My Email" Apple relay address simply fails as unauthorized.

Apple specifics: no static client secret (a short-lived ES256 JWT signed with
the `.p8` key stands in), `response_mode=form_post` (the callback arrives as
a cross-site POST, so the state cookies for Apple's flow are SameSite=None),
and https-only Return URLs — no localhost, which is why Apple exists only on
preview and production.

### Sign out

`GET /api/auth/logout?returnTo=/` clears the cookie (footer link).

## Preview environment (stable domain)

Superadmins sign in ONLY with OAuth — everywhere, previews included. All
three providers require exact registered redirect URIs (no wildcards), so
ephemeral `*.vercel.app` deployment URLs can never do OAuth. The solution is
a stable preview domain pinned to a branch:

1. **Vercel** → Project → Settings → Domains → add `preview.zicha.travel`
   (DNS is automatic — the zone runs on Vercel nameservers; the explicit
   subdomain beats the `*.zicha.travel` wildcard) → edit the domain and set
   its **Git Branch** to the branch being previewed.
2. **Provider consoles** — register the preview callback alongside the
   production one (same client/credentials everywhere):
   - **Microsoft Entra** → App registrations → the zicha.travel app →
     Authentication → Web → `https://preview.zicha.travel/api/auth/callback`.
   - **Google Cloud Console** → APIs & Services → Credentials → the OAuth
     client → Authorized redirect URIs →
     `https://preview.zicha.travel/api/auth/callback/google` (plus
     `http://localhost:3000/api/auth/callback/google` for local dev).
   - **Apple Developer** → Certificates, Identifiers & Profiles → the
     Services ID → Sign in with Apple → Return URLs →
     `https://preview.zicha.travel/api/auth/callback/apple`. Apple refuses
     http/localhost, so there is no local-dev entry.
3. **Vercel env vars scoped to Preview**: the provider credentials (same
   values as production), each `*_REDIRECT_URI` = its preview callback
   above, the `NEXT_PUBLIC_*_AUTH_ENABLED=true` flags, `EMAIL_PREVIEW_TO` +
   `RESEND_API_KEY`; leave `SESSION_COOKIE_DOMAIN` UNSET in Preview
   (host-only cookie; never share `.zicha.travel` cookies between preview
   and production).

OAuth on previews works only via `preview.zicha.travel`; magic link (for
non-superadmins) works on any URL.

## Email

- Adapter: `@payloadcms/email-resend`, gated on `RESEND_API_KEY`
  (`payload.config.ts`); without it Payload logs mail to the console (local
  dev).
- **Every** send goes through `sendAppEmail` (`src/lib/email.ts`): on Vercel
  preview deployments (`VERCEL_ENV !== 'production'`) the recipient is
  replaced by `EMAIL_PREVIEW_TO` with a `[preview → original]` subject prefix,
  or the mail is only logged when the variable is unset. Real recipients are
  never contacted from previews.

## Frontend behaviour

`GET /api/chatas/slug/:slug` authenticates the request and returns a
`viewer` (`{ authenticated, email, canViewAll, linkedParticipantIds }`) plus
`locked` — participants whose account is **active** (`users.lastLoginAt`
set; stamped on every login by all three flows), each with a masked email
(`maskEmail`: `daniel.novak@gmail.com` → `d***.n***@g***.com`).
`src/lib/financeAccess.ts` (unit-tested in
`tests/int/financeAccess.int.spec.ts`) turns that into the participant set
the Finance view offers:

- **superadmin / admin of the chata** → all participants, selector defaults
  to their own linked participant (they can switch freely)
- **linked user** → only their own participant(s), first one auto-selected;
  switching only among their own when they have several
- **anonymous** (and signed-in users without a participant in that chata) →
  everyone except **locked** participants. An account that never logged in
  hides nothing — people don't mysteriously vanish before their owner is
  active. Locked participants still appear at the bottom of the selector,
  greyed out with a lock icon and the masked email; tapping a tile reveals a
  full-size hint bar ("Finance účastníka X uvidíte po přihlášení e-mailem
  d***.n***@g***.com" + login button), since the in-tile email is tiny.
  Login links carry `?returnTo=<current page>` — and `/login` also falls
  back to the same-origin referrer — so both flows (magic-link email
  included) return the visitor to the page where they started

The chata selector (multi-chata home) shows a `role: user` visitor only the
chatas where they have a participant. URL/localStorage participant selections
are validated against the allowed set. This is UI gating — the read API stays
public like the rest of the project.

## Overview ("Přehled", `?view=finance-overview`)

A subtle link under the Finance view ("Podrobný přehled všech účastníků →")
opens a sub-view showing every participant's "first table" at once, so a
disputed number can be recalculated in one place. Approved design, two
renderings with a persisted manual switch (`localStorage
chata-overview-mode`):

- **Table** (desktop default): one matrix — columns = participants (banker
  first with a blue tint, then Czech-alphabetical), final **Σ kontrola**
  column sums each row. Rows: Zaplaceno za ostatní, signed
  zálohy/doplatky/vratky (banker side negative → row sums to 0), one row per
  actual expense (payer in the label; empty cell = not in the split, green
  0 Kč = invited guest, host cell carries "+ za …"), Útrata celkem, the
  color-coded Výsledek row (Σ = 0 ✓) and verdict pills. Sticky first
  column, horizontal scroll inside the glass card.
- **Cards** (mobile default): per-participant cards with the same rows and
  the fair-share breakdown expanded.

Open to everyone including anonymous visitors (it is the dispute-resolution
page; participant locking applies only to the Finance selector). Planned
expenses are excluded from the per-expense listing but appear as two
aggregate rows whenever they exist, so the visible rows always add up to
the result. Data shaping lives in `src/lib/financeOverview.ts`
(`costBreakdown` entries carry `expenseId` for exact per-expense mapping),
unit-tested in `tests/int/financeOverview.int.spec.ts` against the real
`calculateStats`.

## Footer

`src/app/(frontend)/components/Footer.tsx` (server component, in the frontend
layout): site description, © year, version (`VERCEL_GIT_COMMIT_SHA` short +
environment badge, falling back to the package version in dev), current
user's email, Administrace link (admin roles), and sign in/out links.
