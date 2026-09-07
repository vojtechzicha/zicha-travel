# PRD: Notifikace (Notification engine) — design exploration, nothing built yet

**Status:** THINKING. This document explores what a notification engine for
zicha.travel could be. It records the product ideas, the moments worth
telling people about, the channels that fit this codebase, and a plausible
architecture. No decision in it is final; the numbered open questions at the
end are the ones the controller has to answer before anything is coded.

## Where we stand today

Notifications already exist, they just do not know about each other. Four
places hand-roll `sendAppEmail` calls and each invents its own audience rule,
wording and retry story:

| Sender | Trigger | Audience | Shape |
| --- | --- | --- | --- |
| `src/lib/auth/magicLink.ts` | login request | the requester | transactional, bilingual |
| `src/utils/claimRequests.ts` | claim filed / decided / 3-day cron nudge | chata admins + superadmins, then the claimant | Czech, per-recipient signed decide links |
| `src/utils/expenseApproval.ts` | "výdaj za jiného" recorded / decided | payer's account(s), banker, admins; then the author | "Sedí to?", 14-day signed decide link |
| `src/utils/pendingVotes.ts` | vote recorded | chata admins + superadmins, voter skipped | post-response `after()`, best effort |

What the four already agree on, and the engine must keep: every send goes
through `sendAppEmail` (preview redirect to `EMAIL_PREVIEW_TO`, log-only
without Resend), a decision is never a GET (scanner-safe signed POST
landings), the actor never hears about their own action, Czech emails tykají
and go through `/humanizer`.

What is missing: any memory of what was sent (so nothing can be deduped,
coalesced, throttled or shown in the app), preferences of any kind (no
unsubscribe, no mute), a recipient locale (emails pick the request locale or
are Czech-only), a scheduled class (only two crons exist, both daily), and
the "Email notifications for payment reminders" item that has sat in
CLAUDE.md's Future Enhancements since the PoC.

Constraints that shape everything below:

- **Most participants never sign in** (compliance decision 6). They have no
  email in the system and must not get one. A notification engine here
  reaches account holders; for everyone else the channel is a human.
- **No AI in the product** (decision 2). Every text is a deterministic
  template. No summarising, no "smart" phrasing.
