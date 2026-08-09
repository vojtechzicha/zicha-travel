# PRD: GDPR compliance

**Status:** Draft — findings agreed, decisions open
**Date:** 2026-08-09
**Scope:** the whole product (public site, admin panel, APIs, ops)

> This document states **what must change and why**. It deliberately does
> **not** design the implementation — no schemas, endpoints or code shapes.
> Each requirement is written so it can be verified as done or not done.
> Implementation PRDs (or issues) should be spun off per section.

## 1. Problem

The system processes personal data of people who mostly never signed up for
it: full names (plus Czech declension forms), email addresses, **bank
account numbers and IBANs**, who owes whom how much, who sleeps in which
bed with whom, who rides in whose car, receipt scans, and — via
`Participant.paidBy`, which explicitly models "a child paid by a parent" —
data about minors.

None of the GDPR groundwork exists. There is no privacy notice, no records
of processing, no legal-basis analysis, no retention policy, no way to
erase or export a person's data, and — most seriously — **the data is not
access-controlled at all**: every data collection is world-readable through
the public API. A privacy notice cannot be written honestly on top of the
current access model, so §3 is a prerequisite for the rest.

Two aggravating factors run through everything below:

- The site is **indexable**. There is no `robots.txt` and no `noindex`, and
  the finance overview is open to anonymous visitors by design.
- Most data subjects are **not users**. Participants are entered by an
  admin without ever being contacted, which triggers the Art. 14 notice
  duty (data not obtained from the subject), not just Art. 13.

## 2. Goals / non-goals

**Goals**

1. Personal data is accessible only to people who have a reason to see it.
2. Every processing activity has a documented purpose, legal basis,
   recipient list and retention period.
3. Data subjects can be informed, and their Art. 15–21 requests can be
   answered within one month without hand-written SQL.
4. Data flows to third parties are known, minimized, disclosed and covered
   by processor agreements.
5. Nothing in the product silently accumulates personal data forever.

**Non-goals**

- Becoming a commercial-grade privacy program. This is a small private
  project; the target is *defensible and honest*, not enterprise ceremony.
- Certification, DPO appointment, or a DPIA — see §12 for why these are
  assessed as not required, which is itself a decision that must be
  recorded rather than assumed.
- Changing the finance math, the settlement model, or the product's
  "everyone in a chata can see the shared numbers" character. The aim is to
  scope that openness to the chata, not to abolish it.

## 3. Access control (prerequisite)

### 3.1 Current state

Every data collection is `read: () => true`:

| Collection            | Location                            | Exposed to anyone, unauthenticated                    |
| --------------------- | ----------------------------------- | ----------------------------------------------------- |
| `participants`        | `src/collections/Participants.ts:119` | name, declension forms, **`accountNumber`, `iban`**, `hasPet`, `paidBy` |
| `chatas`              | `src/collections/Chatas.ts:90`      | **`bankerAccountNumber`, `bankerIban`**, bedroom occupancy, car rosters, trip dates and location |
| `expenses`            | `src/collections/Expenses.ts:132`   | who paid what, split weights, invitations             |
| `prepayments`         | `src/collections/Prepayments.ts:14` | who transferred how much                              |
| `joint-accounts`      | `src/collections/JointAccounts.ts:20` | which participants share a bank account             |
| `expense-attachments` | `src/collections/ExpenseAttachments.ts:23` | **receipt scans**, also public by URL on the bucket |

`users` is correctly restricted, and the hidden magic-link token fields
correctly deny read.

The Finance-view gating (`src/lib/financeAccess.ts` and the `locked` list
built in the chata slug route) is **UI-only** — CLAUDE.md says so
explicitly. The same route returns raw participant documents including
IBANs regardless of who is asking. `/api/graphql` serves the same data with
introspection enabled, and `/api/graphql-playground` is publicly routable.

### 3.2 Requirements

1. **Bank details must not be readable by the public.** Account numbers and
   IBANs — on participants and on the chata's banker fields — are visible
   only to the person they belong to and to admins of that chata.
2. **Receipts must not be world-readable**, neither through the API nor by
   guessing/holding a bucket URL. Receipt images are the single richest
   source of incidental personal data in the system (names, card fragments,
   addresses, and occasionally pharmacy items that would count as Art. 9
   health data).
3. **Server-side enforcement.** Any rule the UI applies to hide a person or
   a number must be enforced where the data is produced. A UI-only rule is
   treated as a defect, not a feature.
