#!/bin/bash
set -e
# Without pipefail, a failing pg_dump on the left of the restore pipe is
# invisible: psql happily consumes the empty stream, the script reports success,
# and the local database is left wiped instead of refreshed.
set -o pipefail

# Copies the production database into local Docker PostgreSQL.
#
# ANONYMIZED BY DEFAULT (compliance item 12): names, emails, bank details,
# login tokens and claim/rights texts are scrambled after the restore, and
# receipt files are not downloaded — real personal data has no business on
# a developer machine. Pass --keep-real-data to skip the anonymization for
# a production-debugging session; the justification and handling rule for
# that mode are recorded in docs/legal/zaznamy-o-zpracovani.md (use it only
# when a bug genuinely needs real data, delete the copy when done).
ANONYMIZE=1
for ARG in "$@"; do
    case "$ARG" in
        --keep-real-data) ANONYMIZE=0 ;;
    esac
done

# Start local PostgreSQL if not already running (matching dev script behavior)
WAS_RUNNING=$(docker compose ps -q postgres 2>/dev/null)
docker compose up -d postgres
if [ -z "$WAS_RUNNING" ]; then
    trap 'docker compose down' EXIT
fi

# Resolve the PRODUCTION database URI.
#
# It is deliberately NOT taken from DATABASE_URI: since the .env/.env.prod
# split, DATABASE_URI is the LOCAL database, and reading it here would have
# this script dump localhost onto itself. Order of preference:
#   1. PROD_DATABASE_URI exported for this run
#   2. PROD_DATABASE_URI / PROD_SITE_URL filled in .env (the template declares
#      both) — read via dotenv, NOT `source`-d: sourcing a generated file
#      executes any $(…) or backtick that lands inside a generated secret
#   3. 1Password, resolved on demand so prod credentials never sit on disk
read_dotenv_var() {
    node -e "require('dotenv').config({ path: '.env' }); process.stdout.write(process.env[process.argv[1]] || '')" "$1"
}
if [ -z "$PROD_DATABASE_URI" ] && [ -f .env ]; then
    PROD_DATABASE_URI=$(read_dotenv_var PROD_DATABASE_URI)
fi
if [ -z "$PROD_SITE_URL" ] && [ -f .env ]; then
    PROD_SITE_URL=$(read_dotenv_var PROD_SITE_URL)
fi
if [ -z "$PROD_DATABASE_URI" ]; then
    if ! command -v op >/dev/null 2>&1; then
        echo "ERROR: PROD_DATABASE_URI is not set and the 1Password CLI (op) is not installed." >&2
        echo "       Install op, or export PROD_DATABASE_URI=postgresql://... for this run." >&2
        exit 1
    fi
    echo "Reading the production database URI from 1Password..."
    PROD_DATABASE_URI=$(op read "op://Development/zicha-travel-prod/DATABASE_URI") || {
        echo "ERROR: could not read op://Development/zicha-travel-prod/DATABASE_URI (run 'op signin' first)." >&2
        exit 1
    }
fi

# The URI goes to pg_dump whole. It used to be taken apart with sed and fed
# back as PGPASSWORD plus flags, which fails on any password containing
# percent-encoding: libpq decodes %XX inside a URI, but PGPASSWORD is taken
# literally, so the encoded form reaches the server and authentication fails.
# The Supabase password does contain percent-encoding.
#
# The values below are only echoed, never used to connect. Pure parameter
# expansion, no regexes: a pattern that failed to match (e.g. the equally
# valid postgres:// scheme, or a portless URI) would fall through and echo
# the WHOLE URI, password included.
USER_PASS="${PROD_DATABASE_URI#*://}"       # user:pass@host:port/db
USER_PASS="${USER_PASS%%@*}"                # user:pass
HOST_PORT_DB="${PROD_DATABASE_URI##*@}"     # host:port/db — never holds the password
HOST_PORT="${HOST_PORT_DB%%/*}"             # host:port (or just host)
DB_NAME="${HOST_PORT_DB#*/}"
DB_NAME="${DB_NAME%%\?*}"                   # drop ?sslmode=… and friends

echo "Connecting to production database..."
echo "  Host: ${HOST_PORT%%:*}"
case "$HOST_PORT" in
    *:*) echo "  Port: ${HOST_PORT##*:}" ;;
    *)   echo "  Port: 5432 (default)" ;;
esac
echo "  User: ${USER_PASS%%:*}"
echo "  Database: $DB_NAME"

# 1. Reset local database
echo ""
echo "Resetting local database..."
docker compose exec -T postgres psql -U payload -d postgres -c "DROP DATABASE IF EXISTS payload;"
docker compose exec -T postgres psql -U payload -d postgres -c "CREATE DATABASE payload;"

# 2. Dump from production and restore to local using Docker (to match PostgreSQL version)
#
# The URI is handed over as an environment variable rather than on the command
# line, where it would be readable by every other process on the machine.
echo ""
echo "Dumping production database and restoring to local..."
# psql keeps going after a failing statement and still exits 0, so a partial
# restore would look identical to a full one. Capture its stderr and fail on
# any ERROR other than the known-benign version skew (the PG17 pg_dump emits
# SETs like transaction_timeout that the local PG16 doesn't recognize).
# No EXIT trap here: the top of the script may already own it for
# `docker compose down`, and a second trap would replace the first.
PSQL_LOG=$(mktemp)
# --exclude-schema=vault: Supabase Vault secrets must never land on a dev
# machine. The exclusion doesn't cover the CREATE EXTENSION supabase_vault
# statement itself (extensions aren't schema-scoped for pg_dump), so its
# failure against the plain postgres image is filtered as benign below.
docker run --rm --network host -e PROD_URI="$PROD_DATABASE_URI" postgres:17-alpine \
    sh -c 'pg_dump "$PROD_URI" --no-owner --no-acl --exclude-schema=vault' \
    | docker compose exec -T postgres psql -U payload -d payload 2>"$PSQL_LOG"
