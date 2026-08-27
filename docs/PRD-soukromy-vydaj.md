# PRD: Soukromý výdaj (Private expense) — a gift the rest of the trip never sees

## Motivation

Somebody buys a birthday present for Katka during the trip and splits it with
two others. The expense is real and needs settling, but the one person it must
never reach is Katka — and on this site every expense, balance and journal row
is deliberately public. A private expense is that present: visible only to its
payer and the people in its split (plus superadmins), absent from the journal,
the stats, the Přehled matrix and the homepage for everyone else — no gap, no
lock icon, no trace. It never enters the common pot; its members pay the payer
directly and mark the payment by hand.

## Data model (Expenses)

| Field | Type | Meaning |
| --- | --- | --- |
| `isPrivate` | checkbox, default false, indexed | the flag; NULL (legacy) = public |
| `privateSettlements` | array `{ participant, settledAt }` | sparse direct-payment marks: a row = that member paid the payer |

- **The circle** = the payer participant + every `weights[].participant`.
  There is no denormalized "visibleTo" column: REST serves private rows only
  to superadmins, `authoredBy` and `payerAccount`; the other members read
  through the slug API, which has the full context a `Where` clause lacks.
- **`privateSettlements` is server-owned everywhere.** Only the
  `/api/expenses/private-settle` endpoint writes it (context flag
  `expensePrivateSettle`); the admin field is read-only and any submitted rows
  are replaced by the stored ones. Note the Payload quirk that forced this
  shape: on update, hook `data` arrives merged with the stored document, so
  the guard must restore the stored rows rather than delete the key — an
  absent array would wipe them.
- Structural invariants, enforced in a beforeChange hook that runs for EVERY
  writer (admin panel included) on the EFFECTIVE document
  (`data.x !== undefined ? data.x : originalDoc.x`): participant payer,
  positive amount, weighted split with unique participants and a positive
  total, no invitations, no attachments, `approvalStatus` forced `approved`.
  Pure rules live in `src/lib/privateExpenses.ts` (`privateExpenseProblem`).

## Math

The pot ignores private expenses completely: `calculateStats` drops them in
the same filter that drops unconfirmed ones, so the chata hook, the homepage
batch, the slug API stats, the Přehled Σ-kontrola and the recap all stay
exactly what they would be without the expense — the zero-sum invariant never
learns it exists.

The private layer is computed separately in `src/lib/privateExpenses.ts`:

1. A member's debt is always the normalized proportional share,
   `amount × weight / totalWeight`. The ±1 Kč "weights are amounts" rule only
   labels the display; it never becomes the debt directly.
2. `buildPrivateLayer` gives one participant their debts (share, payer,
   settled flag) and their fronted expenses (total, own share, per-member
   marks). Zero-weight members are in the circle but owe nothing.
3. `nettingHints` aggregates mutual UNSETTLED, non-planned debts per unordered
   pair of people and proposes one transfer of the difference; the hint lists
   every constituent row and acting on it marks them all, atomically.
4. `bankerCombineHints` is a sentence, not a transaction: when the private
   pair coincides with a pot transfer pair (the banker owes a member the pot
   refund, or the member owes the pot a top-up), it suggests one combined
   bank payment. The pot amounts are never touched.

## Visibility enforcement

Four layers, because the read API is public by design:

1. `Expenses.access.read` AND `access.write`: the approved-or-legacy branch
   and the chata-admin branch both carry `isPrivate: { not_equals: true }`
   (verified: the drizzle adapter compiles it to `IS NULL OR <> true`, so
   legacy rows stay public). A blind PATCH/DELETE would return the document,
   which is why the write access needs the guard too.
2. The slug API filters `visibleExpenses` per viewer, private branch first
   (an approved private row would pass the `isCountedExpense` shortcut):
   superadmin, the payer's account, or a linked member — never `canManageChata`
   and never the banker. Pure predicate: `canViewPrivateExpense`.
3. `calculateStats` excludes them, which covers every stats consumer at once.
4. The anonymous `/api/chatas/:id/full` export excludes them in its query;
   `buildExpenseRows` (Přehled) drops them even for members — the overview is
   the shared dispute table and must show one picture to everybody.

Bank-field widening: being in a private split means paying that payer
directly, so the slug API adds the payer's participant id to the viewer's
bank-field visibility set (`visiblePrivatePayerIds`). Creating the private
expense is the payer's consent to that. This is the one privacy-policy-visible
change and is recorded in §6 of the policy.

## Settling

`POST /api/expenses/private-settle` `{ items: [{ expenseId, participantId }],
settled }` — batch (≤ 20, deduplicated) so a netting hint marks all its rows
in one transaction. Per row: superadmin, the payer's account
(`Expense.payerAccount`) or the member's own account may mark
(`canSettlePrivateRow`); the participant must be a current non-payer member.
Concurrency: one transaction, parent rows locked with `SELECT … FOR UPDATE`
in id order, every read/write on the shared `transactionID`, rollback on any
failure, plus a unique index on `(_parent_id, participant_id)` as
belt-and-braces. **Anti-enumeration**: nonexistent, public and
unauthorized-private expenses all answer the same generic not-found, so ids
cannot be probed.

## Decided edge cases

