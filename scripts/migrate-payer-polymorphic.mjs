#!/usr/bin/env node
// One-time data migration for the "společný účet" (joint account) feature.
// Cross-platform (Windows/macOS/Linux) — run via `pnpm migrate:payer <command>`.
//
// Expenses.payer and Prepayments.from changed from a single-collection
// relationship (stored as expenses.payer_id / prepayments.from_id columns)
// to a polymorphic relationship (stored as rows in expenses_rels /
// prepayments_rels). Payload's schema push DROPS the old columns, so the
// values must be backed up BEFORE the new schema is applied and restored
// into the rels tables AFTER.
//
// Procedure (rehearse locally against a prod copy first):
//   1. pnpm migrate:payer backup     # BEFORE the schema update
//   2. apply the new schema (start `pnpm dev` once, or deploy)
//   3. pnpm migrate:payer restore    # AFTER the schema update
//   4. verify the app, then: pnpm migrate:payer cleanup
//
// Use `pnpm migrate:payer status` at any point to inspect the state.
//
// The database is taken from --db=<uri>, or DATABASE_URI from the
// environment / .env.local / .env (in that order — same precedence as Next).

import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ path: '.env.local' })
loadEnv()

const args = process.argv.slice(2)
const command = args.find((a) => !a.startsWith('--'))
const dbArg = args.find((a) => a.startsWith('--db='))
const databaseUri = dbArg ? dbArg.slice('--db='.length) : process.env.DATABASE_URI

if (!databaseUri) {
  console.error('ERROR: no database URI (set DATABASE_URI in .env.local/.env or pass --db=<uri>)')
  process.exit(1)
}

const url = new URL(databaseUri)
console.log(`Database: ${url.hostname}:${url.port || 5432}${url.pathname}\n`)

const client = new pg.Client({ connectionString: databaseUri })

async function tableExists(name) {
  const res = await client.query(`SELECT to_regclass($1) AS reg`, [`public.${name}`])
  return res.rows[0].reg !== null
}

async function columnExists(table, column) {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  )
  return res.rowCount > 0
}

async function backup() {
  if (!(await columnExists('expenses', 'payer_id'))) {
    console.error(
      'ERROR: expenses.payer_id no longer exists — the new schema is already applied.\n' +
        'Backup must run BEFORE the schema update. If you already ran backup earlier, run: restore'
    )
    process.exit(1)
  }
  await client.query('BEGIN')
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migration_payer_backup (
      collection text NOT NULL,
      parent_id integer NOT NULL,
      participant_id integer NOT NULL
    )`)
  await client.query(`
    INSERT INTO _migration_payer_backup (collection, parent_id, participant_id)
      SELECT 'expenses', e.id, e.payer_id
      FROM expenses e
      WHERE e.payer_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM _migration_payer_backup b
          WHERE b.collection = 'expenses' AND b.parent_id = e.id
        )`)
  await client.query(`
    INSERT INTO _migration_payer_backup (collection, parent_id, participant_id)
      SELECT 'prepayments', p.id, p.from_id
      FROM prepayments p
      WHERE p.from_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM _migration_payer_backup b
          WHERE b.collection = 'prepayments' AND b.parent_id = p.id
        )`)
  await client.query('COMMIT')
  const counts = await client.query(
    `SELECT collection, count(*)::int AS n FROM _migration_payer_backup GROUP BY collection ORDER BY collection`
  )
  console.table(counts.rows)
  console.log(
    'Backup complete (table _migration_payer_backup).\nNow apply the new schema, then run: pnpm migrate:payer restore'
  )
}

async function restore() {
  if (!(await tableExists('_migration_payer_backup'))) {
    console.error('ERROR: backup table not found — run backup first (before the schema update).')
    process.exit(1)
  }
  for (const missing of ['expenses_rels', 'prepayments_rels']) {
    if (!(await tableExists(missing))) {
      console.error(
        `ERROR: table ${missing} not found — the new schema is not applied yet.\n` +
          'Start the app once (or deploy) so Payload creates the new schema, then re-run restore.'
      )
      process.exit(1)
    }
  }
  await client.query('BEGIN')
  const exp = await client.query(`
    INSERT INTO expenses_rels ("order", parent_id, path, participants_id)
      SELECT 1, b.parent_id, 'payer', b.participant_id
      FROM _migration_payer_backup b
      WHERE b.collection = 'expenses'
        AND EXISTS (SELECT 1 FROM expenses e WHERE e.id = b.parent_id)
        AND NOT EXISTS (
          SELECT 1 FROM expenses_rels r
          WHERE r.parent_id = b.parent_id AND r.path = 'payer'
        )`)
  const prep = await client.query(`
    INSERT INTO prepayments_rels ("order", parent_id, path, participants_id)
      SELECT 1, b.parent_id, 'from', b.participant_id
      FROM _migration_payer_backup b
      WHERE b.collection = 'prepayments'
        AND EXISTS (SELECT 1 FROM prepayments p WHERE p.id = b.parent_id)
        AND NOT EXISTS (
          SELECT 1 FROM prepayments_rels r
          WHERE r.parent_id = b.parent_id AND r.path = 'from'
        )`)
  await client.query('COMMIT')
  console.log(`Inserted ${exp.rowCount} expense payer refs, ${prep.rowCount} prepayment from refs.`)
  await status()
  console.log(
    '\nRestore complete. Verify the counts above match, test the app, then run: pnpm migrate:payer cleanup'
  )
}

async function status() {
  const q = async (sql) => (await client.query(sql)).rows[0].n
  const hasBackup = await tableExists('_migration_payer_backup')
  const oldSchema = await columnExists('expenses', 'payer_id')
  console.log(`Schema: ${oldSchema ? 'OLD (payer_id column present)' : 'NEW (polymorphic rels)'}`)
  console.table([
    {
      what: 'backed up',
      expenses: hasBackup
        ? await q(`SELECT count(*)::int AS n FROM _migration_payer_backup WHERE collection = 'expenses'`)
        : '(no backup table)',
      prepayments: hasBackup
        ? await q(`SELECT count(*)::int AS n FROM _migration_payer_backup WHERE collection = 'prepayments'`)
        : '(no backup table)',
    },
    {
      what: 'restored (rels)',
      expenses: (await tableExists('expenses_rels'))
        ? await q(`SELECT count(*)::int AS n FROM expenses_rels WHERE path = 'payer'`)
        : '(no rels table)',
      prepayments: (await tableExists('prepayments_rels'))
        ? await q(`SELECT count(*)::int AS n FROM prepayments_rels WHERE path = 'from'`)
        : '(no rels table)',
    },
  ])
}

async function cleanup() {
  await client.query('DROP TABLE IF EXISTS _migration_payer_backup')
  console.log('Backup table dropped.')
}

const commands = { backup, restore, status, cleanup }

if (!command || !commands[command]) {
  console.error('Usage: pnpm migrate:payer backup|restore|status|cleanup [--db=<uri>]')
  process.exit(1)
}

try {
  await client.connect()
  await commands[command]()
} catch (err) {
  try {
    await client.query('ROLLBACK')
  } catch {}
  console.error(err)
  process.exitCode = 1
} finally {
  await client.end()
}
