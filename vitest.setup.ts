// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'

// Tests must NEVER touch the production database — .env carries the
// production DATABASE_URI, and Payload's schema push would run there.
// Pin to the local docker-compose instance (pnpm db) unless a test DB is
// explicitly provided.
process.env.DATABASE_URI =
  process.env.TEST_DATABASE_URI || 'postgres://payload:payload@localhost:5433/payload'

// Tests must also not depend on .env being readable (it may be missing or
// hold production secrets) — any non-empty secret works for a local run.
process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || 'vitest-secret'
