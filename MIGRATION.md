# Split-Expanses to Payload CMS Migration

This document explains the migration from the JSON-based split-expanses PoC to a full Payload CMS backend.

## Overview

The split-expanses application has been converted from a static JSON-based system to a dynamic Payload CMS backend with the following capabilities:

- **Admin Panel**: Web-based UI for managing chatas, participants, expenses, and prepayments
- **API Endpoints**: RESTful and GraphQL APIs for data access
- **Automatic Calculations**: Backend calculates expense splits and balances
- **Access Control**: Per-chata permissions for multiple administrators
- **Domain Routing**: Support for domain-based and slug-based chata access

## Architecture

### Collections

#### 1. **Chatas** (`/api/chatas`)
The main collection representing trips/events.

**Key Fields:**
- `name`, `shortName`, `location` - Basic identification
- `slug` - URL-friendly identifier (auto-generated)
- `domains[]` - Array of domain names that map to this chata
- `banker` - Relationship to Participants
- `bankerAccountNumber`, `bankerIban` - Banking configuration
- `assignedUsers[]` - Users who can manage this chata
- `informationEnabled` - Toggle for trip information view
- Trip details, destination, transportation, bedrooms (when information enabled)

#### 2. **Participants** (`/api/participants`)
People involved in trips.

**Key Fields:**
- `name` - Participant's name
- `chata` - Relationship to Chatas
- `accountNumber`, `iban` - Banking info (for creditors)

#### 3. **Expenses** (`/api/expenses`)
Expense records with weighted or equal splits.

**Key Fields:**
- `chata` - Relationship to Chatas
- `title` - Description
- `amount` - Total amount (negative for refunds)
- `payer` - Relationship to Participants
- `splitType` - "equal" or "weighted"
- `weights[]` - Array of {participant, weight} (when weighted)

#### 4. **Prepayments** (`/api/prepayments`)
Advance payments and settlements.

**Key Fields:**
- `chata` - Relationship to Chatas
- `from` - Relationship to Participants
- `amount` - Amount (positive = to banker, negative = refund)
- `note` - Description
- `type` - "advance", "supplement", "refund", or "distribution"

#### 5. **Users** (`/api/users`)
Admin users with authentication.

**Key Fields:**
- `email` - Login email
- `role` - "admin" or "user"
- `assignedChatas[]` - Chatas this user can manage (non-admins only)

## API Endpoints

### Standard Payload Endpoints

All collections are accessible via standard Payload REST and GraphQL APIs:

```
GET    /api/chatas                - List all chatas
GET    /api/chatas/:id            - Get single chata (includes _stats)
POST   /api/chatas                - Create chata
PATCH  /api/chatas/:id            - Update chata
DELETE /api/chatas/:id            - Delete chata

GET    /api/participants          - List participants
POST   /api/participants          - Create participant
...

GET    /api/expenses              - List expenses
POST   /api/expenses              - Create expense
...

GET    /api/prepayments           - List prepayments
POST   /api/prepayments           - Create prepayment
...
```

### Custom Endpoints

#### 1. **Full Chata Data** (JSON-compatible format)
```
GET /api/chatas/:id/full
```

Returns complete chata data in format compatible with original JSON configs:
```json
{
  "name": "Chaloupka pod Medem",
  "shortName": "Chaloupka",
  "location": "Beskydy",
  "config": {
    "banker": "John Doe",
    "account": {
      "number": "123456/0100",
      "iban": "CZ1234..."
    },
    "contacts": {
      "Jane Doe": {
        "number": "789012/0100",
        "iban": "CZ5678..."
      }
    }
  },
  "participants": ["John Doe", "Jane Doe"],
  "expenses": [...],
  "prepayments": [...],
  "information": {...},
  "_stats": {
    "participants": {...},
    "debtors": [...],
    "creditors": [...],
    "totalExpenses": 1000,
    "totalPrepayments": 500
  }
}
```

#### 2. **Domain Resolution**
```
GET /api/domains/:hostname
```

Resolves a domain to its chata:
```json
{
  "found": true,
  "chata": {
    "id": "...",
    "name": "Chaloupka pod Medem",
    "slug": "chaloupka-pod-medem",
    "location": "Beskydy"
  }
}
```

#### 3. **Slug Lookup**
```
GET /api/chatas/slug/:slug
```

Looks up chata by slug:
```json
{
  "found": true,
  "chata": {
    "id": "...",
    "name": "Chaloupka pod Medem",
    "slug": "chaloupka-pod-medem",
    "location": "Beskydy"
  }
}
```

## Statistics Calculation

Statistics are automatically calculated when reading chata data via the `afterRead` hook.

### Calculated Fields (in `_stats`)

For each participant:
- `paidExternal` - Total amount paid for expenses
- `prepaidInternal` - Net prepayments (to/from banker)
- `prepaidAdvance` - Total advance payments
- `prepaidSupplement` - Total supplement payments
- `prepaidRefund` - Total refunds received
- `cost` - Fair share of all expenses
- `costBreakdown[]` - Per-expense breakdown
- `balance` - Final amount owed or to receive

