# PRD: Plánování (pre-chata phase) — voting on dates and accommodation

## Motivation

Before a trip is booked there is a phase where nothing is fixed yet: a few
candidate weekends, a few candidate cottages, and the open question "who is
actually coming?". Today the app only models a chata from the moment it is
booked. The planning phase ("Plánujeme") turns the chata page into a small
poll: visitors see the date windows and accommodation options, say "I'm in"
with their name and email, pick every date that works for them and every
place they'd be happy with, and submit. That vote creates their account and
their participant, so the group carries straight over into the normal trip
phases once the admin fixes the date.

Results are the incentive to sign in: a signed-in viewer with a participant
in the chata sees who joined and how the vote stands; an anonymous visitor
sees only the options, the vote form, and a hint that results appear after
voting.

## Data model

### Chata

| field             | type     | meaning                                          |
| ----------------- | -------- | ------------------------------------------------ |
| `planningEnabled` | checkbox | the chata is in the planning phase               |
| `planningIntro`   | textarea | the pitch shown in the planning hero ("co plánujeme") |

While `planningEnabled` is on, the frontend shows ONLY the Planning view —
no Informace/Organizace/Finance/Účastníci tabs. That is deliberate: the
participant list of a planning chata is its voter list, and the spec gates
"who is coming" behind a login. (Read APIs stay public as everywhere else
in the app; this is UI gating, consistent with the Finance-view gating
precedent in `docs/PRD-uzivatele.md`.) The tentative-dates feature
(`tripDatesTentative` + window + `tripPlannedNights`) supplies the hero
"Kdy" line and keeps the chata in the homepage "Plánujeme" bucket.

### TripDateOptions (`trip-date-options`)

One row per candidate window.

| field      | type                  | meaning                              |
| ---------- | --------------------- | ------------------------------------ |
| `chata`    | relationship → chatas | required                             |
| `label`    | text                  | auto-filled from the dates when empty ("16.–18. 10. 2026") |
| `dateFrom` | date (day only)       | required                             |
| `dateTo`   | date (day only)       | required                             |
| `note`     | text                  | optional ("víkend pá–ne")            |

### TripAccommodationOptions (`trip-accommodation-options`)

One row per candidate cottage.

| field          | type                              | meaning                         |
| -------------- | --------------------------------- | ------------------------------- |
| `chata`        | relationship → chatas             | required                        |
| `name`         | text                              | required                        |
| `locationNote` | text                              | "Bezdědice, pod Bezdězem"       |
| `url`          | text                              | link to the listing             |
| `description`  | textarea                          | one or two factual sentences    |
| `image`        | upload → media                    | optional photo                  |
| `dateOptions`  | relationship hasMany → trip-date-options | dates the place is available; **empty = all dates** |

### TripVotes (`trip-votes`)

One row per participant per chata (application-level uniqueness — the
submit endpoint upserts).

| field            | type                                      | meaning                     |
| ---------------- | ----------------------------------------- | --------------------------- |
| `chata`          | relationship → chatas                     | required                    |
| `participant`    | relationship → participants               | required, the voter         |
| `dates`          | relationship hasMany → trip-date-options  | every date that works       |
| `accommodations` | relationship hasMany → trip-accommodation-options | every place they like |

Access: NOT public (votes are preference data). Admins read their chatas'
votes, a frontend user reads votes of their own linked participants; writes
are admin-scoped — the public flow goes through the submit endpoint below.
Options (dates + accommodations) are public read like the rest of the
chata data.

### PendingVotes (`pending-votes`) — "Nepotvrzené hlasy"

A vote cast by somebody who is not signed in. Knowing an email address
proves nothing, so the vote is not written to `trip-votes` until its
owner signs in; but it is not thrown away either. One PENDING row per
account and chata, enforced by the partial unique index
`pending_votes_user_chata_pending_uq` (a re-submission before confirming
updates it in place; a lost race falls back to the winner).

| field           | type                                      | meaning                                       |
| --------------- | ----------------------------------------- | --------------------------------------------- |
| `chata`, `user` | relationships, required                   | the account created or reused for the email   |
| `name`          | text                                      | what they typed; becomes the participant name |
| `dates`, `accommodations` | hasMany relationships           | the selection                                 |
| `status`        | `pending` / `confirmed` / `discarded`     | discarded = the holder said "tohle nejsem já" |
| `autoConfirm`   | checkbox                                  | trust: may any sign-in record it? see below   |
| `submissionKey` | text (hidden)                             | fresh nonce per (re)submission; the emailed link carries it |
| `issue`         | `name-taken` / `planning-closed` / `invalid-selection` | why the last sign-in could not record it; cleared on success |
| `source`        | `email` / `microsoft` / `google` / `apple` | how the person proved who they are            |
| `confirmedAt`, `vote` | date, relationship → trip-votes     | the audit trail                               |
| `linkExpiresAt` | date                                      | when the emailed link stops signing in (the row lives on) |
| `linkUsedAt`    | date                                      | the link is spent on its first POST (claimed atomically)  |

