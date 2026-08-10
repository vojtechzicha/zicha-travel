# Chata Expense Tracker - Development Notes

## Project Overview

A Payload CMS-based expense tracking system for managing group trips and shared expenses. Allows participants to track expenses, prepayments, and automatically calculate who owes what.

## Architecture

### Collections

1. **Chatas** (`src/collections/Chatas.ts`)
   - Main entity representing a trip/event
   - Contains banking info, trip details, accommodation info
   - Has an `afterRead` hook that calculates expense statistics
   - References: Participants (banker, bedroom occupants), Users (assignedUsers)

2. **Participants** (`src/collections/Participants.ts`)
   - People involved in a trip
   - Belongs to a specific Chata
   - Contains banking information for settlements
   - Czech declension ("skloňování"): optional `akuzativ` ("Katku") and
     `vokativ` ("Katko") name forms. Frontend uses the accusative where
     grammar needs it (invitation texts: "Vojta zve Katku", "platíš za
     Katku") via `src/lib/czechNames.ts`, always falling back to `name`;
     `vokativ` is stored for future greetings, not rendered yet
   - "Copy from" prefill (`components/CopyFromParticipantButton.tsx`, UI
     field shown only on create): pick any participant across chatas
     (labelled "Name (Chata)") and prefill name, declension forms and
     banking info — for people who repeat across trips. Trip-specific
     fields (chata, paidBy, hasPet) are never copied
   - Bulk variant on the Chata edit form ("Prefill participants",
     `src/collections/Chatas/components/PrefillParticipantsButton.tsx`):
     multiselect participants from previous chatas →
     `POST /chatas/:id/prefill-participants` creates them as new
     participants of that chata, copying the same fields; names already
     present in the chata are skipped (dedupe is case-insensitive,
     application-level — the compound unique constraint isn't in the DB)
   - `account`: optional link to a frontend user (`users`). A participant
     belongs to at most ONE user; one user may own many participants, even
     in the same chata (parent + children). The edit form offers "Create
     account from email..." (`POST /participants/:id/create-account`) —
     creates/links a `role: user` account without sending any email
   - `paidBy` ("platí za něj/ni"): standing arrangement — this participant's
     expense shares are covered by another participant (e.g. a child).
     Materialized as `auto: true` invitation rows on expenses: a create hook
     adds them to new expenses; the "apply retroactively" button
     (`POST /participants/:id/apply-paid-by`) reconciles existing ones.
     Sync logic in `src/utils/paidByInvitations.ts`. See `docs/PRD-pozvani.md`

3. **Expenses** (`src/collections/Expenses.ts`)
   - Individual expenses paid by participants
   - Supports equal split (ALL) or weighted split
   - References: Chata, Participant (payer), Participants (weights)
   - `attachments` ("účtenky"): hasMany upload → `ExpenseAttachments`.
     Shown on the expense card as small thumbnails (images open a lightbox,
     portaled to `body` — glass-card `backdrop-filter` would clip
     `position: fixed`) and PDF chips
   - `invitations` array ("pozvání"): `{ host, guest, auto }` rows — the
     host covers the guest's share of this expense. A host can invite
     multiple guests; each guest at most once per expense; `host ≠ guest`
     (validated). Participants only. `auto: true` marks standing rows
     managed from `Participant.paidBy` (hidden on the expense card; only
     manual one-off invites show a badge). See `docs/PRD-pozvani.md`
   - **Frontend authoring** ("výdaje od účastníků"): signed-in frontend
     accounts (role `user`) may create expenses and edit/delete their OWN
     ones. `authoredBy` (relationship to `users`, `maxDepth: 0` so the
     public read API never populates the user/email) is stamped by a
     beforeChange hook on every authenticated create; the same hook
     enforces for role `user`: chata must contain one of their linked
     participants, the payer must be an own participant or a joint account
     they belong to (unchanged payer is exempt on update), and the chata
     can never be moved. Pure rules live in `src/lib/expenseAuthoring.ts`
     (unit-tested in `tests/int/expenseAuthoring.int.spec.ts`). UI:
     `ExpenseComposer.tsx` — mobile 3-step wizard (bottom-sheet entry
     "Vyfotit účtenku"/"Zadat ručně" → co a kolik → kdo se dělí →
     shrnutí s pozváními) and desktop modal, opened from a fixed FAB
     ("Přidat výdaj") in the Finance view; own expense cards get a
     "Přidali jste vy" footer with Upravit/Smazat (inline confirm).
     Split modes: rovným dílem / podíly / přesné částky (weights summing
     to the total; untouched rows auto-absorb the remainder,
     "dopočítáno"). Receipt photos are downscaled client-side
     (`src/lib/imageDownscale.ts`) before the REST upload — Vercel caps
     request bodies at ~4.5 MB. Saving goes through the Payload REST API
     (`POST/PATCH/DELETE /api/expenses`, `POST /api/expense-attachments` —
     attachment create is open to any signed-in account); the slug API's
     `viewer` gained `userId` for the ownership check

4. **Prepayments** (`src/collections/Prepayments.ts`)
   - Money transfers between participants and banker
   - Types: advance, supplement, refund, distribution
   - References: Chata, Participant (from)

5. **JointAccounts** (`src/collections/JointAccounts.ts`)
   - "Společný účet" — a shared bank account of 2+ participants, defined per Chata
   - Can be the payer of an Expense or sender of a Prepayment (both fields are
     polymorphic: `relationTo: ['participants', 'joint-accounts']`)
   - A joint-account payment is attributed **equally** to its members in
     `calculateStats`; all balances and settlement stay per person and no
     payment is ever made to the joint account itself
   - Expense weights stay participants-only by design
   - Validation: min 2 members, each participant in at most one joint account
     per chata
   - See `docs/PRD-spolecny-ucet.md` for the full design and the approved math

6. **ExpenseAttachments** (`src/collections/ExpenseAttachments.ts`)
   - Admin group: System (infrastructure, not day-to-day expense tracking)
   - Upload collection for receipts ("účtenky") attached to expenses —
     images + PDF only, no required alt text, public read (files are
     publicly readable by URL, like all data here)
   - Separate from `media` (icons/backgrounds) so field uploads stay quick;
     `mimeTypes: ['image/*', ...]` keeps the mobile file picker offering
     "Take Photo" — that's the camera path, no custom admin component
   - No generated `imageSizes`: with S3 `clientUploads` the file bypasses
     the server, so sharp resizing would only run on some deployments; the
     frontend renders originals scaled down with `loading="lazy"` instead
   - S3 plugin: registered with prefix `expense-attachments`;
     `clientUploads: true` (plugin-wide) uploads straight from the browser
     to the bucket — Vercel serverless caps request bodies at ~4.5 MB,
     which phone photos exceed. No effect where the plugin is disabled
     (Fly / local dev)
   - Schema DDL appended to `scripts/migrate-payer-polymorphic.mjs`
     (`NEW_SCHEMA_DDL`) so both platforms create the table on deploy;
     includes the plugin's `prefix` column (S3-enabled shape)

7. **ClaimRequests** (`src/collections/ClaimRequests.ts`)
   - "Žádosti o propojení" — a signed-in account claiming a participant as
     themselves ("Jsi to ty?"); admin approval links `Participant.account`
   - Claimable = participant not locked (no account, or a never-logged-in
     one); a pending claim does NOT lock the participant — rival requests
     coexist and approving one auto-rejects the rest (with emails)
   - Auto-approval ("známá tvář"): only a linked participant in a DIFFERENT
     chata + an unlinked target — same-chata links never auto-approve.
     Chata admins auto-approve themselves. Pure rules in
     `src/lib/claimRequests.ts` (unit-tested), side effects in
     `src/utils/claimRequests.ts`, driven by collection hooks so the decide
     endpoint, admin panel and auto-approval share one code path
   - Decide links in admin emails are per-recipient JWTs (7 days) leading
     to `/claims/decide` — the decision is a POST (mail scanners prefetch
     GETs). Rejection requires a reason (emailed). Read access NOT public
     (rows link user emails); daily cron `/api/claim-requests/remind`
     (`CRON_SECRET`) nudges admins once after 3 days. See `docs/PRD-claim.md`

8. **Users** (`src/collections/Users.ts`)
   - Roles: `superadmin` (everything), `admin` (only their `assignedChatas`),
     `user` (frontend only — NO admin-panel access, gated by `access.admin`)
   - Frontend users are linked from `Participant.account`; the Users form
     shows the links via a `participants` join field
   - Auth: always-registered `app-jwt` cookie strategy (JWT signed with
     `PAYLOAD_SECRET`) shared by Microsoft OAuth AND magic-link logins;
     local email+password strategy only exists where OAuth env vars are
     unset (dev bootstrap). Magic-link state lives in hidden
     `loginToken`/`loginTokenExpires` fields (sha256 hash, 15min TTL)
   - See `docs/PRD-uzivatele.md` for the full auth/roles design

### Utilities

**calculateStats** (`src/utils/calculateStats.ts`)
- Core expense calculation logic
- Calculates per-participant balances
- Determines debtors and creditors
- Handles both equal and weighted expense splits
- `costBreakdown` includes `title`, `cost`, and `weight` for each expense
- Joint-account ("společný účet") payments/prepayments are decomposed into
  equal per-member shares before the per-person math runs; a prepayment share
  from the banker (including the banker's share of a joint-account prepayment)
  is skipped as pot-internal. Covered by `tests/int/calculateStats.int.spec.ts`
  (zero-sum invariant asserted in every fixture)
- `normalizePayerRef`/`transformJointAccount` normalize Payload's polymorphic
  payer/from values for the hook and API routes;
  `populateExpenseParticipants` maps bare participant IDs inside weights and
  invitations to `{ id, name }` (depth-0 reads)
- Invitations ("pozvání"): after the normal split, each guest's ORIGINAL
  share moves to their direct host (single hop — chains don't roll up,
  cycles are harmless). Payment credit is untouched; unknown hosts leave
  the share with the guest so the zero-sum invariant holds. Guest
  breakdown entries get `invitedBy`, host entries `invitedGuest`. See
  `docs/PRD-pozvani.md` for the full design and edge cases

**PersonView** (`src/app/(frontend)/components/PersonView.tsx`)
- Main participant detail/finance view component
- Layout matches the original legacy PoC PersonView
- Summary box with colored background (blue=banker, green=settled/positive, red=negative)
- Includes: prepayment rows, expandable fair share breakdown, result section, history section

### Settlement Threshold

**IMPORTANT**: The system uses a **1 Kč threshold** for determining debtor/creditor/settled status. This is intentional to avoid showing small rounding differences to users.

- **Debtor**: `balance < -1` (owes more than 1 Kč)
- **Creditor**: `balance > 1` (owed more than 1 Kč)
- **Settled**: `Math.abs(balance) <= 1` (within 1 Kč of zero)

This threshold must be consistent across:
- Backend: `src/utils/calculateStats.ts` (debtors/creditors filtering)
- Frontend: `src/app/(frontend)/components/SettlementActions.tsx` (isDebtor/isCreditor/isSettled)
- Frontend: `src/app/(frontend)/components/PersonView.tsx` (isSettled, summaryBgClass logic)

Do NOT change this threshold to smaller values like 0.01 - the 1 Kč threshold is intentional.

## Important Implementation Details

### AfterRead Hook Issue (FIXED)

**Problem**: The Chatas collection has an `afterRead` hook that calculates statistics. This hook was causing the admin panel to hang when clicking on the Chatas collection list.

**Root Cause**:
1. The hook runs on EVERY document in list views, causing expensive operations for each row
2. Using `depth: 1` in queries created circular dependencies: `chata` → `expense` → `participant` → `chata` → infinite loop

**Solution** (`src/collections/Chatas/hooks/afterRead.ts`):
1. Added check for `context?.triggerAfterRead === false` to skip on list views
2. Changed all Payload queries to `depth: 0` to prevent circular relationship population
3. Implemented manual name mapping using a `participantMap` for efficient lookups
4. Eliminated the need for separate banker participant fetch

### Access Control

- **Public read access**: All collections have public read for API consumption
- **Write access** (helpers in `src/lib/access.ts` — used by every collection
  and custom endpoint):
  - `superadmin`: full access; sole manager of Chatas create/delete, Users,
    Backgrounds/Icons/Media
  - `admin`: chata-scoped writes via `Users.assignedChatas` (the legacy
    `chatas.assignedUsers` array was removed; the migration copied its rows
    into `users_rels`)
  - `user` (frontend accounts): no admin panel; the ONE write exception is
    expense authoring — create expenses in chatas where they own a linked
    participant, update/delete only expenses they authored
    (`Expenses.authoredBy`), and upload expense attachments. Enforced in
    the Expenses beforeChange hook via `src/lib/expenseAuthoring.ts`
- **Frontend Finance gating** (`src/lib/financeAccess.ts`, unit-tested):
  the slug API returns a `viewer` + `locked` list; admins of the chata get
  the full participant selector (defaulting to their own linked
  participant), linked users see ONLY their own participant(s), anonymous
  visitors everyone EXCEPT locked participants — accounts that logged in at
  least once (`users.lastLoginAt`). Locked ones stay visible greyed-out with
  a masked-email login hint, so nobody wonders where a name went. UI gating
  only — read APIs stay public

### Auth flows (frontend)

- `/login`: magic link (email → `POST /api/auth/magic-link/request` →
  `GET .../verify`) and Microsoft OAuth (`/api/auth/login?returnTo=...`);
  sign-out via `GET /api/auth/logout`. Accounts are created in admin
  (participant → "Create account from email...",
  `POST /participants/:id/create-account`) or by the claim flow
  (`POST /api/claim-requests/register` — "Jsem tu poprvé", the magic-link
  click doubles as email verification); nothing is emailed until the
  person requests a login link themselves. A claim intent survives login
  via `?claim=<participantId>` in returnTo (`claimReturnTo`).
- Bot protection: Cloudflare Turnstile on the two public POST forms —
  invisible on `/login`, visible in the claim dialog. Gated on
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (both unset in
  local dev = disabled). Verification in `src/lib/turnstile.ts`. SUPERADMINS never magic-link —
  they get an explanatory email instead and the verify route refuses them;
  email+password stays available only while Microsoft OAuth is not
  configured (first-time-setup fallback). Every login stamps
  `users.lastLoginAt` ("active account")
- Email: Resend adapter gated on `RESEND_API_KEY`; ALL sends go through
  `src/lib/email.ts`, which on Vercel PREVIEW deployments redirects mail to
  `EMAIL_PREVIEW_TO` (or only logs it) — real recipients are never contacted
  from previews
- Sessions: `payload-token` cookie, 30 days for `user` / 2 h for admin
  roles; set `SESSION_COOKIE_DOMAIN=.zicha.travel` so one session works
  across chata subdomains (also required for OAuth started on a subdomain)
- Frontend footer (`Footer.tsx` in the frontend layout): site info, version
  from `VERCEL_GIT_COMMIT_SHA` (package version in dev), sign in/out, a help
  link and an admin link
- Help (`src/app/(frontend)/napoveda/`): static server components, linked
  from the footer. `/napoveda` is the hub (per-audience overview, math,
  glossary); the detail guides are `orientace`, `finance`, `vydaje`,
  `ucet`, `prehled` and `sprava`, each walking through the real UI with
  screenshots. Shared pieces in `ui.tsx` (shell, sections, `Steps`,
  `Screenshot`, page cards) and `shots.ts` (screenshot registry with
  intrinsic sizes). Single-chata (subdomain) mode would redirect a
  one-segment path to `/`, so `/napoveda` is in the middleware's
  `SITE_PATHS` allowlist next to `/login` (sub-pages have two segments and
  are unaffected). Keep it in sync when the finance/claim/authoring rules
  change
- Help screenshots (`public/napoveda/*.webp`, ~1.7 MB): shot against a
  made-up demo chata, never real data. `pnpm help:seed` creates
  "Ukázková chata" + demo accounts in the LOCAL database and writes
  `scripts/.help-demo.json` (gitignored); `pnpm help:shots` drives
  Playwright (system Chrome) over a running dev server, capturing at 2×
  and converting to WebP with `cwebp`. `SITE=` overrides the dev-server
  port. Admin-panel shots open demo documents directly so no list view
  can leak real chatas
- Overview ("Přehled", `?view=finance-overview`): all participants' summary
  tables on one page for dispute-checking — matrix table (desktop default,
  Σ-kontrola column per row) or cards (mobile default), manual switch
  persisted; open to anonymous visitors by design. Subtle entry link under
  the Finance view; data shaping in `src/lib/financeOverview.ts`
  (unit-tested); `costBreakdown` entries carry `expenseId` for it. See
  `docs/PRD-uzivatele.md`

### Analytics & cookie consent (`docs/PRD-analytika.md`, all phases)

- Everything is gated on `NEXT_PUBLIC_POSTHOG_KEY` (unset ⇒ no banner, no
  footer link, no provider, local dev needs no setup). Real capture ALSO
  requires `NEXT_PUBLIC_VERCEL_ENV === 'production'` — previews and dev log
  every would-be event to the console as `[analytika] …` instead, so the key
  may safely live on previews to test the instrumentation
- `src/lib/analytics.ts` is the ONLY analytics surface: typed event union
  (typo = compile error), `track()`/`trackPageview()`/`reportException()`,
  ambient context (`chata` slug + coarse `role`, set by ChataView), the
  `surface` prop from the viewport, `sanitizeUrl` (strips `participant`,
  `claim`, `token`, `returnTo`), `referrerHost`, and the `scrubProps` PII
  denylist. Pure parts unit-tested in `tests/int/analytics.int.spec.ts`.
  Components never import `posthog-js`
- `AnalyticsProvider.tsx` initialises posthog-js (production only):
  first-party `/ingest` proxy (rewrites in `next.config.mjs`; `ingest`
  excluded from the middleware matcher; `skipTrailingSlashRedirect` needed
  for its POSTs), `cookieless_mode: 'on_reject'` wired to the consent
  cookie via the `zt:consent-changed` event, `autocapture: false`, manual
  `$pageview` on router navigations + `handleViewChange` (history.pushState
  is invisible to the router), `capture_exceptions` + web vitals.
  `posthog.identify()` is never called
- Funnels: expense wizard (`expense_compose_started/step/created/abandoned`),
  login (`login_started/link_requested/completed` — completed rides the
  one-shot `zt_login_evt` cookie set by both auth success redirects), claim
  (`claim_started/submitted/resolved`). `save_failed` on every failed
  frontend write ({operation, status}, never the response body). The slug
  API `viewer` gained `role` for the analytics role property
- `src/app/(frontend)/error.tsx` — error boundary, reports `$exception`
- `src/lib/consent.ts` (pure, unit-tested in `tests/int/consent.int.spec.ts`):
  `zt_consent` cookie — `granted.<ms>` / `denied.<ms>`, 12-month TTL, older
  or malformed values mean "re-ask". Cookie Domain comes from
  `SESSION_COOKIE_DOMAIN` (same reasoning as the session cookie) so one
  decision covers all chata subdomains; NOT HttpOnly (client writes it)
- `ConsentBanner.tsx` — non-modal (no overlay; content stays usable),
  portaled to `body`, bottom sheet on mobile / bottom-left card on desktop,
  equal-prominence Povolit / Jen nezbytné (legal requirement), reopened via
  the `zt:open-consent` window event from `PrivacySettingsLink` (footer
  "Nastavení soukromí" + button on `/soukromi`), current choice marked on
  reopen; `motion-safe:` animation only. Mounted in the frontend layout ⇒
  `/admin` (separate route group) never sees it
- `/soukromi` — static privacy page (reuses `napoveda/ui` shell, which
  gained an optional hub `icon` prop); in the middleware `SITE_PATHS`
  allowlist next to `/napoveda`

### Relationship Filtering

Collections use `filterOptions` to limit relationship dropdowns:
- Participants filtered by Chata
- Expenses show only participants from the same Chata
- Bedroom occupants filtered by Chata

## Styling Guidelines

This project uses **Tailwind CSS v4** with a CSS-first configuration. Prefer Tailwind for all styling.

### Principles

1. **Use Tailwind classes** for all static styling (layout, spacing, colors, typography)
2. **For dynamic values** (from props), use CSS variables pattern:
   ```tsx
   style={{ '--color': value } as React.CSSProperties}
   className="text-[var(--color)]"
   ```
3. **Keep in CSS file** (`src/app/(frontend)/styles.css`) only:
   - Multi-component reusable classes (used in 2+ files)
   - Complex CSS Grid with `auto-fit`/`minmax`
   - Pseudo-elements (::before, ::after)
   - Custom animations with specific timing functions
   - Pseudo-class styling for scrollbars

### Theme Configuration

Custom theme values are defined in `styles.css` using `@theme`:
- Colors: `--color-primary`, `--color-primary-dark`, `--color-primary-light`
- Fonts: `--font-serif`, `--font-sans`
- Radii: `--radius-glass`, `--radius-glass-lg`

### Custom Utilities

Available in `@layer utilities`:
- `.animate-slideDown` - Slide down animation
- `.max-w-app` - Max width container (1100px)
- `.text-shadow-heading`, `.text-shadow-subheading` - Text shadows for headers

## Database

Using PostgreSQL with `@payloadcms/db-postgres` adapter.

### Production
- **Supabase PostgreSQL** (v17)
- Connection configured in `.env` via `DATABASE_URI`

### Local Development
- **Docker Compose PostgreSQL 16** on port 5433
- Connection configured in `.env.local` (auto-loaded by Next.js, overrides `.env`)
- Data can be synced from production using `pnpm migrate-from-prod`

## Deployment

Production runs on **Vercel** (GitHub integration, deploys `main`;
previews per PR). The Fly.io era is over — the migration history lives in
`docs/VERCEL_MIGRATION.md`.

- Domains: `zicha.travel` plus a **wildcard** `*.zicha.travel` on the
  Vercel project, so a new chata subdomain needs **no** DNS or Vercel
  work — add it to the chata's `domains[]` and the Host-header middleware
  routes it.
- Database: Supabase PostgreSQL via the **pooled** connection
  (`...pooler.supabase.com:6543`) — required for serverless.
- Media: **Supabase Storage** (S3-compatible) through `@payloadcms/storage-s3`,
  gated on `S3_ENDPOINT`; local dev without it falls back to disk.
- DB migrations run automatically during the Vercel build: the
  `vercel-build` script executes `migrate:payer auto` (idempotent) before
  `next build`, against that deployment's own `DATABASE_URI` (prod or preview).
- One-off backfill scripts: `pnpm migrate:media` (filled the Storage bucket
  from the then-live site over public HTTP; idempotent, kept for reference).

## Development Commands

```bash
# Local development (auto-starts/stops Docker PostgreSQL)
pnpm dev              # Start PostgreSQL + Next.js dev server (DB stops on Ctrl+C)
pnpm db               # Start only PostgreSQL in background
pnpm db:stop          # Stop PostgreSQL

# Sync data from production
pnpm migrate-from-prod  # Copy database from production Supabase

# One-time migrations (polymorphic payer + user-roles rename). Production
# runs them automatically: the Vercel build (`vercel-build` script) runs
# `migrate:payer auto` (idempotent) before `next build`. The user-roles part
# renames enum values (admin→superadmin, user→admin, adds new 'user') and
# runs OUTSIDE the main transaction (PostgreSQL enum rules). Locally: run
# `pnpm migrate:payer auto` once BEFORE the first `pnpm dev` on this code,
# so the dev schema push finds the enum already migrated.
pnpm migrate:payer auto|backup|restore|status|cleanup

# Other commands
pnpm build            # Build for production
pnpm generate:types   # Generate TypeScript types from collections
```

**Note:** If you run `pnpm db` first and then `pnpm dev`, the dev script will detect the existing PostgreSQL container and leave it running when you Ctrl+C.

## Known Considerations

1. **Performance**: The afterRead hook fetches all participants, expenses, and prepayments. For very large trips (>1000 items), consider pagination or caching.

2. **Unique Constraints**: Payload 3.x doesn't support compound unique indexes in config. The unique constraint on `chata+participant name` is documented but not enforced at the database level.

3. **Banker Field**: The banker is an optional relationship to Participants,
   so a new Chata is created without one. All participant dropdowns on the
   Chata form (banker, bedroom occupants, car driver/passengers) filter to
   the chata's own participants and show NONE while the chata is unsaved
   (`filterOptions` returns `false` without `data.id`) — never other chatas'
   participants. Flow: save the chata → add participants (e.g. "Prefill
   participants") → pick the banker. Nothing else on the create form is
   required, so that order is actually walkable.

   **The banker's bank account lives on the participant**, not on the chata.
   The chata used to carry its own required `bankerAccountNumber`/`bankerIban`
   (a leftover from the JSON-config import) — which deadlocked create: the
   banker can only be picked after the first save, but the form refused to
   save without their account. Both columns are gone; `PersonView` and
   `/api/chatas/:id/full` read `banker.accountNumber` / `banker.iban`.
   `BankerAccountSummary` (afterInput on the banker field) echoes the
   resolved account read-only and links to the participant when it's missing.
   Migration: `migrateBankerBanking()` in
   `scripts/migrate-payer-polymorphic.mjs` copies the old chata values onto
   the banker participant wherever that participant's own field was empty,
   keeps a full copy in `_migration.chata_banker_banking`, then drops the
   columns. Run `pnpm migrate:payer auto` BEFORE the first `pnpm dev` on this
   code so the backfill happens before Payload's dev push drops the columns.

4. **Partial banking info**: `resolveBankAccount` in
   `src/utils/czechBankAccount.ts` derives the missing half of an
   account-number/IBAN pair. The frontend (PersonView banker box,
   SettlementActions creditor cards) uses it so a participant who filled
   only an IBAN still gets a QR code and both manual-entry rows.

## Future Enhancements

- Add API endpoints for external consumption (`src/app/(payload)/api/`)
- Implement domain-based auto-selection
- Add expense splitting script
- QR code generation for payment requests
- Email notifications for payment reminders

## Migration Notes

See `MIGRATION.md` for details on migrating from the previous PoC implementation.
