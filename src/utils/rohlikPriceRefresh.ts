import type { Payload, PayloadRequest } from 'payload'
import { refId } from '@/lib/access'
import { productDetailsBatch } from '@/lib/rohlik/mcp'
import { refreshedRohlik, type StoredRohlik } from '@/lib/shopping'
import { bankerAccountId, getAccessToken } from './rohlikConnection'
import { lockList } from './listLock'

// Keeps the "Nákup" prices current: an item stores the price from the
// moment it was added, so the receipt's estimate drifts as Rohlík changes
// prices. Run right before "Poslat do košíku" (rohlikEndpoints) and once a
// day for every active list (GET /api/rohlik-prices, Vercel cron). Uses the
// banker's connection and sends Rohlík only product ids.

export interface PriceRefreshSummary {
  checked: number
  changed: number
}

/** Re-check every Rohlík item of one chata with the given token. */
export async function refreshChataPrices(
  payload: Payload,
  chataId: number | string,
  token: string,
  now: Date = new Date(),
  /** the send's transaction (it holds the list's lock); none = own writes */
  req?: PayloadRequest,
): Promise<PriceRefreshSummary> {
  const { docs } = await payload.find({
    req,
    collection: 'shopping-items',
    where: { and: [{ chata: { equals: chataId } }, { 'rohlik.productId': { exists: true } }] },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  const items = docs.filter((item) => item.rohlik?.productId)
  if (items.length === 0) return { checked: 0, changed: 0 }

  const fresh = await productDetailsBatch(
    token,
    items.map((item) => String(item.rohlik!.productId)),
  )
  let changed = 0
  for (const item of items) {
    const next = refreshedRohlik(
      item.rohlik as StoredRohlik,
      fresh.get(String(item.rohlik!.productId)),
      now,
    )
    if (next.changed) changed += 1
    // no user on the request: the collection hook leaves server-set
    // product details alone (only REST bodies are re-verified) and skips
    // its title sync, so the title rides along here
    await payload.update({
      req,
      collection: 'shopping-items',
      id: item.id,
      data: next.title ? { rohlik: next.rohlik, title: next.title } : { rohlik: next.rohlik },
      depth: 0,
      overrideAccess: true,
    })
  }
  return { checked: items.length, changed }
}

/** The daily pass: every chata with a live list and a connected banker. */
export async function refreshAllPrices(
  payload: Payload,
  now: Date = new Date(),
): Promise<{ chatas: number; skipped: number } & PriceRefreshSummary> {
  const { docs: chatas } = await payload.find({
    collection: 'chatas',
    where: {
      and: [{ shoppingListEnabled: { equals: true } }, { planningEnabled: { not_equals: true } }],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    context: { triggerAfterRead: false },
  })
  const summary = { chatas: 0, skipped: 0, checked: 0, changed: 0 }
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000
  for (const chata of chatas) {
    // a finished trip's list is history, and a closed one is ordered: leave
    // their prices as they were
    const end = chata.tripDateTo ?? chata.tripDateFrom
    if (end && new Date(end).getTime() < dayAgo) continue
    if (chata.shoppingClosedAt) continue
    const bankerAccount = await bankerAccountId(payload, chata.id)
    const token = bankerAccount ? await getAccessToken(payload, bankerAccount) : null
    if (!token) {
      summary.skipped += 1
      continue
    }
    // under the list's lock, re-checking the close stamp there: a close
    // that lands while Rohlík answers must not get its receipt changed later
    const tid = await payload.db.beginTransaction()
    const req = { transactionID: tid ?? undefined, payload } as unknown as PayloadRequest
    try {
      await lockList(req, chata.id, 'shopping')
      const current = await payload.findByID({
        req,
        collection: 'chatas',
        id: chata.id,
        depth: 0,
        overrideAccess: true,
        context: { triggerAfterRead: false },
      })
      if (current.shoppingClosedAt) {
        if (tid != null) await payload.db.commitTransaction(tid)
        continue
      }
      const result = await refreshChataPrices(payload, chata.id, token, now, req)
      if (tid != null) await payload.db.commitTransaction(tid)
      summary.chatas += 1
      summary.checked += result.checked
      summary.changed += result.changed
    } catch (err) {
      if (tid != null) await payload.db.rollbackTransaction(tid).catch(() => undefined)
      summary.skipped += 1
      payload.logger.error({ err, chata: refId(chata.id) }, 'Rohlík price refresh failed')
    }
  }
  return summary
}
