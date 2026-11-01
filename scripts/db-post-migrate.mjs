// Per-deploy database upkeep, run by `vercel-build` right after
// `payload migrate`. Schema changes live in src/migrations (Payload
// migrations); this script holds only the idempotent steps that must run on
// EVERY deploy, against that deployment's own DATABASE_URI (prod or preview):
//
//   1. enableRowLevelSecurity — RLS on every table in public, so a table a
//      migration just created is covered by the same deploy
//   2. backfillExpenseApproval — approval/payer-account consistency repair
//   3. refreshTapItems — keeps the bar ("Výčep") rows in line with the keg
//      catalog; stops the deploy if a CLOSED order still holds old tap rows
//
// They used to be part of scripts/migrate-payer-polymorphic.mjs (`auto`),
// which also carried the hand-maintained schema DDL; see git history.
//
//   node scripts/db-post-migrate.mjs [--db=<uri>]

import pg from 'pg'
import { pgSslFor } from '../src/lib/db-ssl.mjs'

// dotenv is a convenience for local runs; CI/Vercel builds provide
// DATABASE_URI via the environment instead
try {
  const { config: loadEnv } = await import('dotenv')
  loadEnv({ path: '.env.local' })
  loadEnv()
} catch {}

const dbArg = process.argv.slice(2).find((a) => a.startsWith('--db='))
const databaseUri = dbArg ? dbArg.slice('--db='.length) : process.env.DATABASE_URI

if (!databaseUri) {
  console.error('ERROR: no database URI (set DATABASE_URI in .env.local/.env or pass --db=<uri>)')
  process.exit(1)
}

const url = new URL(databaseUri)
console.log(`Database: ${url.hostname}:${url.port || 5432}${url.pathname}\n`)

const client = new pg.Client({ connectionString: databaseUri, ssl: pgSslFor(databaseUri) })

/**
 * "Výdaj za jiného plátce" data backfill (idempotent, runs inside auto()'s
 * transaction): every pre-existing expense is approved, and each one gets
 * the account of its paying participant stamped on it. Cheap enough to
 * re-run on every deploy, which also repairs drift.
 */
async function backfillExpenseApproval() {
  await client.query(
    `UPDATE expenses SET approval_status = 'approved' WHERE approval_status IS NULL`
  )
  const synced = await client.query(`
    UPDATE expenses e
      SET payer_account_id = p.account_id
      FROM expenses_rels r
      JOIN participants p ON p.id = r.participants_id
      WHERE r.parent_id = e.id
        AND r.path = 'payer'
        AND e.payer_account_id IS DISTINCT FROM p.account_id`)
  if (synced.rowCount > 0) {
    console.log(`expenses: stamped payer_account_id on ${synced.rowCount} row(s)`)
  }
  // The stamp above only covers participant payers. If a payer was switched
  // to a joint account outside the app hooks, the old participant's account
  // would linger — a joint account has no single owner, so clear it.
  const cleared = await client.query(`
    UPDATE expenses e
      SET payer_account_id = NULL
      WHERE e.payer_account_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM expenses_rels r
          WHERE r.parent_id = e.id
            AND r.path = 'payer'
            AND r.participants_id IS NOT NULL
        )`)
  if (cleared.rowCount > 0) {
    console.log(`expenses: cleared payer_account_id on ${cleared.rowCount} joint-account row(s)`)
  }
}

/**
 * "Pivo": the bar item ('VYCEP-KOHOUT') still counts taps, but it is now
 * ONE item per order priced per bar (barPlan in src/lib/beer.ts) and named
 * "Výčep"; before, anyone could add their own tap row. An open order's tap
 * rows merge into its oldest one, the taps summed. An item opt-out
 * ("nechci") survives the merge only for somebody who opted out of every
 * merged row: one bar can't keep a per-row split, and nobody gets left out
 * of taps they didn't refuse. The stored name and price per bar and day
 * (mirrored here, this script can't import TypeScript) follow, so the admin
 * shows what the page uses.
 *
 * A CLOSED order with old tap rows (closed before the weekend flag existed)
 * would show a receipt the bar plan reprices, out of step with its Finance
 * row, so the deploy stops instead: none existed when this shipped. Reopen
 * such an order (then the next deploy merges it) or fix it by hand.
 * Idempotent: nothing matches once done.
 */
