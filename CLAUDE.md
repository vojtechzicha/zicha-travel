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
     `vokativ` feeds the homepage greeting. Both are Czech-only: the
     locale-aware helpers return the plain nominative name in English
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
     participants, the payer must be a participant of that chata, and the
     chata can never be moved. Pure rules live in
     `src/lib/expenseAuthoring.ts`
     (unit-tested in `tests/int/expenseAuthoring.int.spec.ts`). UI:
     `ExpenseComposer.tsx` — mobile 3-step wizard (bottom-sheet entry
     "Vyfotit účtenku"/"Zadat ručně" → co a kolik → kdo se dělí →
     shrnutí s pozváními) and desktop modal, opened from a fixed FAB
     ("Přidat výdaj") in the Finance view; own expense cards get a
     "Přidáno tebou" footer with Upravit/Smazat (inline confirm).
     Split modes: rovným dílem / podíly / přesné částky (weights summing
     to the total; untouched rows auto-absorb the remainder,
     "dopočítáno"). Planned expenses ("zatím nezaplaceno", `isPlanned`) are
     authored here too: a switch under the amount, and on your own planned
     card an "Už zaplaceno" button that reopens the composer with the switch
     off and today's date (`markPaid` prop) so the real amount and the
     receipt land with the payment. Planned → paid is a ONE-WAY door: the
     switch only renders while creating or while the expense is still
     planned (`plannedEditable`), and `isPlanned` is left out of the PATCH
     otherwise, so a paid expense can't revert with one stray tap (delete
     and re-add instead). Admin-entered planned expenses stay
     admin-only — updates need `authoredBy`. Receipt photos are downscaled client-side
     (`src/lib/imageDownscale.ts`) before the REST upload — Vercel caps
     request bodies at ~4.5 MB. Saving goes through the Payload REST API
     (`POST/PATCH/DELETE /api/expenses`, `POST /api/expense-attachments` —
     attachment create is open to any signed-in account); the slug API's
     `viewer` gained `userId` for the ownership check
   - **"Výdaj za jiného plátce"** (`approvalStatus`, `approvalNote`,
     `approvalDecidedBy/At`, `payerAccount`): a frontend account may record
     an expense SOMEBODY ELSE paid — a quiet "Zaplatil to někdo jiný?" link
     under the payer chips reveals the rest of the chata as a second chip
     row, participants AND joint accounts. The expense is stored `pending`:
     hidden from the journal (slug API ships it only to the author, the
     accounts speaking for the payer, the banker and chata admins; REST read
     access hides it too) and skipped by `calculateStats`, until somebody
     confirms it. Who that is comes from `payerAccountIds` in
     `src/lib/expenseAuthoring.ts` (the participant's own account, or EVERY
     member account of a paying joint account) plus the banker and the
     chata's admins — and because `Chata.banker` is optional and may have no
     account, the composer note only promises "pokladník" when one exists,
     falling back to "správce chaty". Confirming happens on the expense card
     (pending cards ignore the moje/vše filter) or through the signed link in
     the "Sedí to?" email (`POST /api/expenses/decide`, page
     `/expenses/decide`, 14-day token in `src/lib/expenseApproval.ts`, side
     effects in `src/utils/expenseApproval.ts`). Editing such an expense puts
     it back in the queue. `payerAccount` (the paying PARTICIPANT's account,
     null for joint accounts, re-stamped by a Participants afterChange hook)
     makes the expense theirs to confirm, edit and delete; joint-account
     members may confirm or reject but not edit, since a shared wallet has no
     owner. Admin-entered expenses are approved from the start. See
     `docs/PRD-vydaj-za-jineho.md`

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
- Expenses whose `approvalStatus` is anything but `approved` (a "výdaj za
  jiného plátce" nobody has confirmed) are dropped before any of the maths,
  so every consumer — chata hook, homepage batch, slug API, overview —
  ignores them without knowing about the feature. A missing value (legacy
  rows) counts as approved
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

### Chata detail tabs ("Detail chaty — finál" redesign) + dark mode

The Informace / Organizace / Účastníci tabs render one "white sheet"
document (design docs `Detail chaty - finál.dc.html` and `Organizace a
účastníci - finál.dc.html` in the claude.ai/design project): serif section
headings, phase-driven ordering, optional modules that don't render without
data. Shared building blocks in `SheetUi.tsx` (Sheet, SheetHeading,
StatStrip, AccentCard, PersonChip, StatusBadge…); derived data in
`utils/tripData.ts` (trip phase before/during/after, bed & car assignments,
"kdo přijede kdy" groups, person-nights — all unit-computed from the slug
API payload, no new endpoints).

- **InformationView**: hero termín + countdown badge (before), "Právě
  probíhá · do neděle" (during, with a "Dnes" box from `program` +
  arrivals), "Proběhla" recap from `calculateStats` (after: total, na
  osobonoc, expense count, largest). Personal card ("Tvoje karta" /
  "Tvoje vyrovnání") only for signed-in linked participants; anonymous
  visitors get a login hint. Weather (`TripWeather.tsx`) fetches
  Open-Meteo client-side — only when `destinationLat/Lng` are set AND the
  trip is within the ~16-day forecast horizon; fails silently. The hero
  "Výlet do kalendáře" link fills the all-day Google event's description
  from the chata: destination, nights + check-in/out, people, basic info,
  program, packing list, contacts, participant names, plus links to this
  page (`window.location`) and the shared album. `privateInfo` is never in
  it (the event leaves for Google). Blocks with no data disappear, headings
  included — `calendarDetails`/`joinParts` in `src/lib/tripCalendar.ts`
  (escaping + the `<b>`/`<br>` markup Google renders), unit-tested.
