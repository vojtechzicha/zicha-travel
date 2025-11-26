#!/bin/bash
set -e

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
PGPASSWORD=payload psql -h localhost -p 5433 -U payload -d postgres -c "DROP DATABASE IF EXISTS payload;"
PGPASSWORD=payload psql -h localhost -p 5433 -U payload -d postgres -c "CREATE DATABASE payload;"

# 2. Dump from production and restore to local using Docker (to match PostgreSQL version)
echo ""
echo "Dumping production database and restoring to local..."
docker run --rm --network host postgres:17-alpine \
    sh -c "PGPASSWORD='$DB_PASS' pg_dump -h '$DB_HOST' -p '$DB_PORT' -U '$DB_USER' -d '$DB_NAME' --no-owner --no-acl" \
    | PGPASSWORD=payload psql -h localhost -p 5433 -U payload -d payload

echo "Database migration complete!"

# 3. Sync media files from Fly.io
echo ""
echo "Syncing media files from Fly.io..."

# Clear local media folder
rm -rf media/*

# Get list of files from Fly.io and download each one
echo "Fetching file list from Fly.io..."
FILES=$(fly ssh console -a split-expanses -C "ls /app/media" 2>/dev/null || echo "")

if [ -z "$FILES" ]; then
    echo "No media files found on Fly.io or couldn't connect."
else
    for FILE in $FILES; do
        # Skip system directories
        if [ "$FILE" = "lost+found" ]; then
            continue
        fi
        echo "  Downloading: $FILE"
        fly ssh sftp get -a split-expanses "/app/media/$FILE" "media/$FILE" 2>/dev/null || echo "    Failed to download $FILE"
    done
fi

echo ""
echo "Media sync complete!"
echo "Migration from production finished successfully!"
