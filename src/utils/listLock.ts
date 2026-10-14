import { sql } from '@payloadcms/db-postgres/drizzle'
import type { PayloadRequest } from 'payload'

// One advisory lock per chata and shared list ("Nákup" / "Pivo"), held until
// the request's transaction ends. Item writes, opt-outs and closing all take
// it, so a close never snapshots items while a write is half-way through.

type DbSession = { execute?: (query: unknown) => Promise<unknown> } | undefined

export async function lockList(
  req: PayloadRequest,
  chataId: number | string,
  list: 'shopping' | 'beer',
): Promise<void> {
  const tid = await req.transactionID
  if (tid == null) return
  const session = (req.payload.db as unknown as { sessions?: Record<string, { db?: DbSession }> })
    .sessions?.[String(tid)]?.db
  if (session?.execute) {
    await session.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`list:${chataId}:${list}`}))`)
  }
}
