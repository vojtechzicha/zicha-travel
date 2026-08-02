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
// Automatic mode (production — runs in Vercel's build via the
// package.json "vercel-build" script, against the deployment's own
// DATABASE_URI, i.e. prod DB for production builds, preview DB for
// preview builds):
//   node scripts/migrate-payer-polymorphic.mjs auto
// runs the WHOLE migration in one transaction, idempotently: creates the
// new tables (exact DDL Payload's schema push would generate), copies
// payer_id/from_id into the rels tables, keeps a _migration.payer_backup
// safety copy, drops the old columns. When the schema is already migrated
// it exits 0 without touching anything, so it is safe on every deploy.
//
// Manual mode (local development, where `pnpm dev` pushes the schema):
//   1. pnpm migrate:payer backup     # BEFORE the schema update
//   2. apply the new schema (start `pnpm dev` once)
//   3. pnpm migrate:payer restore    # AFTER the schema update
//   4. verify the app, then: pnpm migrate:payer cleanup
//
// Use `pnpm migrate:payer status` at any point to inspect the state.
//
// The database is taken from --db=<uri>, or DATABASE_URI from the
// environment / .env.local / .env (in that order — same precedence as Next).

import pg from 'pg'

// dotenv is a convenience for local runs; CI/Vercel builds provide
// DATABASE_URI via the environment instead
try {
  const { config: loadEnv } = await import('dotenv')
  loadEnv({ path: '.env.local' })
  loadEnv()
} catch {}

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
  const qualified = name.includes('.') ? name : `public.${name}`
  const res = await client.query(`SELECT to_regclass($1) AS reg`, [qualified])
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
  // The _migration schema keeps the backup out of the public schema, which
  // Payload's dev push manages (it would otherwise offer to delete it)
  await client.query('CREATE SCHEMA IF NOT EXISTS _migration')
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migration.payer_backup (
      collection text NOT NULL,
      parent_id integer NOT NULL,
      participant_id integer NOT NULL
    )`)
  await client.query(`
    INSERT INTO _migration.payer_backup (collection, parent_id, participant_id)
      SELECT 'expenses', e.id, e.payer_id
      FROM expenses e
      WHERE e.payer_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM _migration.payer_backup b
          WHERE b.collection = 'expenses' AND b.parent_id = e.id
        )`)
  await client.query(`
    INSERT INTO _migration.payer_backup (collection, parent_id, participant_id)
      SELECT 'prepayments', p.id, p.from_id
      FROM prepayments p
      WHERE p.from_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM _migration.payer_backup b
          WHERE b.collection = 'prepayments' AND b.parent_id = p.id
        )`)
  await client.query('COMMIT')
  const counts = await client.query(
    `SELECT collection, count(*)::int AS n FROM _migration.payer_backup GROUP BY collection ORDER BY collection`
  )
  console.table(counts.rows)
  console.log(
    'Backup complete (table _migration.payer_backup).\nNow apply the new schema, then run: pnpm migrate:payer restore'
  )
}

async function restore() {
  if (!(await tableExists('_migration.payer_backup'))) {
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
      FROM _migration.payer_backup b
      WHERE b.collection = 'expenses'
        AND EXISTS (SELECT 1 FROM expenses e WHERE e.id = b.parent_id)
        AND NOT EXISTS (
          SELECT 1 FROM expenses_rels r
          WHERE r.parent_id = b.parent_id AND r.path = 'payer'
        )`)
  const prep = await client.query(`
    INSERT INTO prepayments_rels ("order", parent_id, path, participants_id)
      SELECT 1, b.parent_id, 'from', b.participant_id
      FROM _migration.payer_backup b
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
  const hasBackup = await tableExists('_migration.payer_backup')
  const oldSchema = await columnExists('expenses', 'payer_id')
  console.log(`Schema: ${oldSchema ? 'OLD (payer_id column present)' : 'NEW (polymorphic rels)'}`)
  console.table([
    {
      what: 'backed up',
      expenses: hasBackup
        ? await q(`SELECT count(*)::int AS n FROM _migration.payer_backup WHERE collection = 'expenses'`)
        : '(no backup table)',
      prepayments: hasBackup
        ? await q(`SELECT count(*)::int AS n FROM _migration.payer_backup WHERE collection = 'prepayments'`)
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
  await client.query('DROP SCHEMA IF EXISTS _migration CASCADE')
  console.log('Backup schema dropped.')
}

// DDL for the tables the new code expects, captured verbatim from what
// Payload's dev schema push generates (PostgreSQL 16, Payload 3.x) — table,
// constraint, and index names must match so a later dev push is a no-op.
const NEW_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS joint_accounts (
  id serial PRIMARY KEY,
  name character varying NOT NULL,
  chata_id integer NOT NULL,
  updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
  created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
  CONSTRAINT joint_accounts_chata_id_chatas_id_fk
    FOREIGN KEY (chata_id) REFERENCES chatas(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS joint_accounts_chata_idx ON joint_accounts USING btree (chata_id);
CREATE INDEX IF NOT EXISTS joint_accounts_updated_at_idx ON joint_accounts USING btree (updated_at);
CREATE INDEX IF NOT EXISTS joint_accounts_created_at_idx ON joint_accounts USING btree (created_at);

CREATE TABLE IF NOT EXISTS joint_accounts_rels (
  id serial PRIMARY KEY,
  "order" integer,
  parent_id integer NOT NULL,
  path character varying NOT NULL,
  participants_id integer,
  CONSTRAINT joint_accounts_rels_parent_fk
    FOREIGN KEY (parent_id) REFERENCES joint_accounts(id) ON DELETE CASCADE,
  CONSTRAINT joint_accounts_rels_participants_fk
    FOREIGN KEY (participants_id) REFERENCES participants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS joint_accounts_rels_order_idx ON joint_accounts_rels USING btree ("order");
CREATE INDEX IF NOT EXISTS joint_accounts_rels_parent_idx ON joint_accounts_rels USING btree (parent_id);
CREATE INDEX IF NOT EXISTS joint_accounts_rels_path_idx ON joint_accounts_rels USING btree (path);
CREATE INDEX IF NOT EXISTS joint_accounts_rels_participants_id_idx ON joint_accounts_rels USING btree (participants_id);

CREATE TABLE IF NOT EXISTS expenses_rels (
  id serial PRIMARY KEY,
  "order" integer,
  parent_id integer NOT NULL,
  path character varying NOT NULL,
  participants_id integer,
  joint_accounts_id integer,
  CONSTRAINT expenses_rels_parent_fk
    FOREIGN KEY (parent_id) REFERENCES expenses(id) ON DELETE CASCADE,
  CONSTRAINT expenses_rels_participants_fk
    FOREIGN KEY (participants_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT expenses_rels_joint_accounts_fk
    FOREIGN KEY (joint_accounts_id) REFERENCES joint_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS expenses_rels_order_idx ON expenses_rels USING btree ("order");
CREATE INDEX IF NOT EXISTS expenses_rels_parent_idx ON expenses_rels USING btree (parent_id);
CREATE INDEX IF NOT EXISTS expenses_rels_path_idx ON expenses_rels USING btree (path);
CREATE INDEX IF NOT EXISTS expenses_rels_participants_id_idx ON expenses_rels USING btree (participants_id);
CREATE INDEX IF NOT EXISTS expenses_rels_joint_accounts_id_idx ON expenses_rels USING btree (joint_accounts_id);

CREATE TABLE IF NOT EXISTS prepayments_rels (
  id serial PRIMARY KEY,
  "order" integer,
  parent_id integer NOT NULL,
  path character varying NOT NULL,
  participants_id integer,
  joint_accounts_id integer,
  CONSTRAINT prepayments_rels_parent_fk
    FOREIGN KEY (parent_id) REFERENCES prepayments(id) ON DELETE CASCADE,
  CONSTRAINT prepayments_rels_participants_fk
    FOREIGN KEY (participants_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT prepayments_rels_joint_accounts_fk
    FOREIGN KEY (joint_accounts_id) REFERENCES joint_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS prepayments_rels_order_idx ON prepayments_rels USING btree ("order");
CREATE INDEX IF NOT EXISTS prepayments_rels_parent_idx ON prepayments_rels USING btree (parent_id);
CREATE INDEX IF NOT EXISTS prepayments_rels_path_idx ON prepayments_rels USING btree (path);
CREATE INDEX IF NOT EXISTS prepayments_rels_participants_id_idx ON prepayments_rels USING btree (participants_id);
CREATE INDEX IF NOT EXISTS prepayments_rels_joint_accounts_id_idx ON prepayments_rels USING btree (joint_accounts_id);

-- Payload's internal locked-documents tracking references every collection,
-- so the new collection needs its column there too
ALTER TABLE payload_locked_documents_rels ADD COLUMN IF NOT EXISTS joint_accounts_id integer;
DO $$ BEGIN
  ALTER TABLE payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_joint_accounts_fk
    FOREIGN KEY (joint_accounts_id) REFERENCES joint_accounts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_joint_accounts_id_idx
  ON payload_locked_documents_rels USING btree (joint_accounts_id);

-- "Pozvání" (invitations) feature: Expenses.invitations array — the host
-- covers the guest's share of the expense. Additive only (new table), so it
-- needs no data migration.
CREATE TABLE IF NOT EXISTS expenses_invitations (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id character varying PRIMARY KEY,
  host_id integer NOT NULL,
  guest_id integer NOT NULL,
  auto boolean DEFAULT false,
  CONSTRAINT expenses_invitations_parent_id_fk
    FOREIGN KEY (_parent_id) REFERENCES expenses(id) ON DELETE CASCADE,
  CONSTRAINT expenses_invitations_host_id_participants_id_fk
    FOREIGN KEY (host_id) REFERENCES participants(id) ON DELETE SET NULL,
  CONSTRAINT expenses_invitations_guest_id_participants_id_fk
    FOREIGN KEY (guest_id) REFERENCES participants(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS expenses_invitations_order_idx ON expenses_invitations USING btree (_order);
CREATE INDEX IF NOT EXISTS expenses_invitations_parent_id_idx ON expenses_invitations USING btree (_parent_id);
CREATE INDEX IF NOT EXISTS expenses_invitations_host_idx ON expenses_invitations USING btree (host_id);
CREATE INDEX IF NOT EXISTS expenses_invitations_guest_idx ON expenses_invitations USING btree (guest_id);

-- "Platí za něj/ni" (paid by): a participant permanently covered by another
-- (e.g. a child) — drives auto invitation rows. Additive only. The ALTER on
-- expenses_invitations covers databases that got the table before the
-- auto column existed.
ALTER TABLE expenses_invitations ADD COLUMN IF NOT EXISTS auto boolean DEFAULT false;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS paid_by_id integer;
DO $$ BEGIN
  ALTER TABLE participants
    ADD CONSTRAINT participants_paid_by_id_participants_id_fk
    FOREIGN KEY (paid_by_id) REFERENCES participants(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS participants_paid_by_idx ON participants USING btree (paid_by_id);

-- "Účtenky" (expense attachments) feature: upload collection for receipts
-- (photos, PDFs) attached to expenses via Expenses.attachments (hasMany
-- upload → rows in expenses_rels). Additive only — no data migration. The
-- prefix column is added by the S3 storage plugin (enabled in production);
-- it stays unused (NULL) where uploads go to local disk.
CREATE TABLE IF NOT EXISTS expense_attachments (
  id serial PRIMARY KEY,
  alt character varying,
  prefix character varying DEFAULT 'expense-attachments',
  updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
  created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
  url character varying,
  thumbnail_u_r_l character varying,
  filename character varying,
  mime_type character varying,
  filesize numeric,
  width numeric,
  height numeric,
  focal_x numeric,
  focal_y numeric
);
CREATE INDEX IF NOT EXISTS expense_attachments_updated_at_idx ON expense_attachments USING btree (updated_at);
CREATE INDEX IF NOT EXISTS expense_attachments_created_at_idx ON expense_attachments USING btree (created_at);
CREATE UNIQUE INDEX IF NOT EXISTS expense_attachments_filename_idx ON expense_attachments USING btree (filename);

ALTER TABLE expenses_rels ADD COLUMN IF NOT EXISTS expense_attachments_id integer;
DO $$ BEGIN
  ALTER TABLE expenses_rels
    ADD CONSTRAINT expenses_rels_expense_attachments_fk
    FOREIGN KEY (expense_attachments_id) REFERENCES expense_attachments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS expenses_rels_expense_attachments_id_idx
  ON expenses_rels USING btree (expense_attachments_id);

ALTER TABLE payload_locked_documents_rels ADD COLUMN IF NOT EXISTS expense_attachments_id integer;
DO $$ BEGIN
  ALTER TABLE payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_expense_attachments_fk
    FOREIGN KEY (expense_attachments_id) REFERENCES expense_attachments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_expense_attachments_id_idx
  ON payload_locked_documents_rels USING btree (expense_attachments_id);

-- Czech declension ("skloňování"): optional accusative ("Katku") and
-- vocative ("Katko") forms of the participant's name; the frontend falls
-- back to the plain name when empty. Additive only — no data migration.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS akuzativ character varying;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS vokativ character varying;
`

async function auto() {
  await client.query('BEGIN')
  // Serialize concurrent release commands (e.g. two deploys racing)
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('migrate-payer-polymorphic'))`)

  const oldExpenses = await columnExists('expenses', 'payer_id')
  const oldPrepayments = await columnExists('prepayments', 'from_id')

  // Always ensure the new tables exist — on an already-migrated database
  // every statement is IF NOT EXISTS and does nothing
  await client.query(NEW_SCHEMA_DDL)

  if (!oldExpenses && !oldPrepayments) {
    await client.query('COMMIT')
    console.log('Schema already migrated — nothing to do.')
    return
  }

  console.log('Old schema detected — migrating payer/from references...')
  // Safety copy lives outside the public schema so Payload's dev push
  // never offers to delete it
  await client.query('CREATE SCHEMA IF NOT EXISTS _migration')
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migration.payer_backup (
      collection text NOT NULL,
      parent_id integer NOT NULL,
      participant_id integer NOT NULL
    )`)

  if (oldExpenses) {
    await client.query(`
      INSERT INTO _migration.payer_backup (collection, parent_id, participant_id)
        SELECT 'expenses', e.id, e.payer_id FROM expenses e
        WHERE e.payer_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM _migration.payer_backup b
            WHERE b.collection = 'expenses' AND b.parent_id = e.id
          )`)
    const res = await client.query(`
      INSERT INTO expenses_rels ("order", parent_id, path, participants_id)
        SELECT 1, e.id, 'payer', e.payer_id FROM expenses e
        WHERE e.payer_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM expenses_rels r
            WHERE r.parent_id = e.id AND r.path = 'payer'
          )`)
    const src = await client.query(
      `SELECT count(*)::int AS n FROM expenses WHERE payer_id IS NOT NULL`
    )
    const dst = await client.query(
      `SELECT count(*)::int AS n FROM expenses_rels WHERE path = 'payer'`
    )
    if (dst.rows[0].n < src.rows[0].n) {
      throw new Error(
        `expenses payer count mismatch: ${src.rows[0].n} source rows but ${dst.rows[0].n} rels rows`
      )
    }
    await client.query('ALTER TABLE expenses DROP COLUMN payer_id')
    console.log(`expenses: migrated ${res.rowCount} payer refs (${dst.rows[0].n} total in rels)`)
  }

  if (oldPrepayments) {
    await client.query(`
      INSERT INTO _migration.payer_backup (collection, parent_id, participant_id)
        SELECT 'prepayments', p.id, p.from_id FROM prepayments p
        WHERE p.from_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM _migration.payer_backup b
            WHERE b.collection = 'prepayments' AND b.parent_id = p.id
          )`)
    const res = await client.query(`
      INSERT INTO prepayments_rels ("order", parent_id, path, participants_id)
        SELECT 1, p.id, 'from', p.from_id FROM prepayments p
        WHERE p.from_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM prepayments_rels r
            WHERE r.parent_id = p.id AND r.path = 'from'
          )`)
    const src = await client.query(
      `SELECT count(*)::int AS n FROM prepayments WHERE from_id IS NOT NULL`
    )
    const dst = await client.query(
      `SELECT count(*)::int AS n FROM prepayments_rels WHERE path = 'from'`
    )
    if (dst.rows[0].n < src.rows[0].n) {
      throw new Error(
        `prepayments from count mismatch: ${src.rows[0].n} source rows but ${dst.rows[0].n} rels rows`
      )
    }
    await client.query('ALTER TABLE prepayments DROP COLUMN from_id')
    console.log(`prepayments: migrated ${res.rowCount} from refs (${dst.rows[0].n} total in rels)`)
  }

  await client.query('COMMIT')
  console.log(
    'Migration complete. A safety copy is kept in _migration.payer_backup — drop it later with: pnpm migrate:payer cleanup'
  )
}

const commands = { backup, restore, status, cleanup, auto }

if (!command || !commands[command]) {
  console.error('Usage: pnpm migrate:payer auto|backup|restore|status|cleanup [--db=<uri>]')
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