- **Visibility rules are the law**: private expenses, pending expenses,
  locked participants' balances, `privateInfo`. A notification is a read
  through a different door and gets the same filters
  (`canViewPrivateExpense`, `payerAccountIds`, the slug API's scrubs).
- **Serverless**: no long-running worker, no queue. Vercel gives us Payload
  hooks inside the request, `after()` for post-response work, and cron.
- **Legal mirror**: the privacy policy would gain a section (legal basis,
  channels, unsubscribe, retention of the ledger), Web Push adds an
  outbound endpoint to the CSP and the outbound-calls inventory, and
  compliance item 23 (shutdown / policy-change announcement) finally gets
  a mechanism.

## Product idea: a calm ledger, not a firehose

A chata group is at most a few dozen people who talk to each other anyway.
Nobody wants the app to become a second group chat. The engine should feel
like a well-briefed friend who says one useful thing at the right moment and
otherwise keeps quiet. Four principles:

1. **Moments, not events.** The vocabulary is the sentence a friend would
   say across the table ("Karel zapsal výdaj, tvůj podíl je 320 Kč"), not
   the database row that changed. Every moment has a fixed audience rule,
   an urgency class, a coalescing key and an expiry after which it is
   simply dropped: a three-week-old expense is history, not news.
2. **Digest by default, instant by exception.** Only "somebody is asking
   you for a decision or money" and security go out immediately. Everything
   else rolls into one per-chata "co je nového" digest whose cadence
   follows the trip phase.
3. **Ask, don't tell.** The best notifications in the app today are
   questions with a button ("Sedí to?", claim decide, vote link). Where a
   moment can be a question with a one-tap answer, make it one.
4. **The passive layer first.** The cheapest, safest engine is "what changed
   since you were last here", shown in the app. It needs no channel, no
   permission and no unsubscribe, and it covers most of the need. Push
   and email escalate from it, they do not replace it.

### The passive layer: "Od tvé poslední návštěvy"

Every signed-in viewer gets a `lastSeenAt` per chata (stamped by the slug
API, a tiny table `chata_visits (user, chata, seenAt)`). The Finance and
Informace views open with a quiet strip computed on the client from the
existing payload: "3 nové výdaje · tvůj podíl +740 Kč · 1 nová platba · Karel
potvrdil tvůj výdaj". The strip is a diff of the slug API data against the
timestamp, so it costs one column and one component. It doubles as the
in-app inbox for everything the engine later decides to send, and as the
landing target of every deep link ("what am I looking at and why").

A bell in the header lists the ledger rows for the viewer across all chatas
(the `notifications` collection below), unread count in the PWA badge via
`navigator.setAppBadge` where supported.

### Moments, by trip phase

The trip phase is already computed (`utils/tripData.ts`: planning, before,
during, after, settled). Each phase has its own natural moments. "Ask" marks
a moment that is a question with a button; "Digest" means it only ever
travels inside a digest; "Instant" means it may go out alone.

**Plánujeme (planning on)**

- Poll opened / options changed → Digest to linked participants. Ask:
  "Vyber termíny" with the vote link.
- Vote recorded → today an instant email per vote to admins; should become
  a coalesced admin digest ("5 nových hlasů, vedou 12.–14. 9.") with a
  daily cap, instant only for the first vote of the day.
- Everyone voted / quorum reached → Instant to admins: "Všichni hlasovali,
  můžeš zamluvit". Ask: link to the admin panel with the winning window
  preselected.
- Trip booked (flag unticked, dates set) → Instant to voters: "Jedeme
  12.–14. 9. do Lipna" with the calendar link the hero already builds.

**Před chatou (before)**

- T-30: "Záloha" if `Prepayments` of type advance are expected and missing
  for this participant. Ask: "Poslal(a) jsem" self-report that files a
  pending prepayment for the banker to confirm (same pattern as "výdaj za
  jiného", reversed).
- T-14: packing list + program teaser. Digest. Only when `packingItems` or
  `program` exist.
- T-7: "Kdo přijede kdy" still has gaps → Ask to the people with no arrival
  recorded: "Kdy dorazíš?" with a two-tap answer (day chips), writing the
  arrival the Organizace view already reads.
- T-3: weather, cars and beds. Digest, with the viewer's own bed and car
  highlighted, and a "jedeš bez auta" nudge if unassigned. Weather comes
  from Open-Meteo, which the app already calls client-side; the server
  variant is one more outbound call to disclose.
- T-1 or check-in morning: "Klíče a Wi-Fi" pointer. Never the values in the
  email (emails get forwarded); a deep link to the section instead.
- Tentative dates: none of the date-relative moments fire until
  `tripDatesTentative` is off; "Termín upřesněn" is itself a moment.

**Na chatě (during)**

- Quiet hours are absolute: nothing between 22:00 and 08:00 Europe/Prague,
  and no digests at all during the trip. People are together; the app is
  a receipt scanner now.
- Instant only for money asks: "Sedí to?" (exists), and "Karel tě pozval na
  výdaj" is NOT a moment (invitations are host-side generosity, not asks).
- Day-of program line ("Dnes: výlet na Ještěd") as a morning push only for
  people who turned that on; it is charming once and annoying twice.

**Po chatě (after)**

- Day+1: "Přidej fotky do alba, nahraj účtenky" once, to everyone linked.
  Digest. Expenses over a threshold with no attachment get a per-payer
  line ("3 výdaje bez účtenky").
- Planned expenses still `isPlanned` after the trip → Ask the payer: "Už
  zaplaceno?" opening the composer in `markPaid` mode.
- Pending "výdaj za jiného" older than 3 days → reminder to the deciders
  (same 3-day rhythm as claim reminders).
- **Vyúčtování (the one that matters)**: when the banker marks the journal
  complete (a new explicit "Výdaje jsou kompletní" step before
  `settledAt`, or simply the first time no expense changed for N days), each
  debtor gets "Doplatek 1 240 Kč" with the amount, the banker's account and
  a payment link, each creditor "Vratka 380 Kč přijde od pokladníka". The QR:
  today it is Paylibo (decision 10, external), and an image in an email would
  leak the recipient's open to Paylibo's server, so the email carries the
  amount, account and variable symbol as text and the QR lives behind the
  link on the site. Self-report Ask: "Poslal(a) jsem" → pending prepayment
  of type supplement for the banker to confirm.
- Debt unpaid after 7 and 21 days → escalation to the debtor, two steps
  and then silence; the banker sees the same in their own digest
  ("Dluží ještě: Karel, Jana"). Never more than that: people, not
  collection agencies.
- Everyone paid → Instant to the banker: "Vše vyrovnáno, můžeš označit
  vyúčtováno" with the sidebar action deep-linked.
- Account-holder-less banker: the app cannot reach them; the admin gets the
  "banker has no account" nudge that decision 13 already asks for.

**Vyúčtováno (settled)**

- 30 days before the 12-month retention wipe → admin digest: "Bankovní
  údaje a účtenky chaty X budou smazány 16. 8." (purely informational,
  no ask; the wipe is the recorded rule).
- Nothing else. A settled chata is an archive.

**Account and admin moments (phase-independent)**

- Claim filed / decided / reminder (exists, becomes a moment).
- "Někdo tě propojil" when an admin links a participant to an account by
  hand: the person should know they now own rows on a trip.
- Login from a new device is deliberately NOT a moment (the session model
  is one long-lived cookie; no device table exists and inventing one is a
  separate project).
- Superadmin operational: cron failed, Resend bounce/complaint webhook
  (marks the address undeliverable, stops sends), a chata created without
  a banker for 7 days.
- Broadcast: policy change / shutdown announcement (compliance item 23),
  sent from the admin panel to all account holders with no opt-out, as the
  terms promise.

### Anti-moments (things that will tempt us and must stay silent)

- Own actions. The actor never hears about what they did.
- Private expenses to anyone outside the circle, in any channel, including
  the digest count ("3 nové výdaje" must not count a gift for the reader).
- Pending expenses to anyone but the deciders and the author.
- Locked participants' balances to non-admins (server-side withholding
  applies to rendering too).
