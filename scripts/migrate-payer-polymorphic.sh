#!/bin/bash
set -e

# One-time data migration for the "společný účet" (joint account) feature.
#
# Expenses.payer and Prepayments.from changed from a single-collection
# relationship (stored as expenses.payer_id / prepayments.from_id columns)
# to a polymorphic relationship (stored as rows in expenses_rels /
# prepayments_rels). Payload's schema push DROPS the old columns, so the
# values must be backed up BEFORE the new schema is applied and restored
# into the rels tables AFTER.
#
# Procedure (rehearse locally with `pnpm migrate-from-prod` first):
#   1. ./scripts/migrate-payer-polymorphic.sh backup    # BEFORE schema update
#   2. apply the new schema (deploy / `pnpm dev` schema push)
#   3. ./scripts/migrate-payer-polymorphic.sh restore   # AFTER schema update
#   4. verify the app, then: ./scripts/migrate-payer-polymorphic.sh cleanup
#
# Uses DATABASE_URI from the environment or .env (same as migrate-from-prod).

COMMAND="$1"

if [ -z "$DATABASE_URI" ] && [ -f .env ]; then
  source .env
fi

if [ -z "$DATABASE_URI" ]; then
  echo "ERROR: DATABASE_URI is not set (export it or provide .env)" >&2
  exit 1
fi

case "$COMMAND" in
  backup)
    echo "Backing up payer/from references..."
    psql "$DATABASE_URI" <<'SQL'
BEGIN;
CREATE TABLE IF NOT EXISTS _migration_payer_backup (
  collection text NOT NULL,
  parent_id integer NOT NULL,
  participant_id integer NOT NULL
);
INSERT INTO _migration_payer_backup (collection, parent_id, participant_id)
  SELECT 'expenses', e.id, e.payer_id
  FROM expenses e
  WHERE e.payer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM _migration_payer_backup b
      WHERE b.collection = 'expenses' AND b.parent_id = e.id
    );
INSERT INTO _migration_payer_backup (collection, parent_id, participant_id)
  SELECT 'prepayments', p.id, p.from_id
  FROM prepayments p
  WHERE p.from_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM _migration_payer_backup b
      WHERE b.collection = 'prepayments' AND b.parent_id = p.id
    );
COMMIT;
SELECT collection, count(*) FROM _migration_payer_backup GROUP BY collection;
SQL
    echo "Backup complete (table _migration_payer_backup). Now apply the new schema, then run: $0 restore"
    ;;

  restore)
    echo "Restoring payer/from references into the polymorphic rels tables..."
    psql "$DATABASE_URI" <<'SQL'
BEGIN;
INSERT INTO expenses_rels ("order", parent_id, path, participants_id)
  SELECT 1, b.parent_id, 'payer', b.participant_id
  FROM _migration_payer_backup b
  WHERE b.collection = 'expenses'
    AND EXISTS (SELECT 1 FROM expenses e WHERE e.id = b.parent_id)
    AND NOT EXISTS (
      SELECT 1 FROM expenses_rels r
      WHERE r.parent_id = b.parent_id AND r.path = 'payer'
    );
INSERT INTO prepayments_rels ("order", parent_id, path, participants_id)
  SELECT 1, b.parent_id, 'from', b.participant_id
  FROM _migration_payer_backup b
  WHERE b.collection = 'prepayments'
    AND EXISTS (SELECT 1 FROM prepayments p WHERE p.id = b.parent_id)
    AND NOT EXISTS (
      SELECT 1 FROM prepayments_rels r
      WHERE r.parent_id = b.parent_id AND r.path = 'from'
    );
COMMIT;
-- Verification: every backed-up reference must exist in the rels tables
SELECT
  (SELECT count(*) FROM _migration_payer_backup WHERE collection = 'expenses')    AS expenses_backed_up,
  (SELECT count(*) FROM expenses_rels WHERE path = 'payer')                        AS expenses_restored,
  (SELECT count(*) FROM _migration_payer_backup WHERE collection = 'prepayments') AS prepayments_backed_up,
  (SELECT count(*) FROM prepayments_rels WHERE path = 'from')                      AS prepayments_restored;
SQL
    echo "Restore complete. Verify counts above match, test the app, then run: $0 cleanup"
    ;;

  cleanup)
    psql "$DATABASE_URI" -c 'DROP TABLE IF EXISTS _migration_payer_backup;'
    echo "Backup table dropped."
    ;;

  *)
    echo "Usage: $0 backup|restore|cleanup" >&2
    exit 1
    ;;
esac
