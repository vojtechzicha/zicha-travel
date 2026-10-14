// "Nákup" — the chata's shared shopping list, ordered through Rohlík by the
// banker (src/collections/ShoppingItems.ts, Rohlík wiring in
// src/collections/ShoppingItems/rohlikEndpoints.ts). Pure rules and the
// payload shapes shared by the collection, the slug API and the UI.

/** A Rohlík product as the search endpoint returns it and an item stores it. */
export interface RohlikProduct {
  productId: string
  name: string
  /** CZK per piece; null when Rohlík didn't say */
  price: number | null
  /** package size as Rohlík prints it, e.g. "500 g" */
  amount: string | null
  imageUrl: string | null
  url: string | null
  /** search results only: false = sold out right now */
  inStock?: boolean | null
}

export interface ShoppingItemView {
  id: number
  title: string
  quantity: number
  note: string | null
  participantId: number | null
  participantName: string | null
  /** the viewer authored it */
  mine: boolean
  /** the viewer may change or remove it */
  canEdit: boolean
  rohlik: RohlikProduct | null
  sentToCartAt: string | null
  sentQuantity: number | null
}

export interface ShoppingPayload {
  items: ShoppingItemView[]
  /** the viewer owns a participant of this chata, or administers it */
  canAdd: boolean
  ownParticipants: { id: number; name: string }[]
  /** the banker orders: whether their Rohlík account is connected */
  shopper: { name: string | null; connected: boolean; isMe: boolean }
  /** the banker closed the list: everything stays readable, nothing changes */
  closedAt: string | null
}

/**
 * Who may change or delete an item: its author, the banker (they place the
 * order, so they tidy the list) and chata admins. Everybody else only reads.
 */
export function canEditShoppingItem(args: {
  viewerId: number | string | null | undefined
  authoredBy: number | string | null | undefined
  isChataAdmin: boolean
  isBanker: boolean
}): boolean {
  if (args.viewerId == null) return false
  if (args.isChataAdmin || args.isBanker) return true
  return args.authoredBy != null && String(args.authoredBy) === String(args.viewerId)
}

export interface CartLine {
  productId: string
  quantity: number
  /** item titles merged into this line, for the send report */
  titles: string[]
}

/**
 * The lines the banker's cart receives: items linked to a Rohlík product,
 * the same product merged into one line with the quantities summed.
 * Free-text items (no product) are left for the banker to add by hand.
 */
export function mergeCartLines(
  items: { title: string; quantity: number; rohlik?: { productId?: string | null } | null }[],
): CartLine[] {
  const lines = new Map<string, CartLine>()
  for (const item of items) {
    const productId = item.rohlik?.productId
    if (!productId) continue
    const quantity = Math.max(1, Math.round(item.quantity || 1))
    const line = lines.get(productId)
    if (line) {
      line.quantity += quantity
      line.titles.push(item.title)
    } else {
      lines.set(productId, { productId, quantity, titles: [item.title] })
    }
  }
  return [...lines.values()]
}

/**
 * Where a pending item goes on "Poslat do košíku": a Rohlík product into
 * the cart, unless the check just before the send found it sold out;
 * sold-out products and free-text items land on the "přidej ručně"
 * checklist email instead. When that check failed, a stored "sold out" may
 * be stale, so every product tries the cart and Rohlík decides.
 */
export type SendRoute = 'cart' | 'soldOut' | 'text'

export function sendRoute(
  rohlik: { productId?: string | null; inStock?: boolean | null } | null | undefined,
  stockChecked: boolean,
): SendRoute {
  if (!rohlik?.productId) return 'text'
  return stockChecked && rohlik.inStock === false ? 'soldOut' : 'cart'
}

export interface StoredRohlik {
  productId?: string | null
  name?: string | null
  price?: number | null
  amount?: string | null
  inStock?: boolean | null
  checkedAt?: string | null
  [key: string]: unknown
}

/**
 * An item's Rohlík fields after a price check: current price, size and
 * stock from Rohlík (a product Rohlík no longer lists counts as sold out),
 * image and link kept, `checkedAt` stamped. `changed` says whether anything
 * a viewer sees moved, for the run's summary.
 */
export function refreshedRohlik(
  stored: StoredRohlik,
  fresh: RohlikProduct | undefined,
  now: Date,
): { rohlik: StoredRohlik; title: string | null; changed: boolean } {
  const next: StoredRohlik = fresh
    ? {
        ...stored,
        name: fresh.name || stored.name,
        price: fresh.price ?? stored.price ?? null,
        amount: fresh.amount ?? stored.amount ?? null,
        inStock: fresh.inStock ?? null,
      }
    : { ...stored, inStock: false }
  next.checkedAt = now.toISOString()
  const changed =
    next.price !== (stored.price ?? null) ||
    next.amount !== (stored.amount ?? null) ||
    next.name !== stored.name ||
    (next.inStock ?? null) !== (stored.inStock ?? null)
  // a product item is named after the product (the collection hook's rule),
  // so a renamed product renames the item too
  const title = typeof next.name === 'string' && next.name.trim() !== '' ? next.name : null
  return { rohlik: next, title, changed }
}

/** Rough total from Rohlík prices; items without a price are skipped and counted. */
export function estimatedTotal(
  items: { quantity: number; rohlik?: { price?: number | null } | null }[],
): { total: number; unpriced: number } {
  let total = 0
  let unpriced = 0
  for (const item of items) {
    const price = item.rohlik?.price
    if (typeof price === 'number' && Number.isFinite(price)) {
      total += price * Math.max(1, item.quantity || 1)
    } else {
      unpriced += 1
    }
  }
  return { total: Math.round(total * 100) / 100, unpriced }
}