4. **The chata slug endpoint must return a shaped response**, not raw
   documents — so that adding a field to a collection cannot silently
   publish it.
5. **GraphQL is covered by the same rules**, and the playground is not
   reachable in production.
6. **A decision is required** (§13) on whether trip content — participant
   names, bedroom and car organization, the finance overview — stays
   anonymously readable per chata, or moves behind a per-chata secret or
   sign-in. This is the single decision that most changes the shape of the
   work.

### 3.3 Acceptance

An unauthenticated request to any public API route, and any GraphQL query,
returns no bank account number, no IBAN, no receipt, and no email address —
verified by a test that would fail if a future field re-exposed them.

## 4. Search-engine exposure

**Current state:** no `robots.txt`, no `noindex` in the frontend layout or
any page. Chata pages and the finance overview render full names and
who-owes-whom to anonymous visitors, so search engines may crawl, index and
cache them.

**Requirements**

1. Pages rendering personal data are excluded from indexing, by robots
   directives and response headers, not by obscurity of URL.
2. The exclusion holds for every chata subdomain (wildcard `*.zicha.travel`
   routing means new subdomains appear without a deploy).
3. If §3.2.6 lands on "keep it anonymously readable", this section is the
   compensating control and must be verified, not assumed.

## 5. Transparency and legal documentation

Nothing in this class currently exists — a repository-wide search finds no
mention of privacy, GDPR, cookies or consent.

**Required artefacts**

1. **Privacy notice** ("Zásady ochrany osobních údajů"), reachable from the
   footer on every page and linked from the login and claim dialogs.
   Must cover: controller identity and contact, categories of data,
   purposes, legal bases, recipients (§8), retention (§7), data-subject
   rights and how to exercise them (§6), the right to complain to the ÚOOÚ,
   and whether any transfers leave the EEA.
2. **Art. 14 notice path** for participants entered by an admin who have
   never been contacted. The notice duty applies within a month of entry,
   or at first communication. A workable route must be decided — e.g. the
   notice reaching people through whoever invites them to the trip — and
   written down; today there is no route at all.
3. **Records of processing (Art. 30).** The Art. 30(5) small-organisation
   exemption does **not** apply here: processing is not occasional and it
   includes financial data.
4. **Legal-basis analysis** per purpose. Expect legitimate interest for
   running the trip's shared accounting, contract-adjacent reasoning for
   account holders, and a legitimate-interest balancing test that must be
   recorded — and that only survives once §3 is fixed.
5. **Controller model.** Chata admins independently decide what is recorded
   about participants. Either they are joint controllers (Art. 26
   arrangement needed) or they act under the site operator's instruction.
   Pick one, state it in the notice, and make the admin UI consistent with
   it.
6. **Breach procedure (Art. 33/34):** who notices, who assesses, who
   notifies the ÚOOÚ within 72 hours, and how affected people are told.
   One page is enough; zero pages is not.

## 6. Data-subject rights

**Current state:** no machinery of any kind.

- **Erasure.** Deleting a `users` row is superadmin-only in the admin panel
  and cascades nowhere: `participants.account`, `expenses.authoredBy` and
  (on the claim branch) claim-request rows are left pointing at a deleted
  account. There is **no way at all to erase a participant who never had an
  account** — and that is most people in the system.
- **Access / portability.** Answering a request today means hand-written
  SQL across participants, expenses (authored, weights, invitations),
  prepayments, joint-account membership, attachments, users, and claim
  requests.
- **Rectification.** A person without an account has no path to correct
  their own name or bank details.
- **Objection / restriction.** No concept exists.

**Requirements**

1. Erasure must be possible for **any** data subject, account or not, and
   must leave the finance math intact — a settled trip's arithmetic cannot
   silently change because a name was removed. This tension (erasure vs.
   the integrity of a shared financial record) is the core design problem
   of this section and must be resolved explicitly, most likely by
   distinguishing erasure from anonymization-in-place.
2. Access and portability requests must be answerable by producing a
   complete bundle for one person across **all** collections, without
   leaking the other participants' data in the process — a person's
   expense shares necessarily reference other people.
3. Rectification must be possible without an account.
4. There must be a stated, reachable channel for making a request, and a
   record of requests received and how they were handled.
5. Requests must be answerable within one month; the process should assume
   a single part-time operator, not a support team.

## 7. Retention and minimization

