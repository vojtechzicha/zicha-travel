# Chata Expense Tracker - Development Notes

## Project Overview

A Payload CMS-based expense tracking system for managing group trips and shared expenses. Allows participants to track expenses, prepayments, and automatically calculate who owes what.

## Architecture

### Collections

1. **Chatas** (`src/collections/Chatas.ts`)
   - Main entity representing a trip/event
   - Contains banking info, trip details, accommodation info
   - Has an `afterRead` hook that calculates expense statistics
   - References: Participants (banker, bedroom occupants), Users (assignedUsers)

2. **Participants** (`src/collections/Participants.ts`)
   - People involved in a trip
   - Belongs to a specific Chata
   - Contains banking information for settlements

3. **Expenses** (`src/collections/Expenses.ts`)
   - Individual expenses paid by participants
   - Supports equal split (ALL) or weighted split
   - References: Chata, Participant (payer), Participants (weights)

4. **Prepayments** (`src/collections/Prepayments.ts`)
   - Money transfers between participants and banker
   - Types: advance, supplement, refund, distribution
   - References: Chata, Participant (from)

5. **Users** (`src/collections/Users.ts`)
   - Admin users who can manage the system
   - Role-based access control

### Utilities

**calculateStats** (`src/utils/calculateStats.ts`)
- Core expense calculation logic
- Calculates per-participant balances
- Determines debtors and creditors
- Handles both equal and weighted expense splits
- `costBreakdown` includes `title`, `cost`, and `weight` for each expense

**PersonView** (`src/app/(frontend)/components/PersonView.tsx`)
- Main participant detail/finance view component
- Layout matches the original `split-expanses/src/App.js` PersonView
- Summary box with colored background (blue=banker, green=settled/positive, red=negative)
- Includes: prepayment rows, expandable fair share breakdown, result section, history section

### Settlement Threshold

**IMPORTANT**: The system uses a **1 Kč threshold** for determining debtor/creditor/settled status. This is intentional to avoid showing small rounding differences to users.

- **Debtor**: `balance < -1` (owes more than 1 Kč)
- **Creditor**: `balance > 1` (owed more than 1 Kč)
- **Settled**: `Math.abs(balance) <= 1` (within 1 Kč of zero)

This threshold must be consistent across:
- Backend: `src/utils/calculateStats.ts` (debtors/creditors filtering)
- Frontend: `src/app/(frontend)/components/SettlementActions.tsx` (isDebtor/isCreditor/isSettled)
- Frontend: `src/app/(frontend)/components/PersonView.tsx` (isSettled, summaryBgClass logic)

Do NOT change this threshold to smaller values like 0.01 - the 1 Kč threshold is intentional.

## Important Implementation Details

### AfterRead Hook Issue (FIXED)

**Problem**: The Chatas collection has an `afterRead` hook that calculates statistics. This hook was causing the admin panel to hang when clicking on the Chatas collection list.

**Root Cause**:
1. The hook runs on EVERY document in list views, causing expensive operations for each row
2. Using `depth: 1` in queries created circular dependencies: `chata` → `expense` → `participant` → `chata` → infinite loop

**Solution** (`src/collections/Chatas/hooks/afterRead.ts`):
1. Added check for `context?.triggerAfterRead === false` to skip on list views
2. Changed all Payload queries to `depth: 0` to prevent circular relationship population
3. Implemented manual name mapping using a `participantMap` for efficient lookups
4. Eliminated the need for separate banker participant fetch

### Access Control

- **Public read access**: All collections have public read for API consumption
- **Write access**:
  - Admins have full access
  - Regular users can only manage Chatas they're assigned to
  - Per-chata permissions via `assignedUsers` array

### Relationship Filtering

Collections use `filterOptions` to limit relationship dropdowns:
- Participants filtered by Chata
- Expenses show only participants from the same Chata
- Bedroom occupants filtered by Chata

## Database

Using SQLite with `@payloadcms/db-sqlite` adapter.

## Development Commands

```bash
pnpm dev          # Start development server (localhost:3000/admin)
pnpm build        # Build for production
pnpm generate:types  # Generate TypeScript types from collections
```

## Known Considerations

1. **Performance**: The afterRead hook fetches all participants, expenses, and prepayments. For very large trips (>1000 items), consider pagination or caching.

2. **Unique Constraints**: Payload 3.x doesn't support compound unique indexes in config. The unique constraint on `chata+participant name` is documented but not enforced at the database level.

3. **Banker Field**: Currently the banker is a relationship to Participants. This creates a chicken-and-egg problem when creating a new Chata (no participants exist yet). Consider making it optional or handling differently.

## Future Enhancements

- Add API endpoints for external consumption (`src/app/(payload)/api/`)
- Implement domain-based auto-selection
- Add expense splitting script (`split-expanses/`)
- QR code generation for payment requests
- Email notifications for payment reminders

## Migration Notes

See `MIGRATION.md` for details on migrating from the previous PoC implementation.
