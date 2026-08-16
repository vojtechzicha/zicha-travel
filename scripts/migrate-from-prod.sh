#!/bin/bash
set -e

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

# Load production DATABASE_URI from .env
source .env

# Parse the DATABASE_URI to extract components
# Format: postgresql://user:password@host:port/database
# The password may contain @ so we need to handle it carefully
PROD_DB_URI="$DATABASE_URI"

# Extract user (everything after :// and before the first :)
DB_USER=$(echo "$PROD_DB_URI" | sed -E 's|postgresql://([^:]+):.*|\1|')

# Extract host:port/database (everything after the last @)
HOST_PORT_DB=$(echo "$PROD_DB_URI" | sed -E 's|.*@([^@]+)$|\1|')

# Extract password (everything between user: and @host)
# This handles passwords containing @
DB_PASS=$(echo "$PROD_DB_URI" | sed -E "s|postgresql://${DB_USER}:(.*)@${HOST_PORT_DB}|\1|")

# Extract host
DB_HOST=$(echo "$HOST_PORT_DB" | sed -E 's|([^:]+):.*|\1|')

# Extract port
DB_PORT=$(echo "$HOST_PORT_DB" | sed -E 's|[^:]+:([0-9]+)/.*|\1|')

# Extract database name
DB_NAME=$(echo "$HOST_PORT_DB" | sed -E 's|.*/(.+)$|\1|')

echo "Connecting to production database..."
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"

# 1. Reset local database
echo ""
echo "Resetting local database..."
docker compose exec -T postgres psql -U payload -d postgres -c "DROP DATABASE IF EXISTS payload;"
docker compose exec -T postgres psql -U payload -d postgres -c "CREATE DATABASE payload;"

# 2. Dump from production and restore to local using Docker (to match PostgreSQL version)
echo ""
echo "Dumping production database and restoring to local..."
docker run --rm --network host postgres:17-alpine \
    sh -c "PGPASSWORD='$DB_PASS' pg_dump -h '$DB_HOST' -p '$DB_PORT' -U '$DB_USER' -d '$DB_NAME' --no-owner --no-acl" \
    | docker compose exec -T postgres psql -U payload -d payload

echo "Database migration complete!"

# 3. Anonymize the local copy (default). Scrambles direct identifiers while
# keeping ids, amounts and structure, so the app behaves identically.
# Expense titles stay as-is (they drive the journal UI); that residual is
# recorded in docs/legal/zaznamy-o-zpracovani.md.
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
