# PRD: Výdaj za jiného plátce (recording an expense somebody else paid)

## Motivation

Frontend authoring ("výdaje od účastníků") lets a signed-in participant add
an expense they paid themselves. In practice one person often ends up doing
the bookkeeping for the whole trip: "Katka bought the wood, she is driving
home tomorrow, I'll enter it for her."

Until now the only way to record that was to ask an admin. But a claim about
somebody else's money must not simply appear in the settlement on one
person's word, so it is stored **and held back**: nobody sees it and no
balance moves until the person it names — or the banker ("pokladník") —
confirms it.

It is not the usual case, so the UI keeps it quiet: one small link under the
payer chips.

## Rules

Who may record an expense for another payer, and what happens then:

| author                    | payer                              | result                                       |
| ------------------------- | ---------------------------------- | -------------------------------------------- |
| superadmin / chata admin  | anyone                             | approved right away (admins already decide)  |
| frontend user (`user`)    | own participant / own joint account | approved right away (unchanged behaviour)   |
| frontend user             | another participant **with** an account | pending: **the payer** or the banker/admins confirm |
| frontend user             | another participant **without** an account | pending: **the banker/admins** confirm |
| frontend user             | a joint account they are not in    | refused (403) — see below                    |

A **joint account is a shared wallet, not a person**: nobody can confirm a
payment out of it on the other members' behalf, so it stays members-only
instead of entering the approval queue.

The **author is never an approver** — approving your own claim would defeat
the point. If the author is also the banker or an admin, the expense is
approved on the spot by the rules above.

## Data model (Expenses)

| field                | type                       | meaning                                                     |
| -------------------- | -------------------------- | ----------------------------------------------------------- |
| `approvalStatus`     | select, default `approved` | `approved` \| `pending` \| `rejected`                        |
| `approvalNote`       | textarea                   | rejection reason, emailed to the author                      |
| `approvalDecidedBy`  | → users (read-only)        | who decided                                                  |
| `approvalDecidedAt`  | date (read-only)           | when                                                         |
| `payerAccount`       | → users (read-only, maxDepth 0) | account of the paying participant, kept in sync by hooks |

`payerAccount` is what makes an expense recorded FOR somebody **theirs**:
they see it while it waits, they may confirm it, and afterwards they may
correct or delete it (same rights as the author, `Expenses.authoredBy`).
Access filters cannot join, hence the denormalized column; a
`Participants` afterChange hook re-stamps it whenever an account link
changes (a claim approval, an admin re-link), and the deploy migration
backfills it.

Legacy rows have no `approvalStatus` at all — `isCountedExpense(null)` is
`true`, so nothing that existed before this feature is ever hidden.

## Invisible until confirmed

Three layers, because the read API is public by design:

1. **Maths** — `calculateStats` drops everything but `approved` (and legacy
   `null`) before any of the per-participant work, so the chata hook, the
   homepage batch, the slug API and the overview all agree without knowing
   about the feature.
2. **Slug API** (`/api/chatas/slug/:slug`, local API, access overridden) —
   pending/rejected expenses ship only to the people who have business with
   them: chata admins, the author, the payer's account, the banker's
   account. For everybody else they are not in the payload at all.
3. **Payload REST read access** — anonymous and unrelated accounts get a
   `Where` that hides anything not approved. The `/api/chatas/:id/full`
   export (anonymous) filters in its query.

## Deciding

`POST /api/expenses/decide` with `{ action: 'approve' | 'reject', reason? }`
and either

- `token` — the 14-day JWT from the notification email (`purpose:
  expense-decide`, bound to one expense **and** one recipient), or
- a session cookie — the button on the expense card.

Either way the **current** rules decide (`canDecideExpense`), so a forwarded
link cannot outlive a role change or a re-linked participant. The endpoint
writes the verdict with `context.expenseDecision`, which tells the authoring
hook to keep its hands off the status it is setting.

The email link leads to `/expenses/decide?token=…`, which renders the
expense and POSTs the decision from the client — a mutating GET would be
triggered by mail-scanner prefetches (same reasoning as `/claims/decide`).

## Emails (Czech only, like the claim emails)

- **"Sedí to?"** to every decision maker when an expense turns pending
  (never to the author). Editing an already pending expense sends nothing —
  the decide page always shows the current numbers, so a second mail is
  noise.
- **"Výdaj je potvrzený" / "Výdaj neprošel"** to the author on the verdict,
  with the reason if one was given.

Both go through `sendAppEmail`, so preview deployments never mail real
people. A lost email never loses the expense: it stays visible to the people
involved and in the admin panel.

## Editing a pending expense

Any edit by a non-admin re-derives the status. In particular, **editing an
expense with somebody else's payer puts it back in the queue** — an amount
that was already agreed to must not be silently rewritten. Switching the
payer back to yourself approves it immediately.

## UI

- **Composer**: a quiet "Zaplatil to někdo jiný?" link under the payer
  chips opens a select of the other participants. Choosing one shows an
  amber note saying exactly what will happen ("nikde se neukáže a do
  vyrovnání se nepočítá, dokud to nepotvrdí …"), repeated on the mobile
  summary step.
- **Expense card**: pending cards get a dashed grey frame and a "Čeká na
  potvrzení" badge; approvers get Potvrdit / Zamítnout (with an optional
  reason) inline. Rejected cards state the reason and that they count in no
  balance.
- **Admin panel**: `approvalStatus` is a normal sidebar field, so an admin
  can decide there too — the same afterChange hook emails the author.

## Analytics

`expense_created` gained `for_other: boolean`; `expense_approval_decided`
records `{ action, from: 'card' | 'email' }`. Nothing else changes.