Access like claim requests: not public; admins see their chatas' queue,
a user their own rows; no create in the panel (rows come from the flow).
Deleting a user deletes their rows (`user_id` is NOT NULL, same reason as
claims). Retention: confirmed rows 12 months after confirmation, every
row of a chata in the settled-chata pass; a row stuck with an issue stays
visible until then so an admin can act on it.

## Vote submission — `POST /api/trip-votes/submit`

Body: `{ chataId, dateOptionIds, accommodationOptionIds, name?, email?, provider?, adult?, turnstileToken?, returnTo? }`.

Validation (pure rules in `src/lib/planning.ts`, unit-tested):

- the chata exists and `planningEnabled` is on, else `planning-closed`;
- `dateOptionIds` is non-empty and every id belongs to the chata;
- every accommodation id belongs to the chata AND is available on at least
  one selected date (`accommodationAvailableFor` — empty availability
  means every date). Accommodations may be empty (no preference).

**Signed-in caller**: `recordVote` (`src/utils/pendingVotes.ts`, the ONE
writer of trip-votes) resolves the voter with `resolveVoter`: their linked
participant in the chata, or a new participant created with `name`
(refused with `name-taken` when the name belongs to somebody else —
linking identities is the claim flow's job). The vote is upserted, and
any pending rows the account had here are marked confirmed (superseded).
No captcha. Re-votes from the results view take this path;
`POST /api/trip-votes/withdraw { participantId }` deletes that one
participant's vote after checking the account owns them (an account may
own several participants here); the participant stays.

**Anonymous caller** — `name`, the adults-only `adult` affirmation,
Turnstile and the claim-registration rate limits apply (the endpoint can
create accounts and send email). Then one of two doors, in the order the
dialog offers them:

1. `provider` (Google/Apple/Microsoft first): a name clash with an
   UNLINKED participant is refused now; otherwise the selection is signed
   into the 10-minute `oauth-vote-intent` cookie (same reach as
   `oauth-return-to`) and the response says where to go
   (`/api/auth/login?provider=…`). The OAuth callback reads the cookie
   after the code exchange: **this is the one case OAuth may create an
   account** (the provider just verified the email, which is at least what
   a magic-link click proves). It files the pending row with
   `source: <provider>` and confirms it in the same request, so the person
   lands back on the planning page with their vote recorded.
2. `email`: the account is created (or quietly reused) exactly like claim
   registration — never revealing whether the email existed, superadmin
   addresses get the explanatory notice — the pending row is filed with
   `source: email`, and the "Potvrď svůj hlas" email goes out
   (`src/lib/planningVoteEmail.ts`, bilingual by request locale): the
   chata in the subject, the name, dates and cottages in the body, and a
   7-day link bound to the row (`signVoteConfirmToken`,
   `src/lib/pendingVotes.ts`). The link is separate from the account's
   single magic-link slot, so a later login-link request cannot invalidate
   it. It lands on `/votes/confirm`, which shows the vote and one button;
   the confirmation is a POST (`/api/trip-votes/confirm`) because mail
   scanners prefetch GETs. The POST signs the account in (the click is the
   email verification) and confirms. The link is SINGLE-USE: the first
   POST claims it with one conditional update of `linkUsedAt`, so a copy
   in a mailbox never stays a login credential; an expired or spent link
   is not a lost vote, the page says so and offers the sign-in buttons.

## Confirmation runs on every sign-in — for trusted rows

`confirmPendingVotesForUser` turns pending rows of an account into real
votes through `recordVote`. It runs from the magic-link verify (a plain
login link included), every OAuth callback, Payload's afterLogin
(password fallback), the vote link's POST, and from the slug API whenever
a signed-in viewer opens a planning chata (self-heal).