Global statistics:
- `debtors[]` - Participants who owe money (sorted by amount)
- `creditors[]` - Participants owed money (sorted by amount)
- `totalExpenses` - Sum of all expenses
- `totalPrepayments` - Sum of all prepayments

### Calculation Logic

The calculation follows the original PoC logic:

1. **For each expense:**
   - Add to payer's `paidExternal`
   - Calculate each participant's share based on weights
   - Equal split ("ALL") divides equally among all participants
   - Weighted split uses custom multipliers

2. **For each prepayment:**
   - Update sender's `prepaidInternal` (positive)
   - Update banker's `prepaidInternal` (negative, opposite direction)
   - Categorize as advance/supplement/refund

3. **Final balance:**
   - `balance = paidExternal + prepaidInternal - cost`
   - Negative balance = owes money (debtor)
   - Positive balance = owed money (creditor)

## Migration from JSON Configs

### Running the Migration

1. Ensure the split-expanses directory is in place
2. Start the Payload dev server:
   ```bash
   pnpm dev
   ```

3. In another terminal, run the migration script:
   ```bash
   pnpm tsx src/scripts/migrate-json-configs.ts
   ```

The script will:
- Read `split-expanses/public/configs/domain-map.json`
- Import all referenced config files (except template.json)
- Create chatas, participants, expenses, and prepayments
- Set up domain mappings
- Configure the default chata

### What Gets Migrated

- ✅ All chata basic information
- ✅ Banking configuration
- ✅ Participants with contact info
- ✅ Expenses with weighted splits
- ✅ Prepayments with auto-detected types
- ✅ Trip information (dates, destination, photos, etc.)
- ✅ Transportation details
- ✅ Bedroom assignments
- ✅ Domain mappings
- ❌ Photos (URLs are preserved but files not uploaded)

### After Migration

1. Create an admin user:
   ```bash
   pnpm payload create-first-user
   ```

2. Access the admin panel:
   ```
   http://localhost:3000/admin
   ```

3. Verify data and statistics calculations

## Frontend Integration

### Option 1: Use Existing React App (Minimal Changes)

Update the config loading in `split-expanses/src/App.js`:

```javascript
// Old: Fetch static JSON
const response = await fetch(`/configs/${configFile}`)

// New: Fetch from Payload API
const response = await fetch(`/api/chatas/${chataId}/full`)
```

The data structure is compatible, so the rest of the app should work without changes.

### Option 2: Build New Next.js Frontend (Future)

Use the Payload Next.js app as a full-stack application:
- Create pages in `src/app/(frontend)/`
- Fetch data from Payload collections
- Use server components for optimal performance

## Access Control

### User Roles

**Admin** (`role: "admin"`):
- Can create, update, delete all chatas
- Can manage all participants, expenses, prepayments
- Can configure domain mappings

**User** (`role: "user"`):
- Can only manage assigned chatas
- Can create/update participants, expenses, prepayments for their chatas
- Cannot delete chatas

### API Access

- **Read**: Public (no authentication required)
- **Write**: Requires authentication and appropriate permissions

## Development Workflow

### 1. Start Development Server
```bash
pnpm dev
```

### 2. Access Admin Panel
```
http://localhost:3000/admin
```

### 3. Make Changes
- Edit collections in `src/collections/`
- Edit globals in `src/globals/`
- Edit hooks in `src/collections/*/hooks/`

### 4. Regenerate Types
```bash
pnpm generate:types
```

### 5. Test Changes
```bash
pnpm test
```

## Deployment

### Environment Variables

Required:
```env
DATABASE_URI=file:./chata.db
PAYLOAD_SECRET=your-secret-key-here
```

### Build for Production
```bash
pnpm build
pnpm start
```

## Troubleshooting

### Issue: Statistics not calculating

**Solution**: Check that the `afterRead` hook is registered in Chatas collection.

### Issue: Access denied errors

**Solution**:
- Verify user role
- Check assignedChatas for non-admin users
- Ensure authentication token is valid

### Issue: Domain routing not working

**Solution**:
- Verify domains are added to chata record
- Use slug-based routing as fallback

## Future Enhancements

1. **Caching**: Add Redis/memory cache for statistics
2. **Real-time Updates**: WebSocket support for live balance updates
3. **Photo Upload**: Full media upload support for trip photos
4. **Email Notifications**: Send payment reminders to debtors
5. **Multi-currency**: Support for different currencies
6. **Payment Tracking**: Mark individual payments as received
7. **Reports**: Generate PDF reports of settlements
8. **Mobile App**: React Native app using the API

## Support

For issues or questions:
- Check Payload CMS documentation: https://payloadcms.com/docs
- Review this migration guide
- Inspect API responses with browser dev tools