**Current state:** nothing is ever deleted. Chatas, expenses, prepayments,
receipts, participants, accounts, `lastLoginAt`, Payload's internal
`payload-locked-documents` / `payload-preferences` / `payload-kv` tables —
all accumulate without bound. On the claim branch, claim requests retain
**free-text rejection reasons about a named person** permanently.

**Requirements**

1. A retention period per data category, written down and then actually
   enforced — not just documented.
2. **Bank details are the priority.** Retaining IBANs indefinitely after a
   trip has settled is hard to justify; they should not outlive the purpose
   that collected them, even if the trip record itself is kept.
3. Receipts need their own period; they are the highest-risk category and
   the least likely to be needed after settlement.
4. Accounts that never completed a login, and accounts dormant for a long
   period, need an end state.
5. Payload's internal tables need a housekeeping story.
6. Minimization review of what is collected at all: the declension fields
   and `hasPet` are proportionate; the open question is whether bedroom
   occupancy and car rosters need to persist after the trip ends.

## 8. Third parties and data flows

Every recipient below must appear in the privacy notice, be covered by a
processor agreement (Art. 28) where it acts as a processor, and have its
transfer basis checked (SCCs / adequacy / DPF) where it is outside the EEA.

| Recipient                  | What reaches it                                          | Notes |
| -------------------------- | -------------------------------------------------------- | ----- |
| **Paylibo** (`api.paylibo.com`) | **Creditor's bank account number, amount and payment message in a URL query string**, plus the viewer's IP — on every settlement view, as an `<img>` src (`src/app/(frontend)/components/QRPayment.tsx`) | The most objectionable flow in the product: bank details disclosed to an uncontracted third party and written into its access logs. **Avoidable** — the Czech payment QR is a self-contained standard. Removing this dependency is a requirement, not an option. |
| **Unsplash** (`images.unsplash.com`) | Every visitor's IP, for a background image | Avoidable by self-hosting the asset. |
| **Cloudflare Turnstile** (`challenges.cloudflare.com`) | Visitor IP and browser signals on public forms | Present on the claim branch, not on `main`. Must be disclosed; assess what it stores client-side. |
| **Microsoft** (OAuth)      | Identity of admins signing in                            | User-initiated and expected; disclose. |
| **Resend**                 | Recipient email addresses and full message bodies        | Processor. |
| **Supabase**               | The entire database and the media/receipt bucket         | Processor; record the hosting region. |
| **Vercel**                 | Hosting, plus request logs containing IP addresses       | Processor; record log retention. |
| **Google Calendar** links  | Nothing automatic — user-initiated navigation            | No action beyond honesty in the notice. |

**Requirement:** a maintained inventory of outbound calls, and a rule that
adding a new third-party asset or endpoint requires updating it. Today the
list can only be reconstructed by grepping for URLs.

## 9. Logging

**Current state**

- `src/app/(payload)/api/auth/magic-link/request/route.ts:52` writes **email
  addresses** into the platform log, including addresses that have no
  account — i.e. logging personal data about non-users.
- `src/middleware.ts` `console.log`s hostnames and domain-lookup results on
  every request.
- Vercel retains its own request logs, including IP addresses, under terms
  the project has not recorded.

**Requirements**

1. No personal data in application logs unless there is a stated reason and
   a stated retention period.
2. Platform log retention is documented and disclosed in the notice.
3. Debug logging is not left enabled in production by default.

## 10. Security measures (Art. 32)

These must be both *fixed where weak* and *written down*, because Art. 32
compliance is demonstrated by describing the measures in place.

1. **No rate limiting** on the public magic-link endpoint. On `main` there
   is no bot protection there either (the claim branch adds Turnstile).
   The endpoint sends mail to an address supplied by the caller, so it can
   be used to mail-bomb a known address.
2. **Sessions are stateless JWTs** with a 30-day lifetime for frontend
   users (`src/lib/auth/session.ts`). Deleting an account does invalidate
   them (the auth strategy re-reads the user), but a **stolen token cannot
   be revoked** before it expires, and there is no "sign out everywhere".
3. **No security headers / CSP** are configured.
4. **`pnpm migrate-from-prod` clones the entire production database** —
   real names, emails, IBANs — onto developer laptops, with no
   anonymization step and no stated handling rules. Receipt files are
   synced too. This needs either an anonymizing step or an explicit,
   recorded justification and handling rule.
5. **`media-backup/` is not in `.gitignore`** and currently holds a JSON
   dump of chata data in the working tree. Production personal data is one
   `git add -A` away from the repository history. Untracked-but-ignored is
   the minimum; the general rule is that data dumps never live in the repo
   directory.
