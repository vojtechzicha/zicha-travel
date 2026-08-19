import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { isSuperadmin } from '@/lib/access'
import { runRetention } from '@/utils/retention'

/**
 * GET /api/retention
 *
 * Daily retention job (compliance blocker 5) — executes the privacy
 * policy's section 9 table: bank details and receipts 12 months after a
 * chata's explicit "settled on" date, dormant accounts after 2 years,
 * decided claim requests after 12 months, plus lock housekeeping.
 * Authorized like the claim reminder cron: Vercel cron sends
 * `Authorization: Bearer CRON_SECRET`; a signed-in superadmin may also
 * trigger it by hand.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config })
  const secret = process.env.CRON_SECRET
  const { user } = await payload.auth({ headers: request.headers }).catch(() => ({ user: null }))
  const authorized =
    (secret && request.headers.get('authorization') === `Bearer ${secret}`) || isSuperadmin(user)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const summary = await runRetention(payload)
    return NextResponse.json({ ok: true, ...summary })
  } catch (err) {
    payload.logger.error({ err }, 'Retention run failed')
    return NextResponse.json({ error: 'Retention run failed' }, { status: 500 })
  }
}