1. **Legacy rows** (`is_private` NULL) are public everywhere.
2. **Private + "za jiného plátce" is impossible.** Every private expense is
   forced `approved`; the decide endpoint AND the decide page answer uniform
   not-found for a private id, so a stale approval token can neither confirm
   nor leak one.
3. **Joint-account payer forbidden** — a shared wallet has no single
   confidant, and the settlement QR needs one person's account.
4. **Equal split forbidden** (it means "everyone", the opposite of a secret);
   weights must name unique participants with a positive total.
5. **The payer need not be in the weights** (typical gift: the others owe the
   full amount). Their own share, when present, is self-settled and never
   listed as a row.
6. **Refunds (negative amounts) are forbidden in v1** — the reversed flow
   would need the members' bank details, which the privacy scrub refuses to
   serve to the payer.
7. **Planned + private is allowed**: informational in the private card, no
   QR, no marks and no netting until it is paid; the `markPaid` flow is
   unchanged and the composer always sends `isPrivate` explicitly.
8. **One-way door**: an expense is created private or stays public forever.
   Declassifying (private → public) is allowed and wipes the settlement
   marks; public → private is rejected server-side — feeds, exports, emails
   and screenshots may already have shown it, and that history cannot be
   recalled. The composer mirrors this: the switch renders only while
   creating or while the expense is still private.
9. **Chata admins and a non-member banker see nothing** — list, by-id, blind
   writes, admin panel included. The surprise target could be either of them.
   Superadmins see everything (the user's recorded decision); in the admin
   panel a private expense is therefore editable only by a superadmin.
10. **The creator must be the payer.** Every non-superadmin creator — chata
    admins included — must own the payer participant, so the author is always
    inside the circle and "author visibility" is never an extra class.
11. **Debt signature**: editing the amount, payer, weights, split type or
    planned state clears ALL settlement marks — they settled a different
    debt. A title or date edit keeps them. The composer warns about this.
12. **Netting** is informational and per unordered pair; the viewer always
    holds authority over every constituent row (own account on one side,
    `payerAccount` on the other). Marking is one transaction; undo is
    per-row — no netting-group id is stored, and the UI promises no more.
13. **Banker-combine hint** never mutates prepayments or the pot.
14. **A deleted member participant**: helpers skip null refs; the DB blocks
    deleting a participant who still has settlement rows (same as invitation
    rows) — anonymize instead, which keeps the arithmetic.
15. **Deleted/anonymized accounts**: `userCleanup` nulls
    `authoredBy`/`payerAccount`; visibility narrows to superadmins and the
    remaining linked members.
16. **Retention**: 12 months after `settledAt`, bank fields are cleared, so
    private QR codes stop working; the settlement flags remain as the record.
17. **Rights export**: a private expense appears only in its members' and
    payer's bundles (guaranteed by the weighted-only rule), flagged
    `isPrivate` with the person's own `privateSettledAt`.
18. **Receipts are forbidden on private expenses in v1**: attachment
    documents are readable by any signed-in account and the files are public
    by URL, which would break the promise. Follow-up option if ever needed:
    an expense back-reference on `expense-attachments` plus proxied/signed
    file reads enforcing the same circle.
19. **An anonymous visitor selecting a member participant** sees no trace:
    the filter runs server-side before any scrub or response.

## UI

- **Composer** (`ExpenseComposer.tsx`): a purple "Soukromý výdaj
  (překvapení)" switch next to the refund/planned ones (create-only, see
  edge case 8; needs an own linked participant). Switching it on resets the
  payer to an own participant and hides the "Zaplatil to někdo jiný?" path,
  joint-account payer chips, the equal-split mode, invitations, refunds and
  the receipt step. A purple note names the circle once the split is picked
  ("Uvidí ho jen ty, Tereza a Ondra…", generic wording before that), a lock
  line under the split says who will not see it, and editing shows the
  marks-reset warning.
- **Expense card** (`ExpenseCard.tsx`): purple border, lock "Soukromý"
  badge, and a footer naming the circle. Non-members never receive the row,
  so the journal shows no gap.
- **Person view** (`PrivateExpensesCard.tsx`): a purple "Soukromé výdaje ·
  mimo pokladnu" card between the pot summary and the settlement card.
  Debts: share, payer, "Pošli 800 Kč pro Martina" with a QR straight to the
  payer's own account (accusative name via `czechNames`), and the manual
  paid mark. Fronted expenses: total, own share, per-member rows with
  čeká/vyrovnáno badges and marks. Netting hints and the banker combine tip
  sit between them. Buttons render only where `canSettlePrivateRow` will
  pass; everyone else sees read-only state.
- **Přehled** and the payment history exclude private expenses; the pot
  numbers they reconcile against never contained them.
- **Admin panel**: sidebar checkbox with the create-only note; the
  settlements array is read-only and shown only on private expenses.

## Analytics

`expense_created` gains `private: boolean`; new `private_settlement_marked`
`{ role: payer | member | admin, netted, settled }` — no ids, no amounts, no
titles. `save_failed` fires with `operation: 'private_settle'`.

## Database

`expenses.is_private boolean DEFAULT false` + btree index, and the
`expenses_private_settlements` array table (participant FK SET NULL, parent
FK CASCADE, the standard order/parent/participant indexes and the unique
`(_parent_id, participant_id)` index). DDL appended to `NEW_SCHEMA_DDL` in
`scripts/migrate-payer-polymorphic.mjs`, additive only; RLS is covered by the
existing pass.