- Every invitation, every weight edit, every participant rename. The
  passive strip may list them; nothing leaves the app for them.
- Anything to a person who has never signed in. They have no email here
  and the Art. 14 path is the admin's copyable notice, not the engine.

## When to ask for permission

The app should ask for a channel only right after it gave the person a
reason to want it. Concretely:

- **Never on first visit**, never on the homepage, never for anonymous
  viewers.
- **After a vote is recorded**: "Dát vědět, až bude termín?" (email is
  implicit for account holders; this is the push opt-in).
- **After a claim is approved** and after the first expense somebody adds:
  "Chceš vědět, když se změní tvůj podíl?"
- **When a pending decision exists for the viewer** (a "Sedí to?" card on
  the screen): "Příště ti to pošleme".
- **On PWA install** (`beforeinstallprompt` accepted): the installed app is
  the only place iOS allows Web Push at all, so this is the natural second
  step, as a card in the app rather than the browser's prompt.
- The browser permission dialog only ever opens from a tap on our own
  card, and a "Teď ne" is remembered per device (localStorage, disclosed
  in the policy like `zt_theme` and the refresh stamp).

Preferences stay a three-position dial per chata, not a matrix: **Ticho**
(only decisions addressed to me and security), **Peníze a otázky**
(default: asks, settlement, my share), **Všechno** (digests and phase
nudges too). Plus a global channel row (e-mail on/off, push on/off, digest
weekly/daily) and a per-chata mute. Every email carries a one-click
`List-Unsubscribe` (Resend supports the header) that flips the global
email row off without a login, through a signed link like the decide
links. Decisions addressed to the person (Sedí to?, claim outcome) and the
broadcast class are exempt from unsubscribe; the policy says so.