6. **No backup policy** is recorded: whether Supabase PITR is on, how long
   backups live, whether they are encrypted, and how erasure requests
   interact with backups (they must be addressed in the notice, since
   backups cannot usually be edited).
7. **No admin audit log.** There is no record of who viewed, changed or
   exported personal data in the admin panel.
8. `PAYLOAD_SECRET` signs both session and decide-link tokens; a rotation
   story should be recorded, given that rotation invalidates live sessions.

## 11. Cookies and ePrivacy

**Current state is good and should be preserved deliberately.** The only
cookies are the `payload-token` session cookie and the OAuth state cookie —
both strictly necessary — and there is **no analytics or tracking anywhere**
in the product.

**Requirements**

1. No consent banner is required at present. Record *why* (strictly
   necessary cookies only, no analytics), so the conclusion is revisited if
   that changes.
2. The session cookie is set on `Domain=.zicha.travel`, so it is shared
   across every chata subdomain. Disclose this.
3. Turnstile's client-side storage must be assessed before the claim branch
   ships, since a third-party script is a different question from a
   first-party session cookie.
4. Introducing any analytics, heatmap or A/B tool re-opens this section.

## 12. Children's data

`Participant.paidBy` exists precisely to model children whose shares a
parent covers. The product therefore stores minors' names, sleeping
arrangements, travel arrangements and expense participation.

**Requirements**

1. State the legal basis for processing children's data and who provides
   it (the parent, in practice).
2. Confirm and enforce that accounts are not created for minors.
3. Treat this as a weighting factor in §3 and §4: children's names and
   bedroom assignments on an anonymously readable, indexable page is the
   finding an auditor would lead with.
4. Record the DPIA assessment (Art. 35). A DPIA is probably not mandatory
   here — no large-scale processing, no systematic monitoring, no Art. 9
   data by design — but "probably not required" must be a recorded
   conclusion, especially given children's data plus financial data plus
   the possibility of Art. 9 data arriving incidentally in a receipt scan.

## 13. Open decisions

These block the rest and are not the implementer's to make:

1. **Who is the controller?** The site operator personally, or each chata
   admin jointly? (§5.5) Everything in the notice depends on this.
2. **Does anonymous access to a chata survive?** Keep the current "anyone
   with the link sees the trip" model with bank details and receipts
   removed, or move trip content behind sign-in or a per-chata secret?
   (§3.2.6)
3. **Retention periods** per category — trips, expenses, receipts, bank
   details, accounts, claim requests. (§7)
4. **Erasure semantics:** true deletion versus anonymization-in-place, and
   what happens to a settled trip's arithmetic. (§6.1)
5. **How the Art. 14 notice actually reaches participants** who were
   entered by an admin. (§5.2)
6. **Is the production-clone workflow kept?** If yes, under what recorded
   handling rules; if no, what replaces it for debugging. (§10.4)

## 14. Priority

Ordered by risk reduction per unit of work:

1. **§3 access control** — bank details and receipts off the public API.
   Nothing else is defensible until this lands.
2. **§4 no-index** and **§8 Paylibo removal** — both small, both stop an
   ongoing disclosure.
3. **§5 privacy notice** and the recipient list, which §8 makes writable.
4. **§10.5 `media-backup/`** — one line, removes a live risk of committing
   production data.
5. **§9 stop logging email addresses**, **§10.1 rate limiting**.
6. **§6 rights machinery** and **§7 retention** — the largest builds, and
   the ones that need the §13 decisions first.
7. **§5.3/5.6, §11.1, §12.4** — the written records that make the rest
   demonstrable.

## 15. Relationship to other work

- The **claim flow** (`claude/participant-claim`, `docs/PRD-claim.md`) adds
  a `claim-requests` collection holding email-to-participant links and
  permanent free-text rejection reasons about named people, plus Turnstile
  as a new third-party recipient. It is correctly non-public-read, but it
  extends §6, §7 and §8 and should not ship without them being noted.
- **`docs/PRD-uzivatele.md`** defines the account, role and finance-gating
  model this document constrains; the "UI gating only — read APIs stay
  public" statement in CLAUDE.md is the exact thing §3 changes.
- **`docs/PRD-pozvani.md`** and **`docs/PRD-spolecny-ucet.md`** define data
  that §3 and §7 cover, but need no changes of their own.
