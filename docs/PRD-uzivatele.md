# PRD: Uživatelé a přihlašování (user accounts & auth redesign)

## Goals

1. The **admin panel** is only for admin roles; admins are either
   **superadmins** (all chatas) or **admins of some chatas**.
2. **Frontend users** sign in via **magic link** (email = username) and/or a
   **Microsoft account** (Google later). A signed-in user is linked to a
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

- `participants.account` — relationship to `users`. A person repeats across
  chatas as separate participants, so one user may be linked from several
  participants, but **at most one participant per chata** (beforeValidate
  hook; application-level like the chata+name uniqueness).
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
2. The verify route consumes the token (one-time), sets the session cookie
   and redirects to `returnTo`.

### Microsoft OAuth

`/api/auth/login?returnTo=/...` → Microsoft → `/api/auth/callback`. The
`oauth-return-to` cookie marks a frontend-initiated flow: errors then land on
`/login?error=...` instead of `/admin/login?error=...`, and after login the
user returns to `returnTo` (role `user` never lands in `/admin`). The account
must already exist (`unauthorized` otherwise).

### Sign out

`GET /api/auth/logout?returnTo=/` clears the cookie (footer link).

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
`viewer`: `{ authenticated, email, canViewAll, linkedParticipantId }`.
`src/lib/financeAccess.ts` (unit-tested in
`tests/int/financeAccess.int.spec.ts`) turns that into the participant set
the Finance view offers:

- **superadmin / admin of the chata** → all participants, selector defaults
  to their own linked participant (they can switch freely)
- **linked user** → only their own participant, auto-selected, no switching
- **anonymous** (and signed-in users without a participant in that chata) →
  only participants **without** an account; a hint links to `/login` when
  some participants are hidden

The chata selector (multi-chata home) shows a `role: user` visitor only the
chatas where they have a participant. URL/localStorage participant selections
are validated against the allowed set. This is UI gating — the read API stays
public like the rest of the project.

## Footer

`src/app/(frontend)/components/Footer.tsx` (server component, in the frontend
layout): site description, © year, version (`VERCEL_GIT_COMMIT_SHA` short +
environment badge, falling back to the package version in dev), current
user's email, Administrace link (admin roles), and sign in/out links.
