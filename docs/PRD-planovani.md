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

## Vote submission — `POST /api/trip-votes/submit`

Body: `{ chataId, dateOptionIds, accommodationOptionIds, name?, email?, adult?, turnstileToken?, returnTo? }`.

Validation (pure rules in `src/lib/planning.ts`, unit-tested):

- the chata exists and `planningEnabled` is on, else `planning-closed`;
- `dateOptionIds` is non-empty and every id belongs to the chata;
- every accommodation id belongs to the chata AND is available on at least
  one selected date (`accommodationAvailableFor` — empty availability
  means every date). Accommodations may be empty (no preference).

Signed-in caller: their linked participant in the chata is the voter; when
they have none, `name` is required and a new participant is created with
`account` set to them. No captcha. The vote is recorded (or updated)
immediately — re-votes from the results view go through this path.

Anonymous caller: `name`, `email` and the adults-only `adult` affirmation
are required; Turnstile + the claim-registration rate limits apply (the
endpoint can create accounts and send email — same posture as
`POST /api/claim-requests/register`). Knowing an email address proves
nothing, so **an unauthenticated submission never writes a participant or
a vote** — otherwise anyone who knows a voter's email could overwrite
their vote. The account is created (or quietly reused) exactly like claim
registration — never revealing whether the email already existed,
superadmin addresses get the explanatory notice instead — and the magic
link is sent with the SELECTION riding its returnTo as intent params
(`pv_d`, `pv_a`, `pv_n` — the `?claim=` trick; `planningVoteReturnTo` /
`parsePlanningVoteIntent` in `src/lib/planning.ts`, params scrubbed from
analytics URLs). The click is the verification AND the first login; it
lands back on the planning page, where the signed-in auto-submit in
`PlanningView` records the vote through the authenticated path (falling
back to the prefilled dialog when it refuses, e.g. the name was taken
meanwhile). Only verified voters therefore ever appear in `voteCount` or
the results.

Name collision: a participant with the same (case-insensitive) name that
is NOT linked to the caller's (or the email's) account refuses with
`name-taken` — silently linking to an existing participant is the claim
flow's job, not the vote form's. Participant names are public data, so
the refusal reveals nothing about accounts.

Admin writes on `trip-votes` (and the two option collections) are
chata-scoped like every chata-owned collection, and a beforeChange guard
additionally checks the admin may manage the chata derived from the
INCOMING participant/chata, so a scoped admin cannot write into another
chata by picking its participant.

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
current date selection are dimmed with the reason), submit; then the
"check your email" confirmation for anonymous voters.

Strings live in the `planning` namespace (`messages/{cs,en}/planning.json`).

## Out of scope (deliberately)

- No "can't make it" vote — not voting is the no.
- No automatic transition: the admin ends planning by unticking
  `planningEnabled` and fixing the real dates/destination by hand.
- No emails to voters when planning closes (future enhancement).
- Vote weights/rankings — multi-select is enough for a friend group.
