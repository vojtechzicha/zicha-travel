# PRD: Společný účet (Joint Account) Support

**Status:** Approved (v2 + decisions below)
**Author:** Claude (requested by Vojtěch Zicha)
**Date:** 2026-08-01

**Approved decisions:**

1. Attribution rule: **Option A — equal split of the payment among members**
   (§4.2); the same equal split applies to JA prepayments (§4.3).
2. Data model: **polymorphic payer + one-time migration** (§5.2).
3. Joint accounts carry **no banking fields** (§10.3 resolved: dropped).

> v2: reworked after clarification. Settlement stays **fully per person**
> (each member gets their own QR code / transfer; no payment is ever made to
> the joint account). A joint account is a **payer**, and its payments are
> attributed to its members. v1's "settle per unit" model is dropped.

## 1. Problem

Some participants (typically couples) sometimes pay from a shared bank account
("společný účet") in addition to their own personal accounts. Today every
expense must name exactly one participant as payer, so joint-account payments
are recorded under an arbitrary member, corrupting both members' balances and
the resulting settlement transfers.

## 2. Goals

1. An expense's **payer** may be a joint account of 2+ participants, defined
   per chata. Members keep paying from personal accounts too — for example
   with Alice, Bob (a couple with a joint account) and Cedric there are four
   possible payers: Alice, Bob, Alice+Bob, Cedric.
2. **Cost shares (weights) stay strictly per person** — weights never
   reference a joint account; equal split ("ALL") still counts every
   participant as one head.
3. **All balances and settlement stay per specific person.** A joint-account
   payment is attributed to its members (rule in §4.2), and from there the
   existing per-person math runs unchanged. With Alice+Bob+Cedric the end
   state is still up to three personal settlements; **no payment is ever
   made to the joint account**.
4. The **banker may be a member of a joint account** and everything stays
   correct.
5. **The math must remain exactly correct** — zero-sum invariant holds, and
   with zero joint accounts defined the results are identical to today.

## 3. Non-goals

- Settling the joint account as its own debtor/creditor (rejected: transfers
  happen against personal accounts).
- Tracking the couple's internal finances beyond the attribution rule.
- Joint accounts spanning multiple chatas.
- Changing the 1 Kč settlement threshold.

## 4. Core model: joint account as a decomposed payer

A joint account (JA) is a named group of 2+ participants of one chata. It can
appear as the **payer of an expense** or the **sender of a prepayment** —
nowhere else. Before balance calculation, every JA-paid amount is decomposed
into virtual personal payments by its members; everything downstream
(balances, debtors, creditors, banker logic, thresholds, QR codes) is the
existing per-person pipeline, untouched.

Correctness is structural: the decomposition always sums to the full amount,
so total external payments are unchanged and the zero-sum invariant
(Σ balances = Σ paid − Σ cost + symmetric prepayment transfers = 0) holds
exactly as today.

### 4.1 What stays exactly as today

- Per-person `cost`, `costBreakdown`, planned handling, equal/weighted splits.
- Debtors/creditors are individual participants, 1 Kč threshold.
- Banker rules, including "skip prepayments sent by the banker".
- All results when no joint account is defined (regression-tested).

### 4.2 Attribution rule for a JA-paid expense — **decided: equal split**