async function refreshTapItems() {
  const legacyClosed = await client.query(`
    SELECT DISTINCT c.id, c.slug FROM chatas c JOIN keg_items k ON k.chata_id = c.id
      WHERE k.code = 'VYCEP-KOHOUT'
        AND c.beer_closed_at IS NOT NULL
        AND c.beer_closed_tap_weekend IS NULL`)
  if (legacyClosed.rowCount > 0) {
    throw new Error(
      'Closed beer orders still priced per tap: ' +
        legacyClosed.rows.map((row) => row.slug ?? row.id).join(', ') +
        '. Reopen them (Pivo, "Znovu otevřít") and deploy again.',
    )
  }
  const { rows } = await client.query(`
    SELECT k.id, k.quantity,
           first_value(k.id) OVER (PARTITION BY k.chata_id ORDER BY k.created_at, k.id) AS keep_id
      FROM keg_items k JOIN chatas c ON c.id = k.chata_id
      WHERE k.code = 'VYCEP-KOHOUT' AND c.beer_closed_at IS NULL`)
  const merged = rows.filter((row) => row.id !== row.keep_id)
  if (merged.length > 0) {
    const groups = new Map()
    for (const row of rows) {
      const group = groups.get(row.keep_id) ?? { taps: 0, ids: [] }
      group.taps += Math.max(1, Math.round(Number(row.quantity) || 1))
      group.ids.push(row.id)
      groups.set(row.keep_id, group)
    }
    for (const [keepId, group] of groups) {
      if (group.ids.length < 2) continue
      await client.query('UPDATE keg_items SET quantity = $2, updated_at = now() WHERE id = $1', [
        keepId,
        group.taps,
      ])
      // who opted out of every merged row keeps it on the one bar
      const { rows: refusers } = await client.query(
        `SELECT participant_id FROM list_opt_outs
          WHERE list = 'beer' AND item_id = ANY($1::numeric[])
          GROUP BY participant_id
          HAVING count(DISTINCT item_id) = $2`,
        [group.ids, group.ids.length],
      )
      const keep = refusers.map((row) => row.participant_id)
      await client.query(
        `DELETE FROM list_opt_outs
          WHERE list = 'beer' AND item_id = ANY($1::numeric[])
            AND NOT (item_id = $2 AND participant_id = ANY($3::int[]))`,
        [group.ids, keepId, keep],
      )
    }
    await client.query('DELETE FROM keg_items WHERE id = ANY($1::int[])', [
      merged.map((row) => row.id),
    ])
    console.log(`keg_items: merged ${merged.length} extra bar row(s) into one per order`)
  }
  const res = await client.query(`
    UPDATE keg_items k SET name = 'Výčep', price = 300, updated_at = now()
      FROM chatas c
      WHERE c.id = k.chata_id
        AND k.code = 'VYCEP-KOHOUT'
        AND c.beer_closed_at IS NULL
        AND (k.name IS DISTINCT FROM 'Výčep' OR k.price IS DISTINCT FROM 300)`)
  if (res.rowCount > 0) console.log(`keg_items: ${res.rowCount} bar row(s) renamed and repriced`)
}

/**
 * Supabase exposes every table in the public schema through its
 * auto-generated Data API (PostgREST) with the public anon key — a path
 * that bypasses Payload's access control entirely, since the app only ever
 * talks to Postgres directly over DATABASE_URI. Enabling RLS with NO
 * policies denies the API roles (anon/authenticated) everything, while
 * Payload is unaffected: it connects as the table owner, and owners bypass
 * RLS unless FORCE is set (deliberately not set here). Tables are
 * enumerated at run time, so a table added by a future deploy gets covered
 * by the same deploy that creates it. Harmless on local Docker Postgres
 * (no PostgREST there, and the same owner-bypass applies).
 */
async function enableRowLevelSecurity() {
  const tables = await client.query(`
    SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`)
  for (const { name } of tables.rows) {
    await client.query(`ALTER TABLE public."${name.replaceAll('"', '""')}" ENABLE ROW LEVEL SECURITY`)
  }
  if (tables.rowCount > 0) {
    console.log(`RLS: enabled on ${tables.rowCount} table(s)`)
  }
}

try {
  await client.connect()
  await client.query('BEGIN')
  // Serialize concurrent deploys (e.g. two previews racing on one database)
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('db-post-migrate'))`)
  await enableRowLevelSecurity()
  await backfillExpenseApproval()
  await refreshTapItems()
  await client.query('COMMIT')
  console.log('Post-migrate upkeep done.')
} catch (err) {
  try {
    await client.query('ROLLBACK')
  } catch {}
  console.error(err)
  process.exitCode = 1
} finally {
  await client.end()
}