# No `grep -q` in a pipe here: under pipefail its early exit can SIGPIPE the
# producer and flip the pipeline status even when a real error WAS found.
REAL_ERRORS=$(grep '^ERROR' "$PSQL_LOG" \
    | grep -vE 'unrecognized configuration parameter|supabase_vault|relation "vault\.' || true)
if [ -n "$REAL_ERRORS" ]; then
    echo "ERROR: the restore hit failing statements — the local database is incomplete:" >&2
    grep '^ERROR' "$PSQL_LOG" >&2
    rm -f "$PSQL_LOG"
    exit 1
fi
rm -f "$PSQL_LOG"

# A restore that silently produced nothing is worse than a failed one: the
# local database would look fine and be empty.
RESTORED_TABLES=$(docker compose exec -T postgres psql -U payload -d payload -tAc \
    "select count(*) from information_schema.tables where table_schema='public'")
RESTORED_TABLES="${RESTORED_TABLES//[!0-9]/}"
# The explicit empty check matters: [ "" -lt 1 ] is a test(1) error, which an
# `if` treats as FALSE — the guard would pass vacuously on garbage output.
if [ -z "$RESTORED_TABLES" ] || [ "$RESTORED_TABLES" -lt 1 ]; then
    echo "ERROR: the restore left the local database empty." >&2
    exit 1
fi

echo "Database migration complete! ($RESTORED_TABLES tables)"

# Drop the S3-plugin-only column the prod schema carries: local dev runs disk
# storage (S3_ENDPOINT unset), so Payload's dev push would otherwise stop on a
# "delete prefix column" data-loss prompt after every prod sync.
docker compose exec -T postgres psql -U payload -d payload \
    -c "ALTER TABLE expense_attachments DROP COLUMN IF EXISTS prefix;"

# 3. Anonymize the local copy (default). Scrambles direct identifiers while
# keeping ids, amounts and structure, so the app behaves identically.
# Expense titles and prepayment notes stay as-is (they drive the journal
# UI); that residual is recorded in docs/legal/zaznamy-o-zpracovani.md.
if [ "$ANONYMIZE" = "1" ]; then
    echo ""
    echo "Anonymizing local copy (pass --keep-real-data to skip)..."
    docker compose exec -T postgres psql -U payload -d payload <<'SQL'
UPDATE participants SET
  name = 'Účastník ' || id,
  akuzativ = NULL,
  vokativ = NULL,
  account_number = CASE WHEN account_number IS NULL THEN NULL ELSE '000000/0100' END,
  iban = CASE WHEN iban IS NULL THEN NULL ELSE 'CZ0001000000000000000000' END;
UPDATE users SET
  email = 'user' || id || '@example.test',
  name = CASE WHEN name IS NULL THEN NULL ELSE 'Uživatel ' || id END,
  vokativ = NULL,
  login_token = NULL,
  login_token_expires = NULL;
UPDATE joint_accounts SET name = 'Společný účet ' || id;
UPDATE claim_requests SET reason = NULL;
UPDATE data_requests SET subject = 'Subjekt ' || id, note = NULL;
-- "Klíče a Wi-Fi": the one deliberately non-public piece of chata data
-- (passwords, key locations) — secrets have no debugging value locally.
UPDATE chatas_private_info SET value = 'skryto';
-- Free-text note on "výdaj za jiného plátce" — may talk about real people.
UPDATE expenses SET approval_note = NULL;
SQL
    echo "Anonymization done."
else
    echo ""
    echo "WARNING: --keep-real-data — the local copy holds real names, emails"
    echo "and bank details. Use it only for the debugging task at hand and"
    echo "delete it afterwards (docs/legal/zaznamy-o-zpracovani.md)."
fi

# 4. Sync uploaded files from production over public HTTP into the local
# disk-storage folders (media/, expense-attachments/) that Payload uses
# when S3_ENDPOINT is unset. Receipts require authentication since the
# compliance work and are skipped in anonymized mode anyway — they ARE
# personal data.
SITE_URL="${PROD_SITE_URL:-https://zicha.travel}"

COLLECTIONS="media"
if [ "$ANONYMIZE" = "0" ]; then
    COLLECTIONS="media expense-attachments"
    echo ""
    echo "Note: expense-attachments listing/files require authentication now;"
    echo "the receipt sync below may fail unless run with a session cookie."
fi

for COLLECTION in $COLLECTIONS; do
    echo ""
    echo "Syncing $COLLECTION files from $SITE_URL..."
    rm -rf "$COLLECTION"
    mkdir -p "$COLLECTION"

    node --input-type=module -e '
      const [base, slug] = process.argv.slice(1)
      for (let page = 1, totalPages = 1; page <= totalPages; page++) {
        const data = await fetch(`${base}/api/${slug}?limit=100&page=${page}&depth=0`).then((r) => {
          if (!r.ok) throw new Error(`${base}/api/${slug} -> HTTP ${r.status}`)
          return r.json()
        })
        totalPages = data.totalPages
        for (const doc of data.docs) console.log(doc.filename)
      }
    ' "$SITE_URL" "$COLLECTION" | while IFS= read -r FILE; do
        echo "  Downloading: $FILE"
        curl -fsS --globoff "$SITE_URL/api/$COLLECTION/file/$FILE" -o "$COLLECTION/$FILE" \
            || echo "    Failed to download $FILE"
    done
done

echo ""
echo "File sync complete!"
echo "Migration from production finished successfully!"
