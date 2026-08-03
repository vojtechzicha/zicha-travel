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

7. **Users** (`src/collections/Users.ts`)
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
  - `user` (frontend accounts): no write access anywhere, no admin panel
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
  sign-out via `GET /api/auth/logout`. Accounts are created ONLY in admin
  (participant → "Create account from email...",
  `POST /participants/:id/create-account`) and nothing is emailed until the
  person requests a login link themselves. SUPERADMINS never magic-link —
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
  from `VERCEL_GIT_COMMIT_SHA` (package version in dev), sign in/out and an
  admin link
- Overview ("Přehled", `?view=finance-overview`): all participants' summary
  tables on one page for dispute-checking — matrix table (desktop default,
  Σ-kontrola column per row) or cards (mobile default), manual switch
  persisted; open to anonymous visitors by design. Subtle entry link under
  the Finance view; data shaping in `src/lib/financeOverview.ts`
  (unit-tested); `costBreakdown` entries carry `expenseId` for it. See
  `docs/PRD-uzivatele.md`

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
   participants") → pick the banker. Selecting a banker prefills
   `bankerAccountNumber`/`bankerIban` from that participant's banking info
   (`BankerBankingPrefill`, afterInput on the field; only fires on an actual
   change, values stay editable, missing half derived account ↔ IBAN).

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