**Trust.** An anonymous submission proves nothing about who made it, so
a row filed against an account that ALREADY EXISTED must not become a
vote just because its holder signs in later — anyone who knows the email
could plant a date. Such rows carry `autoConfirm: false`: an ordinary
sign-in only reveals them (`planning.pendingVote` with
`needsApproval: true`, the dialog opens prefilled with an explanation and
a "zahodit tenhle hlas" link → `POST /api/trip-votes/pending/discard`),
and only the emailed link — mailbox proof — records them outright
(`confirmPendingVotesForUser` with `pendingVoteId`). Rows the submission
itself created the account for, and same-browser OAuth intents, are
`autoConfirm: true` and land on any sign-in: that is the first-time-voter
case (the one that lost two votes), and there is no holder to plant on.
Trust never rises on a re-submission of an existing row.

**Links.** Single-use and bound to the submission: the POST spends the
link with one `UPDATE … WHERE link_used_at IS NULL AND submission_key = …
RETURNING` (`claimVoteLink`), so concurrent clicks cannot both win, a
mailbox copy is no login credential afterwards, and a link from an
earlier email (stale key) is refused. A re-submission mints a new key and
an unspent link, so "poslat znovu" always works.

**Serialization.** `recordVote` runs inside a transaction holding
`pg_advisory_xact_lock` on (account, chata), so the signed-in submit, the
confirm link, the self-heal and an OAuth callback cannot create a
participant or a vote twice; `trip_votes_participant_uq` is the database
backstop. A row that cannot be recorded keeps `status: pending` with
`issue` set and the page asks the voter to finish by hand. Editing sends
the displayed `participantId` (an account may own a parent and children
here); `resolveVoter` refuses a participant the account does not own.
Only verified voters therefore ever appear in `voteCount` or the results.

Why rows and not URL params: the first version carried the selection in
the magic link's `returnTo` (`pv_*` params). Two real votes were lost
that way — one to a never-clicked link, one to a plain login-link request
that overwrote the pending token. Neither can happen now.

## Admin notification emails

Every vote `recordVote` commits — new or changed, cast directly or
through a confirmed pending row — emails the chata's admins and the
superadmins (`notifyAdminsOfVote` in `src/utils/pendingVotes.ts`,
recipients via `claimDecisionMakers`, the voter's own account skipped).
The email (`voteAdminNotificationEmail` in `src/lib/planningVoteEmail.ts`)
is Czech-only like the claim admin emails, carries the voter's name, the
selection and the running vote total, and links the chata page; there is
nothing to decide, so it has no action links. It goes out only after the
vote's transaction commits AND after the response is sent (next/server
`after()`, backed by waitUntil on Vercel), so no vote, sign-in or
confirmation ever waits on the mail provider; best-effort, a delivery
failure is logged and never fails the vote.

## Results visibility

`planning.results` ships from the slug API only to viewers where
`viewer.canViewAll` (chata admins) or `viewer.linkedParticipantIds` is
non-empty — "logged-in user on this chata". Everyone else gets the options
and an anonymous `voteCount`, nothing per-person. Tallies are computed
client-side from the shipped votes (`tallyVotes` in `src/lib/planning.ts`).

## Frontend

`PlanningView.tsx` (white sheet, SheetUi building blocks — design canvas
"Plánování chaty"): hero (Plánujeme badge, tentative window, intro, stat
strip), "Termíny ve hře", "Kde bychom spali" cards with per-date
availability chips, vote CTA, anonymous hint. Signed-in participants get
"Tvůj hlas" (edit re-opens the dialog prefilled), "Kdo se přidal" chips
and "Jak to vypadá" tally bars instead of the CTA.

`PlanningVoteFlow.tsx` — the dialog (portaled to body, sets
data-app-theme): who you are (skipped when signed in with a linked
participant), which dates, which places (options unavailable for the
current date selection are dimmed with the reason); then, for anonymous
voters, the adults-only box and "Ještě potvrď, že jsi to ty": the
Google/Apple/Microsoft buttons first, "nebo e-mailem" with the address
field second (email-only where no provider is configured), and the "check
your email" confirmation that says the link lasts 7 days and any other
sign-in saves the vote too. Signed-in voters get "Vzít hlas zpět" under
"Tvůj hlas". `ConfirmVoteCard.tsx` is the `/votes/confirm` card.

Strings live in the `planning` namespace (`messages/{cs,en}/planning.json`).

## Out of scope (deliberately)

- No "can't make it" vote — not voting is the no.
- No automatic transition: the admin ends planning by unticking
  `planningEnabled` and fixing the real dates/destination by hand.
- No emails to voters when planning closes (future enhancement).
- Vote weights/rankings — multi-select is enough for a friend group.
