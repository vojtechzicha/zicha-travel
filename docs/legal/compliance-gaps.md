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

## Blockers: the documents are false until these are fixed

Each item names the claim it unblocks. Order follows risk, matching PRD
§14.

### 1. Take bank details, receipts and emails off the public API

Policy claim (section 6): "Without signing in, a visitor cannot see:
anyone's bank details, receipts, email addresses."

Reality: `participants` (`src/collections/Participants.ts`), `expenses`,
`prepayments`, `joint-accounts` and `expense-attachments`
(`src/collections/ExpenseAttachments.ts`) are all `read: () => true`.
Account numbers and IBANs are served to anyone, receipt files are public by
bucket URL, and the chata slug route returns raw participant documents
regardless of viewer. GraphQL serves the same data with introspection on,
and the playground is routable in production. The finance gating in
`src/lib/financeAccess.ts` is UI-only, as CLAUDE.md says outright.

Work: field-level or row-level access on bank fields (owner account, banker,
chata admins only), authenticated access to `expense-attachments` and
non-guessable or signed URLs on the bucket, a shaped response from the slug
API instead of raw documents, the same rules applied to GraphQL, and the
playground closed in production. Acceptance test per PRD §3.3: an
unauthenticated request to any API route or GraphQL query returns no bank
account number, IBAN, receipt or email, and the test fails if a future
field re-exposes them.

### 2. Replace the Paylibo QR code

Policy claim: Paylibo is absent from the recipient table (section 7).

Reality: `src/app/(frontend)/components/QRPayment.tsx` renders an `<img>`
whose URL sends the creditor's bank account, amount and payment message to
`api.paylibo.com`, along with the viewer's IP, on every settlement view.

Work: generate the Czech payment QR (SPD format) locally, server-side or
client-side, and drop the dependency. The format is a self-contained
standard, so nothing needs to reach a third party.

### 3. Keep search engines out

Policy claim (section 6): "we mark them so that search engines do not index
them."

Reality: no `robots.txt`, no `noindex` header or meta tag anywhere; chata
pages and the finance overview are crawlable, and the wildcard
`*.zicha.travel` routing means new subdomains appear without a deploy.

Work: `X-Robots-Tag: noindex` (or equivalent metadata) on every page that
renders personal data, on every host, plus a `robots.txt`. Verify on a
chata subdomain, not just the apex.

### 4. Stop logging email addresses

Policy claim (section 14): "We do not write personal data into application
logs."

Reality: `src/app/(payload)/api/auth/magic-link/request/route.ts` logs the
submitted email address, including addresses with no account, and
`src/middleware.ts` logs hostnames and lookups on every request.

Work: drop the email from the log line (log a hash or nothing), review the
middleware logging, and make debug logging opt-in in production.

### 5. Build the retention jobs

Policy claim (section 9): the whole retention table, with concrete periods.

Reality: nothing is ever deleted. No job clears bank details or receipts
after settlement, dormant accounts live forever, claim rejection reasons
are permanent, and Payload's internal tables grow without bound.

Work: a scheduled job (the existing `CRON_SECRET` cron pattern fits) that
clears participants' bank fields and deletes receipt files 12 months after
a chata's settlement, deletes accounts with `lastLoginAt` (or creation)
older than 2 years including their relations, and deletes decided claim
requests after 12 months. Define "settled" operationally (e.g. the trip
ended and balances are within the 1 Kč threshold, or an admin marks it).
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
the admin's "Create account from email" flow. Fill in the effective dates
and delete the pre-publication notes from all four documents.

### 8. Give the Art. 14 notice a path

Policy claim (section 5): admins send new participants a link to the
policy; the terms (section 6) oblige them to.

Reality: the obligation exists only in the unpublished terms. Nothing in
the product reminds an admin, so in practice the notice will not happen.

Work: a small nudge in the admin panel when participants are created (a
note on the Participants form or after "Prefill participants") with a
copyable message containing the policy link. Low tech is fine; zero tech is
not, because the legitimate-interest basis for participants leans on
people actually being told.

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

## Security work the policy's wording already assumes

