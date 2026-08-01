# PRD: Společný účet (Joint Account) Support

**Status:** Draft — awaiting approval
**Author:** Claude (requested by Vojtěch Zicha)
**Date:** 2026-08-01

## 1. Problem

Some participants (typically couples) pay from a single shared bank account
("společný účet"). Today the system forces every expense and every settlement
onto exactly one participant, which produces nonsensical money flows for such
pairs:

- If Alice always records joint-account payments under her own name, Alice ends
  up a creditor and Bob a debtor. The app then tells Bob to send money to the
  banker and tells the banker to send money to Alice — **two opposite bank
  transfers against the same physical account**.
- There is no way to say "this expense was paid by the couple", so someone must
  arbitrarily pick a payer, corrupting per-person histories.

## 2. Goals

1. An expense's **payer** can be a joint account of 2+ participants, defined
   per chata.
2. **Cost shares (weights) stay strictly per person.** Equal split ("ALL")
   continues to count every participant as one head, including joint-account
   members. Weights never reference a joint account.
3. **Fair-share math stays per person** — each member still sees their own
   consumption breakdown.
4. **Settlement ("pay to whom / who pays") operates on the joint account as one
   unit** — one debt or one claim per joint account, one QR code, one transfer.
5. The **banker may be a member of a joint account** and everything stays
   correct.
6. **The math must remain exactly correct** — zero-sum invariant holds, and with
   zero joint accounts defined the results are byte-identical to today.

## 3. Non-goals

- Splitting a joint account's internal balance between its members (money in a
  shared account is fungible; who "really" paid within the couple is out of
  scope).
- Joint accounts spanning multiple chatas (they are defined per chata, like
  participants).
- Changing the 1 Kč settlement threshold (it now applies at unit level).

## 4. Core model: settlement units

Introduce the concept of a **settlement unit**:

- Every joint account is one unit (its members belong to it).
- Every participant not in any joint account is a solo unit.
- `unitOf(p)` = the joint account containing `p`, otherwise `p` itself.
- A participant may belong to **at most one** joint account per chata
  (validated).

### 4.1 Per-person stats (unchanged semantics)

For every participant, exactly as today:

- `cost` / `plannedCost` / `costBreakdown` — from equal split or per-person
  weights. **No change**: weights only ever reference individual participants.
- `paidExternal` — expenses where the payer is that person individually.
- `prepaidInternal` — prepayments sent by that person individually.

### 4.2 Joint-account stats (new)

For every joint account `J`:

- `paidExternal(J)` — expenses where `payer = J`.
- `prepaidInternal(J)` — prepayments where `from = J`.

### 4.3 Unit balance

```
balance(solo p) = paid(p) + prepaid(p) − cost(p)            // as today
balance(J)      = paid(J) + prepaid(J)
                + Σ over members m of [ paid(m) + prepaid(m) − cost(m) ]
```

A member's individual payments and prepayments **roll up** into the unit —
money is fungible inside the couple, so the unit is the only level at which a
transfer to/from the banker makes sense.

### 4.4 Debtors / creditors

Computed over **units**, not persons:

- Debtor: `balance(unit) < −1` Kč; Creditor: `balance(unit) > 1` Kč (existing
  1 Kč threshold, applied at unit level).
- A joint account appears as one entry under its display name (e.g.
  "Alice + Bob"); its members never appear individually.
- The banker's unit is excluded, as the banker is today.

### 4.5 Banker inside a joint account

- `bankerUnit = unitOf(banker)`. The pot is the banker unit's account.
- Today's rule "skip prepayments sent by the banker" generalizes to: **skip
  prepayments whose sender resolves to the banker's unit** (banker personally,
  the banker's joint account, or a co-member of the banker's joint account).
  Such transfers move money within the pot-holding household and would
  otherwise show confusing collected/returned figures (they always net to zero
  at unit level, so correctness is unaffected either way — this is a display
  decision).
