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
| frontend user             | a joint account they are not in    | pending: **any member with an account** or the banker/admins confirm |
| anyone                    | somebody from another chata        | refused (400) — the payer must belong to this chata |

A **joint account is a shared wallet, not a person**, so it has no single
voice: every member with an account may vouch for what it paid
(`payerAccountIds`), and the notification email goes to all of them. What it
does not get is an owner — correcting or deleting such an expense stays with
the author and the admins, while a member who disagrees rejects it.

**Who can actually confirm** is never assumed. `Chata.banker` is optional and
a banker need not have an account, so the composer asks before it promises:
with a banker account the note says "pokladník", without one it says "správce
chaty", which is the one confirmer that always exists. The same holds for the
payer side, which is why the note names the payer only when
`payerAccountIds` is non-empty.

Being the **author** carries no say of its own: the approval email skips
them, and an unrelated author cannot confirm their claim. An admin author
skips the queue entirely (first row above). A banker author still goes
through it, but may confirm their own entry with one tap on the card — the
verdict is recorded (`approvalDecidedBy`), so it stays an explicit,
attributable step rather than silent trust.

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
backfills it. It stays **null for a joint-account payer** — a shared wallet
has no owner to hand those rights to, and a stamp copied from its members
would go stale on every membership change. Members are resolved live
instead, by `payerAccountIds` (pure, from participants + joint accounts),
which is what the decide endpoint, the decide page, the emails and the slug
API all use.

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
   them: chata admins, the author, the accounts speaking for the payer
   (`payerAccountIds`, so every member of a paying joint account) and the
   banker's account. For everybody else they are not in the payload at all.
3. **Payload REST read access** — anonymous and unrelated accounts get a
   `Where` that hides anything not approved. It is stricter than the slug
   API on purpose: a `Where` cannot resolve joint-account membership or the
   chata's banker, so it grants only admins, the author and `payerAccount`.
   Everything the frontend needs comes from the slug API and the decide
   endpoint (which overrides access), so nobody loses a button to it. The
   `/api/chatas/:id/full` export (anonymous) filters in its query.

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

- **Composer**: a quiet "Zaplatil to někdo jiný?" link under the payer chips
  reveals a second chip row, "Někdo jiný", holding the rest of the chata —
  people and joint accounts alike, in the same chip language as the row
  above rather than a native select, which would be the odd control out in
  this form and reads as a platform widget in dark mode. Picking one shows an
  amber note saying exactly what will happen and who can undo the wait
  ("dokud to nepotvrdí …"), repeated on the mobile summary step. Picking one
  of your own chips again is the way back.
- **Expense card**: pending cards get a dashed grey frame and a "Čeká na
  potvrzení" badge, and they ignore the "moje / vše" filter for the people
  who can act on them (otherwise the one card that needs attention is the
  one hiding behind a tab). Approvers get Potvrdit / Zamítnout (with an
  optional reason) inline. Rejected cards state the reason and that they
  count in no balance.
- **Admin panel**: `approvalStatus` is a normal sidebar field, so an admin
  can decide there too — the same afterChange hook emails the author.

## Analytics

`expense_created` gained `for_other: boolean`; `expense_approval_decided`
records `{ action, from: 'card' | 'email' }`. Nothing else changes.
