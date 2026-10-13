import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { isSuperadmin } from '@/lib/access'
import { refreshAllPrices } from '@/utils/rohlikPriceRefresh'

/**
 * GET /api/rohlik-prices
 *
 * Daily "Nákup" price check: every chata with a live shopping list and a
 * connected banker gets its Rohlík items' prices, sizes and stock refreshed
 * (src/utils/rohlikPriceRefresh.ts). Authorized like the retention cron:
 * Vercel sends `Authorization: Bearer CRON_SECRET`; a signed-in superadmin
 * may trigger it by hand.
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
    return NextResponse.json({ ok: true, ...(await refreshAllPrices(payload)) })
  } catch (err) {
    payload.logger.error({ err }, 'Rohlík price refresh run failed')
    return NextResponse.json({ error: 'Price refresh failed' }, { status: 500 })
  }
}
