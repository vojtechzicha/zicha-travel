// "Pivo" — the chata's shared keg order from Benecentrum in Benešov
// (src/collections/KegItems.ts). Participants pick kegs from the shop's
// price list (src/lib/kegCatalog.ts) and the taps; the banker emails
// themselves a summary and orders by phone or email (the shop has no API).
// Pure rules and the payload shapes shared by the collection, the slug API
// and the UI.

import { KEG_CATALOG, type KegEntry, type KegKind } from './kegCatalog'
import type { OptOutView } from './listSplit'

/** Benecentrum Benešov, as the shop publishes it on bene.cz/kontakt. */
export const BEER_SHOP = {
  name: 'Benecentrum',
  address: 'Nádražní 2142, 256 01 Benešov',
  /** the shop floor ("prodejna"); the office is +420 775 776 176 */
  phone: '+420 727 941 964',
  email: 'benesov@bene.cz',
  url: 'https://www.bene.cz/',
} as const

/**
 * A tap ("výčepní kohout"). An item's quantity is the number of taps; the
 * rental days are the same for every tap and come from the chata
 * (tapRentalDays). The price list has no taps; 250 Kč per tap and day is the
 * banker's working figure until they agree the real one, so the UI calls it
 * a rough price.
 */
export const TAP_RENTAL = {
  code: 'VYCEP-KOHOUT',
  name: 'Výčepní kohout',
  pricePerDay: 250,
} as const

/** What an item points at: a keg from the price list or the tap rental. */
export interface BeerProduct {
  code: string
  name: string
  /** keg size; null for the tap */
  liters: number | null
  /** CZK per keg, or per tap and day for the tap */
  price: number
  unit: 'keg' | 'day'
  kind: KegKind | 'equipment'
}

const kegProduct = (keg: KegEntry): BeerProduct => ({
  code: keg.code,
  name: keg.name,
  liters: keg.liters,
  price: keg.price,
  unit: 'keg',
  kind: keg.kind,
})

const byCode = new Map(KEG_CATALOG.map((keg) => [keg.code, kegProduct(keg)]))

/** The catalog entry behind a code; null for anything the shop doesn't list. */
export function beerProduct(code: unknown): BeerProduct | null {
  if (typeof code !== 'string') return null
  if (code === TAP_RENTAL.code) {
    return {
      code: TAP_RENTAL.code,
      name: TAP_RENTAL.name,
      liters: null,
      price: TAP_RENTAL.pricePerDay,
      unit: 'day',
      kind: 'equipment',
    }
  }
  return byCode.get(code) ?? null
}

export type KegGroup = 'all' | 'beer' | 'nonalcoholic' | 'other'

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * The picker's filter: every word of the query must appear in the name
 * (accents ignored, so "kozel" finds "Velkopopovický Kozel"), the size must
 * match when one is chosen. Groups: beer, alcohol-free beer and soft drinks
 * ("nealko a limo"), and everything else (wine, spritz, cider).
 */
export function filterKegs(
  catalog: readonly KegEntry[],
  filter: { query?: string; liters?: number | null; group?: KegGroup },
): KegEntry[] {
  const words = fold(filter.query ?? '')
    .split(/\s+/)
    .filter(Boolean)
  const group = filter.group ?? 'all'
  return catalog.filter((keg) => {
    if (filter.liters && keg.liters !== filter.liters) return false
    if (group === 'beer' && keg.kind !== 'beer') return false
    if (group === 'nonalcoholic' && keg.kind !== 'nonalcoholic' && keg.kind !== 'soft') return false
    if (group === 'other' && keg.kind !== 'wine' && keg.kind !== 'cider') return false
    const name = fold(keg.name)
    return words.every((word) => name.includes(word))
  })
}

/** CZK per litre, rounded to whole crowns, for comparing kegs of different sizes. */
export function pricePerLiter(keg: { price: number; liters: number | null }): number | null {
  return keg.liters ? Math.round(keg.price / keg.liters) : null
}

/**
 * How many days the taps are rented: the chata's own `beerTapDays` when the
 * banker set it (e.g. Friday to Tuesday although the trip ends on Sunday),
 * else the nights of the stay (picked up on arrival, returned on departure).
 * At least one.
 */
export function tapRentalDays(chata: {
  beerTapDays?: number | null
  tripDateFrom?: string | null
  tripDateTo?: string | null
  tripDatesTentative?: boolean | null
  tripPlannedNights?: number | null
}): number {
  if (chata.beerTapDays && chata.beerTapDays > 0) return Math.round(chata.beerTapDays)
  let nights = 0
  if (chata.tripDatesTentative) nights = chata.tripPlannedNights ?? 0
  else if (chata.tripDateFrom && chata.tripDateTo) {
    const ms = new Date(chata.tripDateTo).getTime() - new Date(chata.tripDateFrom).getTime()
    nights = Math.round(ms / (24 * 60 * 60 * 1000))
  }
  return Math.max(1, nights)
}

