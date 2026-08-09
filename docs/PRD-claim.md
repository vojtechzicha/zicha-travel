# PRD: Claim účastníka — "Jsi to ty?"

## Motivation

Accounts used to be created only by admins in the panel. An anonymous
visitor who finds "their" participant in a chata had no way to say "this
is me" and get an account linked to it. The claim flow lets them do
exactly that — with admin approval as the identity check, so nobody can
grab someone else's finances.

## Data model

New collection **`claim-requests`** ("Žádosti o propojení", admin group
Expense Tracking):

| field            | type                          | meaning                                             |
| ---------------- | ----------------------------- | --------------------------------------------------- |
| `participant`    | relationship → `participants` | who is being claimed                                |
| `chata`          | relationship → `chatas`       | derived from participant (drives admin scoping)     |
| `user`           | relationship → `users`        | the claiming account                                |
| `status`         | select                        | `pending` / `approved` / `rejected` / `cancelled`   |
| `reason`         | textarea                      | rejection reason — REQUIRED, emailed to requester   |
| `decidedBy`      | relationship → `users`        | deciding admin (empty for auto-approvals)           |
| `decidedAt`      | date                          | when decided                                        |
| `autoApproved`   | checkbox                      | "známá tvář" shortcut applied                       |
| `reminderSentAt` | date                          | the one 3-day reminder went out                     |

Kept separate from `Participants` so the audit trail (who claimed what,
who decided, why rejected) survives the decision, and several rival
requests can coexist naturally.

- **Read access is NOT public** (rows link user emails to participants):
  superadmins see all, admins their chatas, a frontend user only their own
  requests. Writes are chata-scoped; the flow endpoints use
  `overrideAccess` after their own validation.
- **Claimable** = participant not locked in the Finance-view sense (no
  account, or an account that NEVER logged in). A pending claim does NOT
  lock the participant — more requests may arrive and the admin picks.
- Production schema ships via `NEW_SCHEMA_DDL` in
  `scripts/migrate-payer-polymorphic.mjs` (idempotent, runs in every
  Vercel build); local dev gets it from the dev-mode schema push.

## Flow

1. **Entry points** (anonymous visitor): quiet "bez účtu" notes in the
   participant selector (plus "někdo už požádal" when a claim is pending),
   and the main entry — the `ClaimBanner` under the finance header once a
   participant is open: "Díváš se jako Katka. Jsi to ty?".
2. **Path choice** (`ClaimDialog`): "Už tu účet mám" (Microsoft or magic
   link) vs "Jsem tu poprvé" (email → `POST /api/claim-requests/register`
   creates a `role: user` account and sends a magic link; the click is
   both email verification and first login). The response never reveals
   whether the email already had an account; superadmin emails get the
   standard explanation mail instead of a login link.
3. **Claim intent survives login** in the returnTo URL
   (`?view=finance&participant=N&claim=N`, built by `claimReturnTo`).
   Back on the finance view, the frontend strips the param and calls
   `POST /api/claim-requests/submit` (still anonymous → the dialog opens
   instead).
4. **Submit** (signed-in): validates the participant is claimable, is
   idempotent per (participant, user), then either **auto-approves** or
   files `pending` and emails the decision makers (superadmins + admins of
   the chata) with signed decide links.
5. **Decide**: links go to `/claims/decide?token=…` — the token (JWT,
   `PAYLOAD_SECRET`, 7 days, bound to one claim AND one admin) is the
   credential. The page shows context (requester email, other pending
   requests, whether an inactive admin-created link would be replaced) and
   POSTs to `/api/claim-requests/decide` — deliberately NOT a mutating
   GET, because mail scanners prefetch links. Rejection requires a reason.
   The same decision can be made in the admin panel by editing `status`;
   a collection hook runs identical side effects for every path.
6. **Waiting / outcome**: the requester sees the waiting banner (with
   "Vzít zpět" → `POST /api/claim-requests/:id/cancel`) and gets the
   outcome by email; approval also flips their Finance view to
   linked-user mode on the next data load.

## Auto-approval ("známá tvář")

`autoApproveReason` in `src/lib/claimRequests.ts` — approve WITHOUT an
admin only when:

- the requester already has a linked participant in a **different** chata
  (someone vouched for them there), AND the target participant has **no**
  account link at all; or
- the requester is an admin of the chata (they could approve themselves in
  the panel anyway).

A linked participant in the **same** chata is deliberately NOT enough — it
would let anyone approved once grab other participants of their own chata
unchecked. In fact, an account that already owns a participant in the
chata cannot claim another there at all (`account-has-participant`): one
participant per account and chata is the self-service limit, and admins
link children/partners in the panel (the data model itself still allows
many participants per account — `paidBy` relies on it). Auto-approvals
are still recorded as approved claim-requests for the audit trail.

## Decision side effects (single source of truth)

`runClaimDecisionSideEffects` (`src/utils/claimRequests.ts`), invoked from
the collection's `afterChange` hook on every pending → approved/rejected
transition:

- **approved**: link `participants.account`, auto-reject every rival
  pending claim (each rejection re-enters the hook and emails its own
  requester), email the requester — unless `autoApproved` (the person is
  looking at the confirmation screen).
- **rejected**: email the requester with the mandatory reason.
- A `beforeChange` guard blocks approving a claim whose participant is
  already linked to an **active** account (a rival approved earlier) —
  a never-used admin-created link is replaceable, with a warning shown on
  the decide page.

## Edge cases

- Participant linked to an active account → not claimable anywhere; the
  submit endpoint answers 409 `participant-locked`.
- Participant with an admin-created but never-used account → claimable,
  but never auto-approved; approval replaces the stale link.
- Duplicate submit → returns the existing pending request. Claiming an
  already-own participant → `already-linked` no-op.
- Emails failing never lose the claim (logged; the queue stays in the
  panel). Preview deployments redirect all mail (`src/lib/email.ts`).
- Expired/foreign/reused decide tokens each get a distinct friendly page;
  the named admin must still manage the chata at decision time.
- A pending claimant browses exactly like an anonymous visitor — nothing
  unlocks before approval.

## Reminder

`GET /api/claim-requests/remind` (Vercel cron, daily at 07:00 — see
`vercel.json`; authenticated by `Authorization: Bearer CRON_SECRET`, or a
signed-in superadmin for manual runs) re-mails the decision makers once
per claim pending ≥ 3 days (`reminderSentAt` prevents repeats).

## Bot protection (Cloudflare Turnstile)

The two public POST endpoints are captcha-gated — `register` can CREATE
accounts, `magic-link/request` sends emails:

- One **managed** Turnstile sitekey serves both forms. The login form
  renders it invisibly (`appearance: "interaction-only"`); the claim
  dialog shows the full widget (`appearance: "always"`).
- Server-side verification in `src/lib/turnstile.ts` (fail-closed when
  configured). Widget in `TurnstileWidget.tsx`; tokens are single-use, so
  forms reset the widget after every submit.
- Env: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (client, build-time) +
  `TURNSTILE_SECRET_KEY` (server). Both unset (local dev) = captcha
  disabled end to end.