The policy's section 14 was written not to overclaim, but these belong to
the Art. 32 baseline it gestures at, and PRD §10 lists them as findings:

10. Security headers and a CSP (none are configured today).
11. The `pnpm migrate-from-prod` workflow copies real names, emails and
    IBANs onto developer machines with no anonymization step. Either add
    an anonymizing variant or record the justification and handling rule.
    If kept as is, it also belongs in the Art. 30 record.
12. A recorded backup story: whether Supabase PITR is on, backup lifetime
    and encryption. The policy's "backups overwrite themselves" (section
    10) must be checked against the actual Supabase settings and corrected
    if wrong.
13. A one-page breach procedure naming who assesses and who notifies the
    ÚOOÚ within 72 hours; the policy promises this in section 14.
14. Stolen-session story: JWTs cannot be revoked before expiry and there is
    no "sign out everywhere". The policy does not claim otherwise, so this
    is not a blocker, but record the accepted risk.

## Paperwork with no code component

15. Verify the Supabase project region is in the EU and record it. The
    policy's recipient table says "EU"; if the project sits elsewhere, the
    table is wrong and the transfer analysis changes.
16. Records of processing (Art. 30). The small-organisation exemption does
    not apply (processing is not occasional, includes financial data).
17. The legitimate-interest balancing test for participants-without-
    accounts, written down. It only survives once blockers 1 and 3 have
    landed, which is another reason they gate publication.
18. Processor agreements: confirm DPAs exist with Supabase, Vercel, Resend,
    PostHog and Cloudflare (standard online DPAs suffice) and note each
    provider's transfer mechanism (DPF membership or SCCs). Microsoft acts
    here as an independent controller for its own sign-in.
19. The DPIA-not-required conclusion, recorded with reasons (no large-scale
    processing, no systematic monitoring, no Art. 9 data by design),
    revisited if receipts start arriving with health data despite the
    terms.
20. A maintained inventory of outbound calls (today: Supabase, Vercel,
    Resend, PostHog via the first-party proxy, Cloudflare Turnstile,
    Microsoft OAuth, Open-Meteo from the browser, Google links on click),
    with the rule that adding an endpoint updates the inventory and the
    policy's recipient table.

## Smaller code items the documents assume

21. Backgrounds are seeded from `images.unsplash.com`
    (`src/scripts/seed-defaults.ts`), so visitors' browsers fetch from
    Unsplash, which the policy does not disclose. Self-host the default
    background (the Backgrounds collection already supports uploads) or add
    Unsplash to the recipient table.
22. The admin panel loads fonts from `fonts.googleapis.com`
    (`src/app/(payload)/custom.scss`). Admin-only, but German case law has
    fined exactly this pattern; self-hosting the two fonts is cheap and
    removes the question.
23. "Only adults may hold an account" (policy section 13, terms section 4)
    is enforced by nobody. A checkbox-level affirmation at claim
    registration and a note in the admin create-account flow is enough for
    a service this size.
24. The terms' "we announce shutdown in advance by email" and the policy's
    section 16 change-notification promise need nothing today, but note
    them wherever operational runbooks live, so a future shutdown or policy
    change actually follows them.

## Features at odds with the documents, accepted with eyes open

- **Anonymous trip pages carry real names, including children's.** Kept
  deliberately (decision 5). The compensating controls are noindex
  (blocker 3), the removal of bank data, receipts and emails from public
  reach (blocker 1), and the existing rule that locked participants'
  finance details hide from anonymous viewers. Residual risk stays: anyone
  with the link sees who was on the trip and who owes what. If this ever
  becomes uncomfortable, the fallback design is a per-chata secret in the
  URL or sign-in-only trip pages, both of which PRD §13.2 sketches.
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

Blockers 1 to 4 first (they stop ongoing disclosures and are small apart
from 1), then 7 and 8 (publication), with 5, 6 and 9 landing in the same
release or immediately after; the paperwork items are an evening of
writing that can run in parallel. This mirrors PRD §14 and keeps the gap
between "documents published" and "documents true" at zero, which is the
whole point of this file.