## Channels

| Channel | Reach | Cost | Where it fits |
| --- | --- | --- | --- |
| In-app strip + bell | every signed-in viewer | one table, one component | the passive layer and the inbox; the deep-link target of everything else |
| Email (Resend, exists) | account holders | templates + preferences + unsubscribe | asks, settlement, digests |
| Web Push (service worker, exists) | installed/permitted devices; iOS only as installed PWA | VAPID keys, a `push-subscriptions` table, a `push` handler in the SW, CSP entry for the push service | instant asks, morning program line, "vše vyrovnáno" |
| Calendar feed | anyone with a calendar app | an ICS route per participant token | "notifications without notifications": trip dates, arrival, advance deadline, settlement date land in the calendar and remind by themselves |
| Human relay | participants without accounts | a "Připomínka k odeslání" box for the banker/admin | the copyable, humanized message with the person's amount and the site link, WhatsApp-ready (the Art14NoticeBox pattern) |
| Digest page | everyone signed in, works offline | `/[chata]/novinky` rendering the same ledger | the email is a pointer; the page is the record |

The calendar feed and the human relay are the two creative ones. The feed
extends the existing "Výlet do kalendáře" (one Google link) into a
subscribable `webcal://` per participant with the same content rules
(`privateInfo` never in it), so a person's own calendar nags them on our
behalf. The relay accepts that the largest audience will never sign in and
gives the humans who do talk to them a good message to forward.

Escalation ladder for the money asks: push first if a subscription exists;
email after 24 hours if the ledger row is still unread and unacted; nothing
more. Both channels render the same card model, so "unread" means the same
thing everywhere.

## Architecture

```
domain change ──(Payload hook, same transaction)──▶ notification_events (outbox)
                                                        │
                        after() for the instant class ◀─┤─▶ cron tick for digests
                                                        │   and scheduled moments
                                                        ▼
                   resolve audience ▶ policy ▶ render ▶ deliver ▶ ledger
                   (pure, src/lib)   (pure)   (pure)  (utils)   (collection)
```

**Emit.** Collection hooks (`afterChange` on Expenses, Prepayments,
Participants, TripVotes, ClaimRequests, Chatas) write an outbox row with the
moment name, the subject ids and a snapshot of what changed, inside
`req.transactionID`, so an event never exists without its change. Scheduled
moments are not stored: the tick derives "what is due today" from state
(dates, phase, balances) and the ledger's idempotency keys, so an admin
moving the trip by a week needs no rescheduling.

**Resolve audience** (`src/lib/notifications/audience.ts`, pure,
unit-tested): moment + snapshot + chata context → recipient user ids with a
per-recipient view scope. It calls the same visibility rules the slug API
uses; if the slug API would scrub it, the notification never mentions it.

**Policy** (`src/lib/notifications/policy.ts`, pure): the dial, the mute,
quiet hours in Europe/Prague, the per-chata weekly cap, the expiry, the
coalescing key (`moment:chata:recipient:bucket`, bucket = hour for the
instant class, day for digests) and the channel choice. Output is a list of
deliveries or a "hold for digest" decision.

**Render** (`src/lib/notifications/render/*`): one card model (`title`,
`body`, `cta`, `href`, `amount?`) per moment, rendered per locale from the
recipient's stored locale (a new `users.locale`, stamped by `/api/locale`
and at login) into email HTML+text, push payload and the in-app row. Czech
tykání, `/humanizer` before anything lands, `accusativeName` where grammar
needs it. A dev-only preview route renders every template with fixtures,
the way the help screenshots use a seeded demo chata.