/** What a line costs: kegs by the piece, taps by the piece and day. */
export function lineCost(
  item: { quantity: number; price: number; unit: 'keg' | 'day' },
  tapDays: number,
): number {
  const quantity = Math.max(1, Math.round(item.quantity || 1))
  return item.price * quantity * (item.unit === 'day' ? Math.max(1, tapDays) : 1)
}

export interface BeerTotals {
  /** CZK by the price list (the taps at their rough price) */
  total: number
  kegs: number
  taps: number
  liters: number
  /** half-litre glasses the kegs pour, rounded down */
  pints: number
}

export function beerTotals(
  items: { quantity: number; price: number; liters: number | null; unit: 'keg' | 'day' }[],
  tapDays: number,
): BeerTotals {
  let total = 0
  let kegs = 0
  let taps = 0
  let liters = 0
  for (const item of items) {
    const quantity = Math.max(1, Math.round(item.quantity || 1))
    total += lineCost(item, tapDays)
    if (item.unit === 'keg') {
      kegs += quantity
      liters += (item.liters ?? 0) * quantity
    } else {
      taps += quantity
    }
  }
  return {
    total: Math.round(total * 100) / 100,
    kegs,
    taps,
    liters,
    pints: Math.floor(liters * 2),
  }
}

export interface OrderLine {
  code: string
  name: string
  liters: number | null
  price: number
  unit: 'keg' | 'day'
  quantity: number
  /** who asked for it, in the order they did */
  wantedBy: string[]
  notes: string[]
}

/**
 * The order as the shop should hear it: the same product merged into one
 * line with the quantities summed, kegs first (by name, then size), the tap
 * last.
 */
export function mergeOrderLines(
  items: {
    code: string
    name: string
    liters: number | null
    price: number
    unit: 'keg' | 'day'
    quantity: number
    wantedBy: string | null
    note: string | null
  }[],
): OrderLine[] {
  const lines = new Map<string, OrderLine>()
  for (const item of items) {
    const quantity = Math.max(1, Math.round(item.quantity || 1))
    let line = lines.get(item.code)
    if (!line) {
      line = {
        code: item.code,
        name: item.name,
        liters: item.liters,
        price: item.price,
        unit: item.unit,
        quantity: 0,
        wantedBy: [],
        notes: [],
      }
      lines.set(item.code, line)
    }
    line.quantity += quantity
    if (item.wantedBy && !line.wantedBy.includes(item.wantedBy)) line.wantedBy.push(item.wantedBy)
    if (item.note) line.notes.push(item.note)
  }
  return [...lines.values()].sort((a, b) => {
    if (a.unit !== b.unit) return a.unit === 'keg' ? -1 : 1
    return a.name.localeCompare(b.name, 'cs') || (a.liters ?? 0) - (b.liters ?? 0)
  })
}

/**
 * A fingerprint of the order as it stands: every item with its product and
 * quantity. The summary endpoint stores it on the chata; any later add,
 * change or delete gives a different one, so the tab can say the emailed
 * summary is out of date (a deleted item leaves no row to compare).
 */
export function orderSignature(
  items: { id: number | string; code: string; quantity: number }[],
): string {
  return items
    .map((item) => `${item.id}:${item.code}:${item.quantity}`)
    .sort()
    .join(',')
}

export interface BeerItemView {
  id: number
  code: string
  name: string
  liters: number | null
  price: number
  unit: 'keg' | 'day'
  kind: KegKind | 'equipment'
  quantity: number
  note: string | null
  participantId: number | null
  participantName: string | null
  /** the viewer authored it */
  mine: boolean
  /** the viewer may change or remove it */
  canEdit: boolean
  /** the quantity the last order summary carried; null = not in one yet */
  summaryQuantity: number | null
}

export interface BeerPayload {
  items: BeerItemView[]
  /** the viewer owns a participant of this chata, or administers it */
  canAdd: boolean
  ownParticipants: { id: number; name: string }[]
  /** the banker orders: they get the summary email */
  orderer: { name: string | null; isMe: boolean }
  /** when the last order summary went out */
  summarySentAt: string | null
  /** the order changed since that summary (adds, edits and deletes) */
  summaryChanged: boolean
  /** rental days for every tap (tapRentalDays) */
  tapDays: number
  /** the banker closed the order: everything stays readable, nothing changes */
  closedAt: string | null
  /** who doesn't chip in for what ("tohle nechci", src/lib/listSplit.ts) */
  optOuts: OptOutView
}
