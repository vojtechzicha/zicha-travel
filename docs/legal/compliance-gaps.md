# What must change before the legal documents are true

**Status:** the gate for publishing the four documents in this directory
**Date:** 2026-08-16
**Relates to:** `docs/PRD-gdpr.md` (findings and open decisions), the privacy
policy and terms of use in `docs/legal/`

The privacy policy and terms of use in this directory are written for the
product as it should be, not as it is. Several statements in them are false
against the current code. This document lists every such statement, the code
reality behind it, and what has to change. Items are split into blockers
(the documents lie until these are fixed), security work the policy's
Art. 32 wording depends on, paperwork with no code component, and recorded
decisions.

Publishing the documents before the blockers land would be worse than
having no documents: a privacy notice that misdescribes the processing is
itself a GDPR violation and destroys the trust the notice is supposed to
build.

## Decisions recorded

These were the open decisions in `docs/PRD-gdpr.md` §13. The controller has
decided:

1. Vojtěch Zicha is the sole controller. Chata admins act under his
   instructions; the terms of use (section 6) bind them to that. No joint
   controllership, no Art. 26 arrangement.
2. No AI is used in the product and none is planned. The policy states this
   (section 15); adding any AI feature reopens the statement.
3. The service stays free, private and invite-only. The terms carry no
   consumer-purchase machinery beyond the statutory minimum.
4. Retention: trip records stay as the group's archive while the service
   runs; bank details and receipts go 12 months after settlement; accounts
   go after 2 years without a login; claim requests go 12 months after the
   decision; raw analytics events already expire at 12 months.
5. Anonymous per-chata readability stays, as the product's deliberate
   character, with compensating controls (blockers 1 and 3 below, plus the
   existing locked-participants rule). This is the recorded outcome of PRD
   §13.2.

The controller reviewed the product-impact analysis on 2026-08-16 and
decided further:

6. Most participants will never sign in, so the finance view stays
   anonymous-readable as it is today, names, balances, settlement and the
   payment QR included. What hides behind sign-in is only receipts and
   the data of people who do have an account (the existing
   locked-participants rule, enforced server-side instead of only in the
   UI). Creating an account is thereby the opt-out: signing in once is
   what hides your details. Blocker 1 is rescoped accordingly, and the
   policy describes this reality instead of a wall that does not exist.
7. Search engines: the homepage chata list and the chata page's default
   Informace render are indexable; to make that safe the indexable render
   carries no participant names (counts instead; names stay one click
   away on the other views). Organizace, Účastníci, Finance and Přehled
   stay anonymous-readable but carry noindex. Blocker 3 is rescoped
   accordingly.
8. Retention stands as decided (decision 4), with an explicit admin "mark
   settled" action starting the 12-month clock, not an automatic guess.
9. Admins keep the paste-any-URL background convenience, but the server
   fetches the image on save and stores a copy in the site's own storage,
   so no visitor request ever reaches the external host. Blocker 10 is
   rescoped accordingly.
10. Paylibo stays for now. A previous attempt at generating the payment
    QR locally produced codes that did not work, while Paylibo always
    has. The replacement is deferred to its own project, and until it
    lands the policy's recipient table must name Paylibo. Blocker 2 is
    rescoped to disclosure.
11. Editorial: legal text stays as short as validity allows, and all
    user-facing wording follows the humanizer conventions before it
    ships.

## Blockers: the documents are false until these are fixed

Each item names the claim it unblocks. Order follows risk, matching PRD
§14.

### 1. Hide receipts, emails and account-holders' data; the rest stays public by decision

Policy claim (section 6): "Without signing in, a visitor cannot see:
anyone's bank details, receipts, email addresses." Decision 6 changes the
claim itself: the section must be rewritten to promise only what the
product actually hides (receipts, emails, and the details of participants
with an active account), and to say openly that everything else on a
chata page is visible to anyone with the link.

Reality: `participants` (`src/collections/Participants.ts`), `expenses`,
`prepayments`, `joint-accounts` and `expense-attachments`
(`src/collections/ExpenseAttachments.ts`) are all `read: () => true`.
Account numbers and IBANs are served to anyone, receipt files are public by
bucket URL, and the chata slug route returns raw participant documents
regardless of viewer. GraphQL serves the same data with introspection on,
and the playground is routable in production. The finance gating in
`src/lib/financeAccess.ts` is UI-only, as CLAUDE.md says outright.

Work (rescoped by decision 6). The anonymous experience keeps names,
balances, the settlement view and the payment QR for participants without
accounts; nothing there changes. What must actually hide, and hide at the
API, not only in the UI:

- receipts: `expense-attachments` requires authentication, with
  non-guessable or signed URLs on the bucket,
- email addresses: never served to anonymous callers anywhere (REST,
  GraphQL, the slug API),
- account holders: the locked-participants rule enforced server-side. A
  participant whose account has signed in at least once has their bank
  fields, balances and breakdown withheld from anonymous API responses,
  exactly as the UI already pretends,
- plumbing that makes the above hold: a shaped response from the slug API
  instead of raw documents, the same rules applied to GraphQL, and the
  playground closed in production.

The policy's section 6 then says plainly: without signing in, a visitor
with the link sees the trip, its participants, their balances and, for
participants without an account, their bank details; a participant with
an active account has their details hidden until they sign in; receipts
and email addresses are never public. The Art. 14 notice (blocker 8)
tells every participant that signing in once is how they hide their
details.

Acceptance test per PRD §3.3: an unauthenticated request to any API route
or GraphQL query returns no receipt, no email, and no bank field, balance
or breakdown belonging to a locked participant; the test fails if a
future field re-exposes them.

### 2. Disclose Paylibo in the recipient table (replacement deferred)

Policy claim: Paylibo is absent from the recipient table (section 7).

Reality: `src/app/(frontend)/components/QRPayment.tsx` renders an `<img>`
whose URL sends the creditor's bank account, amount and payment message to
`api.paylibo.com`, along with the viewer's IP, on every settlement view.