- Prepayments from other units credit the sender (as today) and debit the
  banker's personal stats (as today); the banker-unit rollup picks this up.
- The banker view ("Chybí vybrat" / "Přebytek k rozdělení") shows the **banker
  unit's** balance.

### 4.6 Zero-sum invariant (why the math stays correct)

Sum over all units of `balance(unit)` =
Σ all external payments (persons + joint accounts) − Σ all costs
+ Σ prepayment transfers (each counted symmetrically: +sender, −banker).

Prepayments cancel pairwise; if every expense is fully split, total payments =
total costs, so the sum is **0**, exactly as today. Attributing a joint
payment to the unit (rather than arbitrarily to a member) never creates or
destroys money.

### 4.7 Worked example

Chata: Alice + Bob (joint account "AB"), Cyril (banker, solo), Dana (solo).

| Event | Detail |
|---|---|
| Groceries 1 200 Kč | payer **AB**, equal split → 300 Kč/head |
| Fuel 400 Kč | payer Cyril, weighted Alice 1 / Bob 1 → 200 Kč each |
| Advance 500 Kč | from Dana to banker |

Per person: Alice cost 500, Bob cost 500, Cyril cost 300, Dana cost 300.

Unit balances:

- **AB**: 1 200 (paid) − 500 − 500 (members' costs) = **+200** → creditor,
  one entry "Alice + Bob 200 Kč", one refund transfer to the joint account.
- **Dana**: 500 − 300 = **+200** → creditor.
- **Cyril (banker)**: 400 − 300 − 500 (collected) = **−400** → "Přebytek
  k rozdělení 400 Kč". Pot holds 500; pays out 200 + 200, keeps 100 covering
  his own net claim (paid 400, consumed 300). ✓ Sum = 200 + 200 − 400 = 0. ✓

## 5. Data model

### 5.1 New collection: `joint-accounts`

Follows the existing per-chata pattern (like Participants):

| Field | Type | Notes |
|---|---|---|
| `name` | text, required | Display name, e.g. "Zichovi" or "Alice + Bob" |
| `chata` | relationship → chatas, required | Defined per chata |
| `members` | relationship → participants, hasMany, required | Min 2; `filterOptions` by chata (same pattern as expense weights); validation: each participant in ≤ 1 joint account per chata |
| `accountNumber` / `iban` | text, optional | Same `CzechBankAccountField` collapsible as Participants; used for QR/refunds when the unit is a creditor; fallback = "zaplatit hotově" warning as today |

Access control mirrors Participants (public read, per-chata write).

### 5.2 Payer / sender become polymorphic

- `Expenses.payer`: `relationTo: ['participants', 'joint-accounts']`
- `Prepayments.from`: `relationTo: ['participants', 'joint-accounts']`

One dropdown in the admin, filtered by chata for both collections. Weights
(`Expenses.weights[].participant`) **stay participants-only** by design.

**Migration cost (flagged):** in Payload's Postgres adapter, converting a
single-collection relationship to polymorphic moves storage from the
`payer_id` column into the `_rels` table. A one-time data migration script is
required for existing expenses/prepayments (local verification via
`pnpm migrate-from-prod` before touching production). The alternative — keep
`payer` and add a parallel optional `payerJointAccount` field with
exactly-one-of validation — avoids the migration but permanently complicates
every consumer and the admin UX. **Recommendation: polymorphic + migration.**

### 5.3 Calculation layer

- `calculateStats()` gains a `jointAccounts` input
  (`{ id, name, memberIds, memberNames }[]`) and returns, in addition to
  today's shape:
  - `units`: per-unit aggregates (type `person | jointAccount`, id, name,
    members, paid, prepaid, cost, balance),
  - `debtors` / `creditors` entries extended with
    `{ type, id, members? }` so the frontend stops matching by display name.
- Both call sites (`Chatas/hooks/afterRead.ts` and
  `api/chatas/slug/[slug]/route.ts`) pass joint accounts through; the
  name-mapping step resolves polymorphic payer refs against a participant map
  *and* a joint-account map.
- **Backward compatibility guarantee:** with zero joint accounts the output is
  identical to today (unit = person, same debtors/creditors, same balances).

## 6. UI changes

### 6.1 PersonView (member of a joint account)

- Personal sections unchanged: fair-share breakdown, personal payments,
  personal prepayments — the per-person math the user explicitly wants kept.
- New summary rows: "Zaplaceno ze společného účtu" (unit's `paidExternal`) and
  the co-members' relevant figures, so the displayed arithmetic visibly adds up
  to the shown result.
- The **result block and settlement actions show the unit balance**, labeled
  with the joint account (e.g. "Za společný účet Alice + Bob"): one
  "Doplácíš/Dostaneš zpět" figure, one QR code to/from the banker. Both
  members see the same result. `isSettled` uses the unit balance.
- History: expenses paid by the joint account appear in each member's history
  as "Platba (společný účet)".

### 6.2 Banker view / FinanceView

- Debtor and creditor lists show units; joint accounts render their display
  name and use the joint account's banking info for QR payments.
- If the banker is in a joint account, the crown/Pokladník badge stays on the
  banker person; the "Chybí vybrat / Přebytek" figure is the unit's.

### 6.3 Admin

- New "Joint Accounts" collection in the nav, filtered dropdowns as described.
- Payer dropdown in Expenses/Prepayments lists participants and joint accounts
  of the selected chata.

## 7. Edge cases & validations

| Case | Behavior |
|---|---|
| Zero joint accounts | Identical output to today (tested) |
| Participant in 2 joint accounts | Validation error on save |
| Joint account with < 2 members | Validation error |
| Member from a different chata | Prevented by `filterOptions` + validate |
| JA member also pays individually | Allowed; rolls up into unit balance |
| Prepayment from banker's co-member / banker's JA | Skipped (see 4.5) |
| Deleting a participant who is a JA member | Blocked while referenced (same integrity posture as payer references) |
| Deleting a JA referenced by expenses | Blocked; user must reassign payers first |
| Equal split | Unchanged — every participant is one head |
| Weights referencing a JA | Impossible by schema (participants-only) |

## 8. Testing

- **Unit tests (vitest, `tests/int`) for `calculateStats`** — the core
  deliverable for "math must remain correct":
  - regression: existing fixtures with no joint accounts → identical output,
  - worked example from §4.7,
  - banker inside a JA (incl. prepayments from co-member skipped),
  - zero-sum property checked in every fixture,
  - planned expenses paid by a JA,
  - negative (refund) expense paid by a JA.
- Migration script dry-run assertion: every expense/prepayment keeps its payer.

## 9. Rollout

1. Schema + collection + types (`pnpm generate:types`).
2. Data migration for polymorphic payer/from (verified locally against a prod
   copy via `pnpm migrate-from-prod`).
3. Calculation layer + unit tests.
4. Admin/frontend UI.
5. Deploy to Fly.io; define joint accounts for the affected chatas.

## 10. Open questions (need your answer before implementation)

1. **Settlement granularity — confirm the unit model.** "All the math is per
   specific person but takes account of the combined user" is implemented as:
   per-person fair share, **unit-level settlement** (one transfer per joint
   account). The alternative — splitting a JA payment between members (50/50 or
   by share) and keeping fully individual settlement — was rejected because it
   recreates the two-transfers-against-one-account absurdity. Confirm?
2. **Polymorphic payer vs. parallel field** (§5.2). Recommendation:
   polymorphic + one-time migration.
3. **Prepayments from a joint account** — included (a couple sends one advance
   from the shared account). Cheap to support since `from` becomes polymorphic
   anyway. Confirm, or should prepayments stay person-only?
4. **JA banking info on the joint account itself** (with cash fallback), vs.
   reusing one member's account. Recommendation: own optional fields.
