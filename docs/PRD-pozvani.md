# PRD: Pozvání (Invitations) — paying someone else's share of an expense

## Motivation

Sometimes one participant wants to treat another: "come to dinner, it's on
me." The invited person should not owe anything for that expense, and the
inviter should carry their share instead — without touching who actually
paid the bill or how the expense is split.

## Data model

`Expenses.invitations` — an array field on each expense:

| field   | type                          | meaning                          |
| ------- | ----------------------------- | -------------------------------- |
| `host`  | relationship → `participants` | who covers the share (inviter)   |
| `guest` | relationship → `participants` | whose share is covered (invited) |

- A **host can appear in any number of rows** — one participant can cover
  the shares of several guests on the same expense.
- A **guest can appear at most once** per expense (being covered twice is
  ambiguous) — validated server-side.
- `host ≠ guest` — validated server-side.
- Both dropdowns are filtered to the expense's chata (`filterOptions`),
  same as expense weights.
- Hosts and guests are **participants only** (no joint accounts): an
  invitation is a personal gesture, mirroring the design decision that
  expense weights stay participants-only.

## Math (in `calculateStats`)

The transfer runs on the **cost side only**, after the normal split:

1. Compute every participant's share exactly as before (equal split over
   all participants, or weighted split).
2. For each invitation, move the guest's **original** share to the host:
   the guest's cost for this expense becomes 0, the host's cost grows by
   that share. Multiple guests simply sum onto their host.

The expense `amount`, the payment credit (`paidExternal` /
`plannedPaidExternal`), and prepayments are untouched, so the zero-sum
invariant (all balances sum to 0) is preserved — asserted by every test
fixture.

### Decided edge cases

- **Chains are single-hop.** A invites B, B invites C ⇒ A pays B's share,
  B pays C's share. Inviting someone is your own generosity; it does not
  roll up the chain. This also makes cycles (A ⇄ B) harmless and
  deterministic, because transfers are based on pre-transfer shares.
- **Guest without a weight** in a weighted split has no share ⇒ the
  invitation is a no-op (no breakdown entries either).
- **Guest is the payer** ⇒ only their cost moves; their payment credit
  stays theirs (they end up strongly positive — correct: they fronted the
  money and owe nothing).
- **Joint-account payer** composes cleanly: the payment is still credited
  equally to the JA members; invitations only reroute cost shares.
- **Planned expenses**: the share moves within `plannedCost`.
- **Negative (refund) expenses**: the guest's negative share moves to the
  host — whoever carries the cost also receives the credit when part of it
  comes back.
- **Unknown host** (e.g. deleted participant) cannot absorb the share, so
  it stays with the guest instead of vanishing — balances keep summing to
  zero. Unknown guests are ignored for the same reason.
- **Duplicate guest rows** (blocked by validation, guarded in the math):
  the first row wins.

### costBreakdown annotations

Each affected entry carries a marker so the UI can explain the numbers:

- Guest side: `{ cost: 0, invitedBy: '<host name>' }` — the item shows at
  0 Kč with "pozval/a tě X".
- Host side: an extra entry per guest
  `{ cost: <guest share>, invitedGuest: '<guest name>' }` — shown as
  "pozvání pro Y".

## Standing invitations — "Platí za něj/ni" (paid by)

Some participants (typically kids) take a share of expenses but never pay
themselves. `Participants.paidBy` (relationship to another participant of
the same chata, self-reference rejected) marks this standing arrangement,
and it reuses invitations as the underlying mechanism:

- **New expenses**: a `beforeChange` hook (create only) appends
  `{ host: paidBy, guest: participant, auto: true }` for every covered
  participant who takes a share (equal split → everyone; weighted → only
  with weight > 0). Rows are materialized, not implicit, so any single
  expense can opt out by deleting/editing its row in admin.
- **`auto` flag on invitation rows** carries two meanings:
  - *provenance* — auto rows are managed by the sync code
    (`src/utils/paidByInvitations.ts`); manual one-off rows are never
    touched by it;
  - *display* — the expense card badge is shown only for manual rows (a
    date-dinner invite is nice to show; a standing kid arrangement on
    every card is noise). The checkbox can be toggled by hand to override
    visibility either way. Breakdown wording also adapts:
    "platí za tebe X" / "platíš za Y" instead of "pozval/a tě X" /
    "pozvání pro Y".
- **Retroactive apply**: a button on the participant edit form
  ("Apply retroactively to existing expenses") calls
  `POST /api/participants/:id/apply-paid-by` (auth: admin or user assigned
  to the chata), which reconciles that participant's auto rows across all
  expenses of the chata against the SAVED `paidBy`:
  - removes stale auto rows (paidBy cleared, or host changed — the row is
    then re-added with the new host),
  - adds missing rows where the participant takes a share and has no
    invitation row yet (a manual row always wins),
  - idempotent; never modifies manual rows.
  Setting, changing, and clearing `paidBy` are all handled by the same
  reconcile. The button is enabled only when there is something to do:
  a saved `paidBy` with no pending form edit — or, after clearing it,
  stale auto rows still present on existing expenses (removal mode; the
  component probes `/api/expenses?where[invitations.guest]...&[invitations.auto]=true`).
  Admin UI text is English, frontend text is Czech (project convention).
- A guest can still have only one invitation row per expense; the math in
  `calculateStats` is exactly the manual-invitation math (the `auto` flag
  only flows through to `costBreakdown` for display).

## UI

- **Admin**: `invitations` array on the expense form, dropdowns filtered
  by chata, with validation messages for self-invites and duplicate
  guests.
- **ExpenseCard**: a pink badge per invitation — "🤝 {host} zve {guest}".
- **PersonView** fair-share breakdown: guests see the expense at 0 Kč with
  "· pozval/a tě X" (green); hosts see an extra line "· pozvání pro Y"
  (pink), in both the actual and planned sections.

## Database

New table `expenses_invitations` (standard Payload array-field shape:
`_order`, `_parent_id` → `expenses` ON DELETE CASCADE, varchar `id` PK,
`host_id`/`guest_id` → `participants` ON DELETE SET NULL). Purely
additive — no data migration needed. The exact DDL (captured verbatim from
Payload's dev schema push, PostgreSQL 16) is appended to
`scripts/migrate-payer-polymorphic.mjs`, which both production platforms
already run idempotently on every deploy.