When JA `J` with members M pays expense `E` (amount `X`, per-person shares
`s_p` from E's split), how much of `X` counts as paid by each member?

**Decision: Option A (equal split of the payment) — approved 2026-08-01.**
Rationale: the joint account is jointly owned; predictable, applies uniformly
to prepayments, no degenerate cases. Options kept below for the record.

**Option C: own share first, remainder equally.**
Each member is credited their own fair share of E; the remainder
(`X − Σ_{m∈M} s_m`, i.e. the part covering non-members) is split equally
among members:

```
credit(m) = s_m + (X − Σ_{m'∈M} s_m') / |M|
```

- The common case — the couple pays for their own stuff from the joint
  account — leaves both members exactly settled for that expense, which is
  the literal reading of "the payment causes each to pay for their fair
  share".
- Total credited = X by construction (zero-sum safe), including negative
  (refund) expenses.
- A member with zero share still gets an equal cut of the remainder.

**Option A: split X equally among members** (`X / |M|` each), ignoring
shares. Simplest; treats the joint account as owned 50/50; but paying the
couple's *unequal* shares (e.g. weights 2:1) from the JA leaves the members
owing each other through the banker.

**Option B: split X proportionally to members' weights in E.** Degenerate
when all members have zero weight in E; inconsistent with prepayments (which
have no weights).

**Option D: fixed ownership ratio configured per JA** (e.g. 60/40), applied
to every payment and prepayment.

Worked comparison — dinner 900 Kč, weighted split Alice 2 / Bob 1 / Cedric 1
(shares 450/225/225), paid by JA Alice+Bob:

| Rule | Alice credited | Bob credited | Alice Δ | Bob Δ | Cedric Δ |
|---|---|---|---|---|---|
| C | 450 + 112.5 = 562.5 | 225 + 112.5 = 337.5 | +112.5 | +112.5 | −225 |
| **A (approved)** | 450 | 450 | 0 | +225 | −225 |
| B (proportional) | 600 | 300 | +150 | +75 | −225 |

All rules are globally correct (Cedric's debt is identical); they differ only
in how the couple's claim is split between Alice's and Bob's personal
settlements.

### 4.3 Prepayments from a joint account

Supported (confirmed). Prepayments have no weights, so a JA-sent prepayment
is split **equally among members**, then processed per person as today. Consequence of the existing
banker rule: if the banker is a JA member, the banker's part of a JA
prepayment is skipped (money already in the pot) and co-members' parts count
normally — which is exactly right.

### 4.4 Banker inside a joint account

No special handling needed. The banker's attributed part of a JA payment is
ordinary personal `paidExternal`; the existing banker logic does the rest.

### 4.5 Worked end-to-end example (approved equal-split rule)

Chata: Alice (banker) + Bob — couple with JA "AB"; Cedric solo.

| Event | Detail |
|---|---|
| Accommodation 3 000 | payer **JA AB**, equal split → 1 000/head. Attribution: 3 000 / 2 members → Alice credited 1 500, Bob 1 500 |
| Dinner 600 | payer Cedric, weighted 1/1/1 → 200 each |
| Advance 800 | from Cedric to banker |

Balances: Alice `1500 − 800 (collected) − 1200 = −500` → banker shows
"Přebytek k rozdělení 500". Bob `1500 − 1200 = +300` → creditor. Cedric
`600 + 800 − 1200 = +200` → creditor. Sum = 0 ✓. Pot holds 800: Alice sends
300 to **Bob's personal account** and 200 to Cedric, keeps 300 covering her
own net claim. ✓ No transfer touches the joint account.

## 5. Data model

### 5.1 New collection: `joint-accounts`

| Field | Type | Notes |
|---|---|---|
| `name` | text, required | Display name, e.g. "Alice + Bob" |
| `chata` | relationship → chatas, required | Defined per chata |
| `members` | relationship → participants, hasMany, required | Min 2; `filterOptions` by chata; validation: participant in ≤ 1 JA per chata |

Access control mirrors Participants (public read, per-chata write).
No banking fields: no payment is ever made *to* a joint account, so the
`accountNumber`/`iban` fields from PRD v1 are dropped (open question §10.3).

### 5.2 Payer / sender become polymorphic

- `Expenses.payer`: `relationTo: ['participants', 'joint-accounts']`
- `Prepayments.from`: `relationTo: ['participants', 'joint-accounts']`
- `Expenses.weights[].participant` **stays participants-only** by design.

One dropdown in the admin, filtered by chata.

**Migration cost (flagged):** Payload's Postgres adapter stores polymorphic
relationships in the `_rels` table instead of a `payer_id` column, so a
one-time data migration for existing expenses/prepayments is required
(verified locally against a prod copy via `pnpm migrate-from-prod` first).
Alternative: keep `payer` and add an optional parallel `payerJointAccount`
field with exactly-one-of validation — no migration, but two fields forever
in every consumer and clunkier admin UX. **Recommendation: polymorphic +
migration.** (Open question §10.2.)

### 5.3 Calculation layer

- `calculateStats()` gains a `jointAccounts` input
  (`{ id, name, memberNames }[]`). A pre-pass decomposes each JA-paid
  expense/prepayment into per-member contributions per §4.2/§4.3; the
  existing per-person pipeline then runs unchanged. `costBreakdown` is
  untouched; `ParticipantStats` gains nothing new except optionally a
  breakdown of `paidExternal` into personal vs via-JA (for display).
- Both call sites (`Chatas/hooks/afterRead.ts`,
  `api/chatas/slug/[slug]/route.ts`) fetch joint accounts and resolve
  polymorphic payer refs against participant *and* joint-account maps.
- Rounding: attribution uses exact arithmetic (no intermediate rounding);
  the existing 1 Kč display threshold absorbs sub-koruna residue.

## 6. UI changes

- **Admin:** new "Joint Accounts" collection; payer/from dropdowns list
  participants and joint accounts of the selected chata.
- **PersonView:** unchanged structure. "Zaplaceno za ostatní" includes the
  member's attributed part of JA payments; history lists JA-paid expenses
  for each member as e.g. "Platba (společný účet, tvá část X Kč)".
  Settlement actions, QR codes, thresholds: unchanged (per person).
- **Banker view / FinanceView:** unchanged — debtors/creditors are people.
  Incoming JA prepayments in the banker's history show the JA name with the
  per-member parts.

## 7. Edge cases & validations

| Case | Behavior |
|---|---|
| Zero joint accounts | Output identical to today (regression test) |
| Participant in 2 JAs of one chata | Validation error |
| JA with < 2 members | Validation error |
| Member from another chata | Prevented by `filterOptions` + validate |
| JA pays expense where members have zero/no weight | Irrelevant to the equal-split rule — the payment is always split amount / member count |
| Negative (refund) expense paid by JA | Attribution formula sign-flips consistently |
| Planned expense paid by JA | Attributed the same way into `plannedPaidExternal` |
| Prepayment from JA containing the banker | Banker's part skipped, co-members' parts counted (§4.3) |
| Deleting a participant who is a JA member | Blocked while referenced |
| Deleting a JA referenced by expenses/prepayments | Blocked; reassign payers first |

## 8. Testing

Unit tests (vitest, `tests/int`) for `calculateStats` — the core deliverable
for "the math must remain correct":

- regression: existing fixtures with no JAs → identical output,
- worked examples §4.2 and §4.5 (incl. banker-in-JA),
- zero-sum property asserted in every fixture,
- JA-paid planned and negative expenses,
- JA prepayment with and without the banker as member,
- migration dry-run assertion: every expense/prepayment keeps its payer.

## 9. Rollout

1. Schema + collection + `pnpm generate:types`.
2. Data migration for polymorphic payer/from — **automatic on deploy**: the
   Vercel build (`vercel-build` script in package.json) runs
   `node scripts/migrate-payer-polymorphic.mjs auto` before `next build`,
   against that deployment's own `DATABASE_URI` (production or preview DB).
   It migrates in one transaction (schema DDL identical to Payload's push,
   verified by drizzle diff), keeps a `_migration.payer_backup` safety copy,
   and no-ops on every subsequent deploy. Production was migrated on
   2026-08-01. For local dev, the manual `backup`/`restore` flow applies
   (see the script header).
3. Calculation layer + tests.
4. Admin + frontend UI.
5. Deploy (Vercel auto-deploys `main`; migration runs itself); define joint
   accounts for affected chatas.

## 10. Open questions — all resolved 2026-08-01

1. **Attribution rule (§4.2)** → Option A, equal split of the payment.
2. **Polymorphic payer vs. parallel field (§5.2)** → polymorphic + one-time
   migration.
3. **JA banking fields** → dropped (no payment is ever made to the joint
   account; can be added later if a use appears).
