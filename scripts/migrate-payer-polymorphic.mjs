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

-- Public transport option direction: tam (to the chata → calendar event on the
-- arrival day) or zpet (back home → departure day). Additive only; the DEFAULT
-- backfills existing rows as "tam".
DO $$ BEGIN
  CREATE TYPE enum_chatas_public_transport_options_direction AS ENUM('tam', 'zpet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE chatas_public_transport_options
  ADD COLUMN IF NOT EXISTS direction enum_chatas_public_transport_options_direction DEFAULT 'tam';

-- User accounts redesign ("uživatelé a role"), additive part. The enum value
-- migration (renames + new 'user' value) cannot run in this transaction —
-- see migrateUserRoles(), which auto() runs first.
-- users: magic-link login token (sha256 hash of the emailed token + expiry)
-- and the "active account" marker (set on every login; participants linked
-- to an active account are hidden from anonymous visitors)
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_token character varying;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_token_expires timestamp(3) with time zone;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamp(3) with time zone;
-- participants: linked frontend user account
ALTER TABLE participants ADD COLUMN IF NOT EXISTS account_id integer;
DO $$ BEGIN
  ALTER TABLE participants
    ADD CONSTRAINT participants_account_id_users_id_fk
    FOREIGN KEY (account_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS participants_account_idx ON participants USING btree (account_id);

-- Frontend expense authoring: the signed-in account that created the
-- expense (Expenses.authoredBy). Frontend users may edit/delete only their
-- own expenses; existing rows stay NULL (admin-panel era). Additive only.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS authored_by_id integer;
DO $$ BEGIN
  ALTER TABLE expenses
    ADD CONSTRAINT expenses_authored_by_id_users_id_fk
    FOREIGN KEY (authored_by_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS expenses_authored_by_idx ON expenses USING btree (authored_by_id);

-- Account display names ("jména účtů"): full name shown in the frontend
-- header pill + vocative for the personal greeting ("Ahoj, Katko.").
-- Participants without their own name forms fall back to the linked
-- account's. Additive only — no data migration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name character varying;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vokativ character varying;

-- "Claim účastníka" (docs/PRD-claim.md): requests to link a participant to
-- a frontend account, decided by chata admins. Additive only (new table).
-- DDL mirrors the schema Payload's dev push generates locally.
DO $$ BEGIN
  CREATE TYPE enum_claim_requests_status AS ENUM('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS claim_requests (
  id serial PRIMARY KEY,
  participant_id integer NOT NULL,
  chata_id integer,
  user_id integer NOT NULL,
  status enum_claim_requests_status DEFAULT 'pending' NOT NULL,
  reason character varying,
  decided_by_id integer,
  decided_at timestamp(3) with time zone,
  auto_approved boolean DEFAULT false,
  reminder_sent_at timestamp(3) with time zone,
  updated_at timestamp(3) with time zone DEFAULT now() NOT NULL,
  created_at timestamp(3) with time zone DEFAULT now() NOT NULL,
  CONSTRAINT claim_requests_participant_id_participants_id_fk
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL,
  CONSTRAINT claim_requests_chata_id_chatas_id_fk
    FOREIGN KEY (chata_id) REFERENCES chatas(id) ON DELETE SET NULL,
  CONSTRAINT claim_requests_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT claim_requests_decided_by_id_users_id_fk
    FOREIGN KEY (decided_by_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS claim_requests_participant_idx ON claim_requests USING btree (participant_id);
CREATE INDEX IF NOT EXISTS claim_requests_chata_idx ON claim_requests USING btree (chata_id);
CREATE INDEX IF NOT EXISTS claim_requests_user_idx ON claim_requests USING btree (user_id);
CREATE INDEX IF NOT EXISTS claim_requests_decided_by_idx ON claim_requests USING btree (decided_by_id);
CREATE INDEX IF NOT EXISTS claim_requests_updated_at_idx ON claim_requests USING btree (updated_at);
CREATE INDEX IF NOT EXISTS claim_requests_created_at_idx ON claim_requests USING btree (created_at);

ALTER TABLE payload_locked_documents_rels ADD COLUMN IF NOT EXISTS claim_requests_id integer;
DO $$ BEGIN
  ALTER TABLE payload_locked_documents_rels
    ADD CONSTRAINT payload_locked_documents_rels_claim_requests_fk
    FOREIGN KEY (claim_requests_id) REFERENCES claim_requests(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_claim_requests_id_idx
  ON payload_locked_documents_rels USING btree (claim_requests_id);

-- Trip document redesign ("Detail chaty — finál"): descriptive metadata on
-- the chata. All additive & optional — check-in/out times, destination
-- coordinates (weather + navigation), shared album link, packing list,
-- amenities, day-by-day program, surroundings, contact/rules rows, and a
-- seat count on shared cars. DDL captured verbatim from the local dev push.
ALTER TABLE chatas ADD COLUMN IF NOT EXISTS check_in_time character varying;
ALTER TABLE chatas ADD COLUMN IF NOT EXISTS check_out_time character varying;
ALTER TABLE chatas ADD COLUMN IF NOT EXISTS destination_lat numeric;
ALTER TABLE chatas ADD COLUMN IF NOT EXISTS destination_lng numeric;
ALTER TABLE chatas ADD COLUMN IF NOT EXISTS shared_album_url character varying;
ALTER TABLE chatas_shared_cars ADD COLUMN IF NOT EXISTS seats numeric;

-- Tentative trip dates ("orientační termín"): the trip dates become a window
-- and the stay length lives in trip_planned_nights until the dates are fixed.
ALTER TABLE chatas ADD COLUMN IF NOT EXISTS trip_dates_tentative boolean DEFAULT false;
ALTER TABLE chatas ADD COLUMN IF NOT EXISTS trip_planned_nights numeric;

CREATE TABLE IF NOT EXISTS chatas_amenities (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id character varying PRIMARY KEY,
  name character varying NOT NULL,
  available boolean DEFAULT true,
  CONSTRAINT chatas_amenities_parent_id_fk
    FOREIGN KEY (_parent_id) REFERENCES chatas(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chatas_amenities_order_idx ON chatas_amenities USING btree (_order);
CREATE INDEX IF NOT EXISTS chatas_amenities_parent_id_idx ON chatas_amenities USING btree (_parent_id);

CREATE TABLE IF NOT EXISTS chatas_packing_items (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id character varying PRIMARY KEY,
  item character varying NOT NULL,
  CONSTRAINT chatas_packing_items_parent_id_fk
    FOREIGN KEY (_parent_id) REFERENCES chatas(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chatas_packing_items_order_idx ON chatas_packing_items USING btree (_order);
CREATE INDEX IF NOT EXISTS chatas_packing_items_parent_id_idx ON chatas_packing_items USING btree (_parent_id);

CREATE TABLE IF NOT EXISTS chatas_program (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id character varying PRIMARY KEY,
  date timestamp(3) with time zone NOT NULL,
  description character varying NOT NULL,
  CONSTRAINT chatas_program_parent_id_fk
    FOREIGN KEY (_parent_id) REFERENCES chatas(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chatas_program_order_idx ON chatas_program USING btree (_order);
CREATE INDEX IF NOT EXISTS chatas_program_parent_id_idx ON chatas_program USING btree (_parent_id);

DO $$ BEGIN
  CREATE TYPE enum_chatas_surroundings_category AS ENUM('place', 'trip');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS chatas_surroundings (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id character varying PRIMARY KEY,
  name character varying NOT NULL,
  note character varying,
  category enum_chatas_surroundings_category DEFAULT 'place',
  CONSTRAINT chatas_surroundings_parent_id_fk
    FOREIGN KEY (_parent_id) REFERENCES chatas(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chatas_surroundings_order_idx ON chatas_surroundings USING btree (_order);
CREATE INDEX IF NOT EXISTS chatas_surroundings_parent_id_idx ON chatas_surroundings USING btree (_parent_id);

CREATE TABLE IF NOT EXISTS chatas_contact_rules (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id character varying PRIMARY KEY,
  label character varying NOT NULL,
  value character varying NOT NULL,
  CONSTRAINT chatas_contact_rules_parent_id_fk
    FOREIGN KEY (_parent_id) REFERENCES chatas(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chatas_contact_rules_order_idx ON chatas_contact_rules USING btree (_order);
CREATE INDEX IF NOT EXISTS chatas_contact_rules_parent_id_idx ON chatas_contact_rules USING btree (_parent_id);

CREATE TABLE IF NOT EXISTS chatas_private_info (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id character varying PRIMARY KEY,
  label character varying NOT NULL,
  value character varying NOT NULL,
  CONSTRAINT chatas_private_info_parent_id_fk
    FOREIGN KEY (_parent_id) REFERENCES chatas(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chatas_private_info_order_idx ON chatas_private_info USING btree (_order);
CREATE INDEX IF NOT EXISTS chatas_private_info_parent_id_idx ON chatas_private_info USING btree (_parent_id);

CREATE TABLE IF NOT EXISTS chatas_public_transport_options_riders (
  _order integer NOT NULL,
  _parent_id character varying NOT NULL,
  id character varying PRIMARY KEY,
  participant_id integer NOT NULL,
  CONSTRAINT chatas_public_transport_options_riders_parent_id_fk
    FOREIGN KEY (_parent_id) REFERENCES chatas_public_transport_options(id) ON DELETE CASCADE,
  CONSTRAINT chatas_public_transport_options_riders_participant_id_fk
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS chatas_public_transport_options_riders_order_idx ON chatas_public_transport_options_riders USING btree (_order);
CREATE INDEX IF NOT EXISTS chatas_public_transport_options_riders_parent_id_idx ON chatas_public_transport_options_riders USING btree (_parent_id);
CREATE INDEX IF NOT EXISTS chatas_public_transport_options_riders_participant_idx ON chatas_public_transport_options_riders USING btree (participant_id);

-- "Výdaj za jiného plátce" (docs/PRD-vydaj-za-jineho.md): a participant may
-- record an expense somebody ELSE paid; it waits for the payer (if they have
-- an account) or the banker before it counts. Additive only — every existing
-- row is an admin-panel or own-payer expense, so the DEFAULT plus the
-- backfill below make them all 'approved'.
DO $$ BEGIN
  CREATE TYPE enum_expenses_approval_status AS ENUM('approved', 'pending', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS approval_status enum_expenses_approval_status DEFAULT 'approved';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_note character varying;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_decided_at timestamp(3) with time zone;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_decided_by_id integer;
DO $$ BEGIN
  ALTER TABLE expenses
    ADD CONSTRAINT expenses_approval_decided_by_id_users_id_fk
    FOREIGN KEY (approval_decided_by_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS expenses_approval_decided_by_idx
  ON expenses USING btree (approval_decided_by_id);

-- The paying participant's account: an expense recorded FOR somebody is
-- theirs to confirm, correct and delete, and the write-access filter cannot
-- join to work that out. Backfilled from the current payer links below.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payer_account_id integer;
DO $$ BEGIN
  ALTER TABLE expenses
    ADD CONSTRAINT expenses_payer_account_id_users_id_fk
    FOREIGN KEY (payer_account_id) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS expenses_payer_account_idx ON expenses USING btree (payer_account_id);

-- (the data backfill for both columns runs after the payer migration, in
-- backfillExpenseApproval() — expenses_rels is only populated by then)
`

async function enumLabels(typeName) {
  const res = await client.query(
    `SELECT e.enumlabel FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = $1
     ORDER BY e.enumsortorder`,
    [typeName]
  )
  return res.rows.map((r) => r.enumlabel)
}

// User accounts redesign ("uživatelé a role"): the users.role enum changes
// meaning. Legacy values: 'admin' = manages ALL chatas, 'user' = manages
// assigned chatas. New values: 'superadmin' = all chatas, 'admin' = assigned
// chatas, 'user' = frontend-only account linked to a participant.
//
// RENAME VALUE keeps every existing row's meaning intact and is idempotent
// via the label check ('superadmin' present = already migrated). It runs
// OUTSIDE the main transaction because the subsequent ADD VALUE + SET
// DEFAULT need the renames committed first (PostgreSQL refuses to use an
// enum value added in the same transaction).
async function migrateUserRoles() {
  if (!(await tableExists('users'))) return

  await client.query('BEGIN')
  // Serialize concurrent deploys racing on the rename
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('migrate-user-roles'))`)
  const labels = await enumLabels('enum_users_role')
  if (labels.length > 0 && !labels.includes('superadmin')) {
    await client.query(`ALTER TYPE enum_users_role RENAME VALUE 'admin' TO 'superadmin'`)
    await client.query(`ALTER TYPE enum_users_role RENAME VALUE 'user' TO 'admin'`)
    console.log('users.role: renamed admin → superadmin, user → admin (meanings preserved)')
  }
  await client.query('COMMIT')

  if (labels.length > 0) {
    // New frontend-only role; autocommit so it is usable right after
    await client.query(`ALTER TYPE enum_users_role ADD VALUE IF NOT EXISTS 'user'`)
    // The rename dragged the old column default along ('user' → 'admin');
    // point it back at the (new) 'user' value
    await client.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user'`)
  }

  // Legacy per-chata assignments lived on the chata (chatas.assignedUsers);
  // all access checks now use users.assignedChatas (users_rels) — copy the
  // rows over and drop the legacy table
  if (
    (await tableExists('chatas_assigned_users')) &&
    (await tableExists('users_rels')) &&
    (await columnExists('users_rels', 'chatas_id'))
  ) {
    await client.query('BEGIN')
    const res = await client.query(`
      INSERT INTO users_rels ("order", parent_id, path, chatas_id)
        SELECT 1, cau.user_id, 'assignedChatas', cau._parent_id
        FROM chatas_assigned_users cau
        WHERE NOT EXISTS (
          SELECT 1 FROM users_rels r
          WHERE r.parent_id = cau.user_id
            AND r.path = 'assignedChatas'
            AND r.chatas_id = cau._parent_id
        )`)
    await client.query('DROP TABLE chatas_assigned_users')
    await client.query('COMMIT')
    console.log(
      `assignedChatas: copied ${res.rowCount} legacy chata assignments, dropped chatas_assigned_users`
    )
  }
}

// Banker banking moves onto the banker participant. The chata used to carry
// its own `bankerAccountNumber`/`bankerIban` (both NOT NULL — a leftover from
// the JSON-config import), which made a new chata unsavable: the banker
// dropdown is empty until the chata exists, so its account could not be
// prefilled before the first save. Participants already carry
// accountNumber/iban and the frontend already preferred them, so the chata
// columns were a fallback only.
//
// Backfill copies each chata's values onto its banker participant wherever
// that participant's own field is empty, then drops the columns. Values are
// copied verbatim — deriving the missing half is the frontend's job
// (resolveBankAccount). Idempotent via the column check; a full copy of the
// old columns is kept in _migration.chata_banker_banking.
async function migrateBankerBanking() {
  if (!(await tableExists('chatas'))) return
  if (!(await columnExists('chatas', 'banker_account_number'))) return

  await client.query('BEGIN')
  // Serialize concurrent deploys racing on the drop
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('migrate-banker-banking'))`)
  // Re-check under the lock — a racing deploy may have finished meanwhile
  if (!(await columnExists('chatas', 'banker_account_number'))) {
    await client.query('ROLLBACK')
    return
  }

  // Safety copy outside the public schema, so Payload's dev push never
  // offers to delete it (same convention as _migration.payer_backup)
  await client.query('CREATE SCHEMA IF NOT EXISTS _migration')
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migration.chata_banker_banking (
      chata_id integer NOT NULL,
      slug text,
      banker_id integer,
      account_number text,
      iban text
    )`)
  await client.query(`
    INSERT INTO _migration.chata_banker_banking (chata_id, slug, banker_id, account_number, iban)
      SELECT c.id, c.slug, c.banker_id, c.banker_account_number, c.banker_iban
      FROM chatas c
      WHERE NOT EXISTS (
        SELECT 1 FROM _migration.chata_banker_banking b WHERE b.chata_id = c.id
      )`)

  const moved = await client.query(`
    UPDATE participants p
    SET account_number = COALESCE(NULLIF(p.account_number, ''), NULLIF(c.banker_account_number, '')),
        iban           = COALESCE(NULLIF(p.iban, ''),           NULLIF(c.banker_iban, ''))
    FROM chatas c
    WHERE c.banker_id = p.id
      AND (
        (COALESCE(p.account_number, '') = '' AND COALESCE(c.banker_account_number, '') <> '')
        OR (COALESCE(p.iban, '') = '' AND COALESCE(c.banker_iban, '') <> '')
      )`)

  // Banking info with nowhere to go: no banker set, so no participant owns
  // it. The backup table keeps it; the chata needs a banker with their own
  // account before settlements show a QR code again.
  const orphans = await client.query(`
    SELECT id, slug FROM chatas
    WHERE banker_id IS NULL
      AND (COALESCE(banker_account_number, '') <> '' OR COALESCE(banker_iban, '') <> '')`)

  await client.query('ALTER TABLE chatas DROP COLUMN banker_account_number')
  await client.query('ALTER TABLE chatas DROP COLUMN banker_iban')
  await client.query('COMMIT')

  console.log(
    `banker banking: copied onto ${moved.rowCount} banker participant(s), dropped chatas.banker_account_number/banker_iban`
  )
  if (orphans.rowCount > 0) {
    const list = orphans.rows.map((r) => r.slug || r.id).join(', ')
    console.warn(
      `banker banking: ${orphans.rowCount} chata(s) had an account but no banker — ` +
        `values kept in _migration.chata_banker_banking only: ${list}`
    )
  }
}

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
}

async function auto() {
  await migrateUserRoles()
  await migrateBankerBanking()

  await client.query('BEGIN')
  // Serialize concurrent release commands (e.g. two deploys racing)
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('migrate-payer-polymorphic'))`)

  const oldExpenses = await columnExists('expenses', 'payer_id')
  const oldPrepayments = await columnExists('prepayments', 'from_id')

  // Always ensure the new tables exist — on an already-migrated database
  // every statement is IF NOT EXISTS and does nothing
  await client.query(NEW_SCHEMA_DDL)

  if (!oldExpenses && !oldPrepayments) {
    // Steady state (every normal deploy): the payer refs are already in
    // expenses_rels, so the approval backfill can run right away
    await backfillExpenseApproval()
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

  await backfillExpenseApproval()

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