**Deliver** (`src/utils/notifications/*`): channel adapters. Email through
`sendAppEmail` (preview valve intact) with `List-Unsubscribe`; push through
`web-push` with subscription cleanup on 404/410; in-app is just the ledger
row. Every delivery records its status on the ledger row; a Resend webhook
(new inbound route, `CRON_SECRET`-style signature check) marks bounces.

**Ledger** (`notifications` collection, System group): recipient, moment,
chata, card JSON, `readAt`, `actedAt`, `deliveries[]`, unique `dedupeKey`.
Read access: the recipient and superadmins only (rows name people and
amounts). Retention: 12 months, then the daily job deletes them; user
deletion drops the user's rows in the existing `userCleanup` hook.

**Ticks.** One cron, `GET /api/notifications/tick`, hourly if the Vercel
plan allows it, else at 07:00 with the two existing jobs. It drains the
outbox (anything `after()` did not finish), assembles due digests, computes
scheduled moments, and enforces the caps. Idempotent by construction: a
re-run finds every key already in the ledger.

**Actions.** The three existing signed-link flows (claim decide, expense
decide, vote confirm) generalize into `src/lib/actionLinks.ts`: a
per-recipient JWT bound to the ledger row, single-use where the action is,
landing on a POST page. "Poslal(a) jsem", "Kdy dorazíš?", "Už zaplaceno?"
and unsubscribe are new actions on the same rail.

**Analytics.** `notification_sent / opened / acted` with the moment name and
channel, no amounts, no ids, through the existing typed union; consent rules
unchanged.

**Migration of the four existing senders.** Magic link stays outside (it is
the login, not a notification). Claim, approval and vote emails become
moments in phase 0 with their wording untouched, so the first release
changes nothing a person sees and only adds the ledger underneath.

## Phasing

0. **Ledger and registry.** Moment registry, outbox, ledger collection, the
   three existing emails re-plumbed through it, DDL in `NEW_SCHEMA_DDL`.
   Invisible to users.
1. **Passive layer.** `lastSeenAt`, the "od tvé poslední návštěvy" strip,
   the bell. Preferences dial in the account menu (email-only for now),
   `users.locale`, `List-Unsubscribe` on every email.
2. **Settlement and money asks.** Vyúčtování emails, "Poslal(a) jsem"
   self-report, the two-step reminder, "vše vyrovnáno" to the banker. This
   phase alone closes the oldest open item in CLAUDE.md.
3. **Digests and phase nudges.** The tick, T-14/T-7/T-3/day+1 content,
   coalesced vote digest for admins, retention warning.
4. **Web Push.** Subscriptions, the SW handler, the opt-in cards, the
   escalation ladder, badge count.
5. **Calendar feed and human relay.** ICS per participant; "Připomínka k
   odeslání" box on the participant form and in the banker's Finance view.

Each phase ships with its policy mirror: phase 1 adds the notifications
section to `/soukromi` (both locales + both markdowns), phase 4 adds the
push service to the CSP and the outbound inventory, phase 5 adds the ICS
route to the indexing rules (noindex, token-gated).

## Open questions for the controller

1. Is one hourly cron acceptable on the current Vercel plan, or do digests
   live with the daily 07:00 job?
2. Should the settlement email include the bank account as text, or only
   the link? (Text works without a login; the link keeps the account off
   forwarded emails.)
3. Does the "Výdaje jsou kompletní" step exist as an explicit banker action,
   or is settlement inferred from N quiet days? Explicit is safer and matches
   decision 8's spirit.
4. Web Push means one more processor (the browser vendor's push service,
   Apple/Google/Mozilla) in the recipient table. Worth it for this group
   size, or is email plus the calendar feed enough for a year?
5. Is a `users.locale` column fine, or should emails keep guessing from the
   request?
6. The debt reminder cadence (7 and 21 days) and the weekly cap (3 per
   chata?) are guesses; the first real trip should decide them.
