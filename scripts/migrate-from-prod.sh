#!/bin/bash
set -e

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

# 3. Sync uploaded files from production over public HTTP (files are
# publicly readable by URL, like all data here). Downloads into the local
# disk-storage folders (media/, expense-attachments/) that Payload uses
# when S3_ENDPOINT is unset.
SITE_URL="${PROD_SITE_URL:-https://zicha.travel}"

for COLLECTION in media expense-attachments; do
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