Work (rescoped by decision 10): keep Paylibo and make the documents true
the other way round: add a Paylibo row to the recipient table (receives
the recipient's account number, amount and payment message, plus each
viewer's IP address and user agent) before publication. Because the
settlement view stays anonymous-readable (decision 6), the row covers
anonymous visitors' IPs too. Generating the SPD-format QR locally stays
on the roadmap as its own project; when a working local generator lands,
the row comes out again.

### 3. Index the homepage and a name-free Informace, noindex the rest

Policy claim (section 6): "we mark them so that search engines do not index
them."

Reality: no `robots.txt`, no `noindex` header or meta tag anywhere; chata
pages and the finance overview are crawlable, and the wildcard
`*.zicha.travel` routing means new subdomains appear without a deploy.

Work (rescoped by decision 7): the homepage chata list and the chata
page's default Informace render are deliberately indexable; to make that
safe, the indexable render carries no participant names (counts and
anonymous phrasing instead; names stay one click away on the noindexed
views, and signed-in viewers see them everywhere). Organizace, Účastníci,
Finance and Přehled remain anonymous-readable but carry noindex; they are
query-param views of the chata route, so the noindex metadata has to key
off the view rather than the path. Ship a `robots.txt`, apply the headers
on every host, and rewrite the policy sentence to describe this split
instead of blanket noindex. Verify on a chata subdomain, not just the
apex.

### 4. Stop logging email addresses

Policy claim (section 14): "We do not write personal data into application
logs."

Reality: `src/app/(payload)/api/auth/magic-link/request/route.ts` logs the
submitted email address, including addresses with no account;
`src/utils/claimRequests.ts` logs the admin's email when a claim
notification fails to send; `src/lib/email.ts` logs the recipient and
subject on preview deployments without `EMAIL_PREVIEW_TO`; and
`src/middleware.ts` logs hostnames and lookups on every request.

Work: drop the emails from all of these log lines (log a hash or nothing),
audit every remaining `payload.logger` and `console` call in the repository
for personal data, review the middleware logging, and make debug logging
opt-in in production. Going forward, no identifier belongs in a log line
without a stated reason.

### 5. Build the retention jobs

Policy claim (section 9): the whole retention table, with concrete periods.

Reality: nothing is ever deleted. No job clears bank details or receipts
after settlement, dormant accounts live forever, claim rejection reasons
are permanent, and Payload's internal tables grow without bound.

Work: a scheduled job (the existing `CRON_SECRET` cron pattern fits) that
clears participants' bank fields and deletes receipt files 12 months after
a chata's settlement, deletes accounts with `lastLoginAt` (or creation)
older than 2 years including their relations, and deletes decided claim
requests after 12 months. Per decision 8, "settled" is an explicit admin
action ("mark settled" on the chata) that starts the 12-month clock; do
not guess it from balances.
Add housekeeping for `payload-locked-documents`, `payload-preferences` and
`payload-kv`.

### 6. Build the rights machinery

Policy claim (section 10): any data subject, with or without an account,
gets access, a copy, rectification, erasure or restriction within a month;
erasure anonymizes while keeping the arithmetic.

Reality: none of it exists. Deleting a user cascades nowhere
(`participants.account`, `expenses.authoredBy`, claim requests keep
pointing at the deleted row), there is no way to erase or anonymize a
participant who never had an account, and an access request means
hand-written SQL across every collection.

Work, sized for a single part-time operator, admin-panel buttons are
enough:

- an export action that produces one person's complete bundle
  (participant rows, shares, invitations, prepayments, joint-account
  membership, authored expenses, account, claim requests) without leaking
  other people's data,
- an anonymize action that replaces name and declension forms with a
  placeholder, clears email, bank fields, `hasPet` and assignments, keeps
  amounts and shares so settled trips still add up, and detaches the
  account,
- deletion of a user account that cleans up or nulls every reference,
- a small log of requests received and how they were handled (the policy's
  one-month promise needs evidence).

### 7. Publish and wire up the documents

Claims: the policy says it is "linked in the footer of every page"; the
terms say you accept them by creating an account.

Reality: `/soukromi` covers analytics only; there is no terms page; nothing
at account creation, claim registration or magic-link request points at
either document.

Work: replace the `/soukromi` content with the privacy policy (per-locale
`content.cs.tsx` / `content.en.tsx`, same pattern as today), add a
`/podminky` page for the terms and put it into the middleware `SITE_PATHS`
allowlist next to `/soukromi`, link both from the footer, and show "by
continuing you agree to the terms, here is how we handle data" with links
on the login form, the claim dialog, the "I'm new here" registration and
the admin's "Create account from email" flow. Before filling in the
effective dates and deleting the pre-publication notes, re-edit the four
documents to match the round-two decisions: the rewritten section 6
public/hidden split (blocker 1), the Paylibo recipient row (blocker 2)
and the indexable/noindexed split (blocker 3). Per decision 11, keep the
text as short as validity allows and run every user-facing string through
the humanizer conventions.

### 8. Give the Art. 14 notice a path

Policy claim (section 5): admins send new participants a link to the
policy; the terms (section 6) oblige them to.

Reality: the obligation exists only in the unpublished terms. Nothing in
the product reminds an admin, so in practice the notice will not happen.

Work: a small nudge in the admin panel when participants are created (a
note on the Participants form or after "Prefill participants") with a
copyable message containing the policy link. Low tech is fine; zero tech is
not, because the legitimate-interest basis for participants leans on
people actually being told. Under decision 6 this notice carries extra
weight: it is also where a participant learns that their name, balance
and bank details are visible to anyone with the link, and that signing in
once is how they hide them. The copyable message must say so.

### 9. Rate limiting on public endpoints

Policy claim (section 14): "public forms are protected against bots and by
rate limiting."

Reality: Turnstile covers the login and claim forms, but there is no rate
limit anywhere. The magic-link endpoint mails an address supplied by the
caller, so it can mail-bomb a known address, and per-IP retry limits are
absent on all public POSTs.

Work: per-IP and per-address throttling on `magic-link/request`, claim
registration and the decide endpoints. Without this, soften the policy
sentence to Turnstile only; with it, the sentence stands.

### 10. Self-host the external assets or disclose them

Policy claim: neither Unsplash nor Google appears in the recipient table
(section 7).

Reality: the default Background row seeded by
`src/scripts/seed-defaults.ts` points at `images.unsplash.com`, and the
Backgrounds collection accepts external image URLs, so every visitor of a
chata using such a background fetches from Unsplash. The frontend's own
fallback is already self-hosted (`/bg/mountains-1920.avif` in
`ThemeProvider.tsx`); the flow survives only through data. The admin panel
also loads fonts from `fonts.googleapis.com`
(`src/app/(payload)/custom.scss`), a pattern German case law has fined.

Work (rescoped by decision 9): keep the paste-any-URL field, but on save
fetch the image server-side and store a copy in the site's own storage
(size cap and content-type check on the fetch), so visitors never load
from the external host. Repoint the seeded default background at the
self-hosted asset, migrate existing url-type rows in production the same
way, and self-host the two admin fonts. This stays a blocker because
publishing with the flow live would make the recipient table false; once
fetch-and-store lands, no new recipient row is needed.

## Security work the policy's wording already assumes

The policy's section 14 was written not to overclaim, but these belong to
the Art. 32 baseline it gestures at, and PRD §10 lists them as findings:

11. Security headers and a CSP (none are configured today).
12. The `pnpm migrate-from-prod` workflow copies real names, emails and
    IBANs onto developer machines with no anonymization step. Either add
    an anonymizing variant or record the justification and handling rule.
    If kept as is, it also belongs in the Art. 30 record.
13. A recorded backup story: whether Supabase PITR is on, backup lifetime
    and encryption. The policy's "backups overwrite themselves" (section
    10) must be checked against the actual Supabase settings and corrected
    if wrong.