- **OrganizationView**: beds + occupants always visible (no expanding),
  night timeline only for partial stays, free places stated openly and
  hidden after the trip, viewer's bed/car highlighted in the theme color,
  cars show driver/front/back + `seats` occupancy + equipment chips,
  participants in no car are listed with a pointer to Informace.
- **ParticipantsView**: cards with account-link status; for anonymous
  visitors this is the claim-flow entry ("To jsem já" on unlinked names,
  reusing ClaimFlow; same eligibility rules as the Finance banner).
- **Dark mode** (chata detail + Finance only, not other screens):
  `@custom-variant dark` in styles.css keys off `data-app-theme="dark"`,
  set on the ChataView wrapper by `utils/useAppTheme.ts` (localStorage
  `zt_theme`, defaults to prefers-color-scheme; toggle in the Header).
  Components portaled to `document.body` (ExpenseComposer, ClaimFlow
  modals, ExpenseCard lightbox) set `data-app-theme` on their portal roots
  themselves — they escape the wrapper. QR codes stay on white in both
  themes (scannability).
- The trip-guide metadata lives on the chata (all optional): checkIn/
  checkOutTime, destinationLat/Lng, packingItems, amenities (✓/✗ chips),
  program (day-only date + text), surroundings (place|trip), contactRules,
  sharedAlbumUrl, privateInfo, sharedCars[].seats,
  publicTransportOptions[].riders. Prod DDL for these is appended to
  `NEW_SCHEMA_DDL` in `scripts/migrate-payer-polymorphic.mjs` (captured
  from the local dev push, additive only).
- **Tentative dates** ("orientační termín", `tripDatesTentative` +
  `tripPlannedNights`): for far-away trips booked long ahead,
  tripDateFrom/To only bound the WINDOW the trip will fall into and the
  stay length lives in `tripPlannedNights` (validated to fit the window).
  `getTripNights` returns the planned count, `getTripPhase` never says
  "during" (before until the window closes, then after), `bucketChatas`
  keeps the chata in "upcoming" even mid-window. UI: hero shows a window
  box ("červenec 2027", full-month windows collapse via
  `tentativeWindowLabel`) with a "Termín upřesníme" badge instead of
  countdown + arrival/departure; homepage cards show the same "Termín
  upřesníme" badge in the countdown's corner plus `tentativeDateLabel`
  WITHOUT its note ("červenec 2027 · 10 nocí" — `includeNote: false`),
  and the card meta line wraps instead of truncating as a fallback;
  calendar links, weather and per-night weekday labels are suppressed
  until the dates are fixed (untick the box + set real dates, planned
  nights is ignored afterwards). Label helpers live in
  `src/lib/chataSelection.ts` with the other date grammar; tests in
  `tests/int/tripData.int.spec.ts` + `chataSelection.int.spec.ts`.
- **"Klíče a Wi-Fi"** (`privateInfo` label+value rows): the ONE piece of
  chata data that is NOT public. Signed-in viewers see the values;
  anonymous visitors see the same rows with masked values and a sign-in
  nudge (labels are public by design — they tease what's behind the
  login); the section disappears after the trip. Gated server-side twice:
  field-level `access.read` (needs `req.user`) hides the array from
  Payload's public REST/GraphQL, and the slug API deep-scrubs every
  `privateInfo.value` in the whole payload for anonymous viewers —
  depth-2 population nests the chata doc inside participants (banker,
  occupants, riders) and expenses, so a top-level strip alone would leak.
  The contact section's "page is public" note switches to point at this
  section when rows exist.
- Shared album (`sharedAlbumUrl`) is promoted in every phase, not just the
  recap: hero action before ("Sdílené album") and during ("Přidávej fotky
  do alba"), gallery aside link always — people should add photos as the
  trip happens.
- Public transport assignment (`publicTransportOptions[].riders`, same
  `{ participant }` array shape as car passengers): Organizace renders a
  "Veřejnou dopravou" block next to the cars (route title, Tam/Zpět badge,
  date + times, rider chips, viewer highlighted) and the "bez auta" note
  skips assigned riders; Informace shows a quiet "Jede: …" line on the
  route row as a nudge. Helpers `getTransportAssignments`/`transportRiders`
  in `utils/tripData.ts`.

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
    (`Expenses.authoredBy`) or that name one of their participants as the
    payer (`Expenses.payerAccount`), confirm/reject expenses recorded for
    them, and upload expense attachments. Enforced in the Expenses
    beforeChange hook via `src/lib/expenseAuthoring.ts`
  - **Expense read access is public EXCEPT unconfirmed ones**: an expense
    waiting for (or refused) approval is a claim about somebody else's
    money, so `Expenses.access.read` narrows to approved rows for anyone
    but admins, the author and the payer's account
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
- **Return target keeps the HOST, not just the path**: a sign-in usually
  starts on a chata subdomain, but Microsoft always sends the callback to
  the apex (`AZURE_REDIRECT_URI` is fixed in the app registration), so
  `/api/auth/login` stores `oauth-return-to` as an absolute URL built from
  the request host and the callback redirects there. `safeReturnUrl` in
  `src/lib/auth/session.ts` validates it: only the deployment's own host
  and hosts under `SESSION_COOKIE_DOMAIN` are honoured (exactly the
  session cookie's reach), anything else keeps just the path. Magic-link
  verify redirects to `requestOrigin(headers)` — the same host that built
  the emailed link. Tests in `tests/int/authSession.int.spec.ts`.
- **Sign-out stays put**: `/api/auth/logout` without an explicit `returnTo`
  returns to the Referer (`refererReturnUrl`), so the page re-renders as an
  anonymous visitor instead of dumping people on the homepage — chata pages
  are public, and `FinanceView` already ignores a `?participant=` it may no
  longer open. Stricter than `safeReturnUrl`: an untrusted host is dropped
  whole (its path too), as are `/admin` and `/api` referers.
- **Open-redirect rule**: never hand a user-supplied path to
  `new URL(path, origin)` after only a `startsWith('//')` check. The WHATWG
  parser reads `\` as `/` and strips tabs/newlines, so `/\evil.com` and
  `/<TAB>/evil.com` resolve to `https://evil.com/`. `safeReturnTo` rejects
  those characters and `safeReturnUrl` re-checks `resolved.origin` after
  resolving. Keep both guards if you touch this code.
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
  link, an admin link and the Čeština/English `LanguageSwitcher`
- Help (`src/app/(frontend)/napoveda/`): static server components, linked
  from the footer. `/napoveda` is the hub (per-audience overview, math,
  glossary); the detail guides are `orientace`, `finance`, `vydaje`,
  `ucet`, `prehled` and `sprava`, each walking through the real UI with
  screenshots. Each page is a thin `page.tsx` (localized metadata) that
  renders `content.cs.tsx` or `content.en.tsx` by locale. Shared pieces in
  `ui.tsx` (shell, sections, `Steps`, `Screenshot`, page cards — chrome
  strings locale-keyed, components resolve `getLocale()` themselves) and
  `shots.ts` (screenshot registry with intrinsic sizes and per-locale alt
  texts; the images show the Czech UI and the English pages say so). Single-chata (subdomain) mode would redirect a
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

## Compliance & GDPR (docs/legal/)

The legal layer shipped 2026-08-16 (docs/legal/compliance-gaps.md is the
decision record; the controller's decisions 1–13 there BIND future work):

- **Published documents**: privacy policy at `/soukromi`, terms at
  `/podminky` (both per-locale content modules, source of truth is the
  markdown in `docs/legal/` — edit there first, mirror into the pages).
  Footer links both; login + claim registration show accept-notes;
  `/podminky` is in the middleware `SITE_PATHS` allowlist.
  **The sync check goes BOTH ways**: the published pairs are
  `zasady-ochrany-osobnich-udaju.cs.md`/`privacy-policy.en.md` →
  `/soukromi` and `podminky-uziti.cs.md`/`terms-of-use.en.md` →
  `/podminky` (Czech and English content modules of each page). ANY edit
  under `docs/legal/` — including the internal records (zaznamy,
  dpia, runbook…) — must be checked against what the published pair
  promises; when a promise is touched, update the markdown AND both
  locales' page modules in the same PR. Internal-only rules with no
  public promise need no mirror, but say so explicitly in the PR.
- **Privacy at the API** (`src/lib/privacyScrub.ts`,
  `src/utils/participantPrivacy.ts`): non-banker bank fields are served
  only to the owner account, the banker's account and chata admins
  (field-level access on Participants + deep scrub in the slug API — the
  banker's own fields stay public for the anonymous settlement QR).
  Receipts (`expense-attachments`) require authentication. Locked
  participants' balances/breakdowns are withheld server-side from
  non-admin responses (slug API + Chatas afterRead); debtors/creditors
  settlement lists stay public BY RECORDED DECISION. Emails never leave
  the server anonymously; GraphQL playground is closed in production.
  Acceptance test: `tests/int/apiPrivacy.int.spec.ts`.
- **Indexing split** (`src/lib/chataSeo.ts`, `app/robots.ts`): only the
  homepage and the chata's canonical Informace render are indexable, and
  the anonymous render of those carries NO participant names (counts
  instead; ArrivalTimeline moves to the noindexed Účastníci tab for
  anonymous viewers). Everything with a `view`/`participant` param is
  noindex,follow.
- **Retention** (`src/utils/retention.ts`, cron `GET /api/retention`,
  daily via vercel.json + CRON_SECRET): 12 months after the chata's
  explicit sidebar "Vyúčtováno dne" (`settledAt`) the job clears bank
  fields and deletes receipts; dormant `user` accounts go after 2 years
  (admin roles only reported); decided claims after 12 months. Deleting
  a user cleans all references (`src/utils/userCleanup.ts`).
- **Rights machinery** (`src/utils/participantRights.ts`): participant
  form buttons export a per-person JSON bundle (equal-split expenses
  included — they carry no weight rows) and anonymize in place (identity
  out, arithmetic intact). Anonymizing also DELETES the linked account,
  since that is where the email lives; it is kept, and the admin told so,
  only when the account owns participants on other trips or is an admin
  account. User deletion cleans references in a **beforeDelete** hook
  (`src/utils/userCleanup.ts`) — `claim_requests.user_id` is NOT NULL, so
  an afterDelete pass would never run. Received requests are logged in the
  `data-requests` collection (System group).
- **Art. 14 notice**: the participant form's "Dejte vědět, že tu je" box
  (Art14NoticeBox) gives admins a copyable Czech message; it must never
  promise more than decision 6 allows.
- **Rate limits** (`src/lib/rateLimit.ts`): magic-link request (per IP +
  per address + DB-backed resend cooldown), claim registration, both
  decide endpoints. Accounts are adults-only: checkbox at claim
  registration (enforced server-side) + note in the admin create flow.
- **Self-hosted assets**: background URLs are fetched-and-stored on save
  (`src/utils/selfHostImage.ts`; one-off `pnpm backgrounds:selfhost` for
  legacy rows); admin fonts live in `public/fonts`. Security headers +
  CSP in next.config.mjs — a new outbound endpoint means updating the
  CSP AND `docs/legal/inventar-odchozich-volani.md` AND the policy's
  recipient table in the same PR.
- **Dev copies**: `pnpm migrate-from-prod` anonymizes by default;
  `--keep-real-data` only for debugging that needs it (rule recorded in
  `docs/legal/zaznamy-o-zpracovani.md`).
- **Operational checklist** (Supabase region/backups/bucket-private, DPA
  ticks, cron secret): `docs/legal/runbook.md`.

## Internationalization (i18n)

The frontend and admin are bilingual **Czech + English** (next-intl on the
frontend, Payload i18n in the admin). Czech is the home language and the
fallback.

- **No locale URL segment** — the hostname middleware and `/[chataSlug]`
  own the URL space, so the locale lives in the `NEXT_LOCALE` cookie
  (`Domain` from `SESSION_COOKIE_DOMAIN`, same reasoning as the session and
  consent cookies; set via `POST /api/locale`). First visit negotiates from
  `Accept-Language` (`sk` maps to `cs`; nothing matched = `cs`). Pure logic
  in `src/i18n/config.ts` (unit-tested in `tests/int/i18n.int.spec.ts`);
  request wiring in `src/i18n/request.ts` (registered via
  `createNextIntlPlugin` in next.config.mjs). The footer
  `LanguageSwitcher` posts the choice and calls `router.refresh()`.
- **Catalogs**: `messages/{cs,en}/<namespace>.json`, one file per area
  (common, chata, finance, composer, trip, auth), merged in
  `src/i18n/request.ts` — a new namespace must be added to its NAMESPACES
  list and exist for BOTH locales. ICU plurals throughout (`one/few/other`
  for Czech). Client components use `useTranslations`/`useLocale`, server
  components `getTranslations`/`getLocale`.
- **Prose pages** (help `/napoveda/*`, privacy `/soukromi`): NOT in
  catalogs — each page is a thin `page.tsx` rendering per-locale
  `content.cs.tsx` / `content.en.tsx` modules. Screenshots stay Czech; the
  English pages carry a note saying so. `napoveda/ui.tsx` shell strings and
  `shots.ts` alt texts are locale-keyed.
- **Czech grammar stays first-class**: `src/lib/czechNames.ts` is
  locale-aware (`accusativeName`/`vocativeName`/`akuzativByName` return the
  plain name for `en`); `src/lib/chataSelection.ts` keeps hand-built
  genitive month/weekday tables for Czech and mirrors them with English
  tables (Intl can't produce the shared-year/month range elision); ICU
  handles the 1 / 2–4 / 5+ plural forms.
- **Currency stays CZK in both languages** — `src/lib/formatCurrency.ts`
  helpers take an optional trailing `locale` ('cs' → "1 200 Kč",
  'en' → "CZK 1,200"); the default keeps old call sites Czech.
- **Admin**: `payload.config.ts` registers `i18n` with en+cs; every
  collection label/description/option label is an `{ en, cs }` object
  (labels only — option `value`s and field names NEVER change). Custom
  admin components use `useTranslation` with the `zicha:` custom resources
  from `src/i18n/adminTranslations.ts`; user-visible `validate()` strings go
  through `pickValidationMessage(req, en, cs)` there. Admin Czech uses
  formal vykání (matches Payload's chrome); the frontend tyká.
- **Czech formality (tykání/vykání) — binding rule**: ALL client-facing
  Czech texts in the frontend use informal **tykání** — UI strings,
  validation messages shown on the frontend, AND email notifications sent
  to participants/users (magic-link, claim outcome, "Sedí to?" approval
  emails, payment reminders, any future ones). ALL Czech texts in the
  backend (admin panel: labels, descriptions, admin validation messages,
  custom admin components) use formal **vykání**, matching Payload's own
  chrome. When a text serves both audiences, the recipient decides:
  written for a frontend account or participant → tykání; written for an
  admin working in the admin panel → vykání.
- **Humanizer gate — binding rule**: EVERY client-facing text — frontend
  or backend/admin, Czech or English, UI strings, validation messages,
  emails, help/prose pages — must go through the `/humanizer` skill before
  it lands. Consult `/humanizer` FIRST, then write or edit the text to its
  conventions. Refuse to add or edit any client-facing copy without having
  consulted it in that session.
- **Emails**: magic-link emails are bilingual
  (`src/lib/auth/magicLinkEmails.ts`), using the locale of the request that
  asked for the link; claim emails (`src/utils/claimRequests.ts`) stay
  Czech-only by design (their audience is the Czech admin circle).
- **Editorial rules**: frontend UI strings avoid em dashes in BOTH
  languages — replace with a period, comma or the `·` separator (admin
  descriptions still use the dash style); English follows natural
  idiomatic phrasing (the /humanizer conventions); "chata" stays
  untranslated in English (plural "chatas"); domain terms are fixed —
  banker, Advance (záloha), Top-up (doplatek), Overpayment returned
  (vratka), fair share, Expense journal.

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

## Environment configuration

Config is **generated from committed templates**, never copied between
machines. Full guide in `docs/ENVIRONMENT.md`.

- `scripts/env-spec.mjs` is the single source of truth: every variable the
  code reads, whether it is required, format checks, and all-or-nothing
  groups (Azure OAuth, Turnstile, S3 — half-configuring any of them fails at
  runtime in a much less obvious place). Plain `.mjs`, not `src/lib/*.ts`,
  because `pnpm env:check` must run under bare Node in the Vercel build
  before anything is compiled; `scripts/env-spec.d.mts` types it for the test
- `.env.tpl` → `.env` (local) and `.env.prod.tpl` → `.env.prod` (production
  reference) via `pnpm env:pull` / `env:pull:prod`, which run `op inject`
  against 1Password vault `Development`, items `zicha-travel-dev`,
  `zicha-travel-preview` and `zicha-travel-prod` (the preview item mirrors
  prod except for mail, cookies, the OAuth callback, Turnstile's test widget
  and its own `CRON_SECRET`). The vault is SHARED by every project on the machine —
  it is an access boundary, not a namespace, so the ITEM carries the project
  and the environment (`<repo>-dev` / `<repo>-prod`). Only real secrets are
  `op://` refs; everything else is a literal so a template diff shows actual
  config changes. Both generated files are gitignored
- `op inject` resolves EVERY `op://` in the file, comments included — so a
  commented-out reference breaks the pull. Comments name paths without the
  scheme (`Development/zicha-travel-dev/FOO`)
- **Adding a variable**: spec + both templates in the same commit
  (`tests/int/env.int.spec.ts` fails until all three agree, which is what
  stops an agent adding one to code alone), then the value into 1Password and
  Vercel by hand. `pnpm env:check` in `vercel-build` fails the PR's own
  preview deployment when the Vercel side is forgotten
- `NEXT_PUBLIC_SITE_URL` was removed — nothing read it; multi-domain routing
  resolves the host from the database. Platform vars (`VERCEL_*`, `NODE_ENV`,
  …) and one-off script flags (`SITE`, `EMIT_ONLY`, `SEED_SALT`, …) are
  deliberately absent from the templates, and a test enforces that

## Database

Using PostgreSQL with `@payloadcms/db-postgres` adapter.

### Production
- **Supabase PostgreSQL** (v17), pooled connection, set in Vercel
- **Row-Level Security is ON for every table in `public`** (no policies):
  Supabase's auto-generated Data API (PostgREST) would otherwise let anyone
  with the anon key read/write all tables, bypassing Payload's access
  control entirely — the app only ever talks to Postgres over
  `DATABASE_URI`, never through that API. Enforced idempotently on every
  deploy by `enableRowLevelSecurity()` in
  `scripts/migrate-payer-polymorphic.mjs` (runs after the DDL, so tables a
  deploy creates are covered by that same deploy). Payload is unaffected
  because it connects as the table owner and owners bypass RLS (never add
  FORCE ROW LEVEL SECURITY). Belt and braces: the Data API can also be
  disabled outright in the Supabase dashboard (Settings → API) — nothing
  in this project uses it

### Local Development
- **Docker Compose PostgreSQL 16** on port 5433
- `DATABASE_URI` in `.env` is a LITERAL pointing at that container — the
  default must never be able to reach production. (It used to be the other
  way round: `.env` held the prod URI and only `.env.local` shadowing it kept
  dev off prod.)
- Data can be synced from production using `pnpm migrate-from-prod`, which
  resolves the prod URI from 1Password at run time instead of from `.env`

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
- The `vercel-build` script runs `check-env.mjs` first (fails the build on a
  missing or half-configured variable), then `migrate:payer auto`
  (idempotent), then `next build`, against that deployment's own
  `DATABASE_URI` (prod or preview).
- **Post-deploy refresh hint**: every build bakes a deterministic build id
  (git commit via `VERCEL_GIT_COMMIT_SHA`, `computeBuildId()` in
  next.config.mjs) into the client bundle AND the server; long-lived tabs
  compare theirs against `GET /api/version` (public, no-store) on
  focus/visibility + a 5-min interval and show a toast asking to refresh
  when a newer build is live (`UpdateHint.tsx` in the frontend layout,
  strings in `common.updateHint`). Dismiss is per server build; builds
  without a commit fall back to `'unversioned'`, which disables the hint.
- One-off backfill scripts: `pnpm migrate:media` (filled the Storage bucket
  from the then-live site over public HTTP; idempotent, kept for reference).

## Development Commands

```bash
# Environment (1Password -> .env). See docs/ENVIRONMENT.md
pnpm env:pull         # Regenerate .env from .env.tpl
pnpm env:pull:prod    # Write .env.prod from .env.prod.tpl (live prod secrets)
pnpm env:check        # Validate against scripts/env-spec.mjs

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