14. A one-page breach procedure naming who assesses and who notifies the
    ÚOOÚ within 72 hours; the policy promises this in section 14.
15. Stolen-session story: JWTs cannot be revoked before expiry and there is
    no "sign out everywhere". The policy does not claim otherwise, so this
    is not a blocker, but record the accepted risk.

## Paperwork with no code component

16. Verify the Supabase project region is in the EU and record it. The
    policy's recipient table says "EU"; if the project sits elsewhere, the
    table is wrong and the transfer analysis changes.
17. Records of processing (Art. 30). The small-organisation exemption does
    not apply (processing is not occasional, includes financial data).
18. The legitimate-interest balancing test for participants-without-
    accounts, written down. It only survives once blockers 1 and 3 have
    landed, which is another reason they gate publication.
19. Processor agreements: confirm DPAs exist with Supabase, Vercel, Resend,
    PostHog and Cloudflare (standard online DPAs suffice) and note each
    provider's transfer mechanism (DPF membership or SCCs). Microsoft acts
    here as an independent controller for its own sign-in.
20. The DPIA-not-required conclusion, recorded with reasons (no large-scale
    processing, no systematic monitoring, no Art. 9 data by design),
    revisited if receipts start arriving with health data despite the
    terms.
21. A maintained inventory of outbound calls (today: Supabase, Vercel,
    Resend, PostHog via the first-party proxy, Cloudflare Turnstile,
    Microsoft OAuth, Open-Meteo from the browser, Google links on click)
    and of client-side storage (cookies plus the localStorage keys
    `zt_theme`, `chata-overview-mode`, `chata-selected-participant-*` and
    PostHog's `ph_*`, which the policy's section 11 discloses), with the
    rule that adding an endpoint, cookie or storage key updates the
    inventory and the policy.

## Smaller code items the documents assume

22. "Only adults may hold an account" (policy section 13, terms section 4)
    is enforced by nobody. A checkbox-level affirmation at claim
    registration and a note in the admin create-account flow is enough for
    a service this size.
23. The terms' "we announce shutdown in advance by email" and the policy's
    section 16 change-notification promise need nothing today, but note
    them wherever operational runbooks live, so a future shutdown or policy
    change actually follows them.

## Features at odds with the documents, accepted with eyes open

- **Anonymous trip pages carry real names, balances and, for participants
  without an account, bank details.** Kept deliberately (decisions 5 and
  6): most participants will never sign in, and settlement has to work for
  exactly those people. The compensating controls are the name-free
  indexable surface (blocker 3), the hiding of receipts, emails and
  account-holders' data (blocker 1), and the Art. 14 notice telling every
  participant that one sign-in hides their details (blocker 8). Residual
  risk is real and accepted: anyone with the link sees who was on the
  trip, who owes what, and the account numbers of participants who never
  signed in. If this ever becomes uncomfortable, the fallback designs
  stay the same: a per-chata secret in the URL or sign-in-only trip
  pages, both of which PRD §13.2 sketches.
- **Receipts can smuggle in Art. 9 data.** A pharmacy receipt is health
  data. The terms forbid uploading such receipts (section 5), retention
  deletes receipts 12 months after settlement (blocker 5), and access
  narrows to chata members (blocker 1). Accepted as residual risk;
  revisit the DPIA note (item 19) if it recurs in practice.
- **The AI Act statement is valid only while the product contains no AI.**
  The policy commits to updating before any AI feature ships. Receipt OCR,
  the most likely candidate, would make the operator a deployer of an AI
  system: transparency duties, a fresh look at Art. 22 GDPR if it fills in
  amounts automatically, and a new processor if it calls an external
  model. Treat "add AI" as "reopen the legal documents first".

## Suggested order

Blockers 1 to 4 and 10 first (they stop ongoing disclosures and, apart
from 1, are small), then 7 and 8 (publication), with 5, 6 and 9 landing in
the same release or immediately after; the paperwork items are an evening of
writing that can run in parallel. This mirrors PRD §14 and keeps the gap
between "documents published" and "documents true" at zero, which is the
whole point of this file.
