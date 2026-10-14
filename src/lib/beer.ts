// "Pivo" — the chata's shared keg order from Max pivotéka in Benešov
// (src/collections/KegItems.ts). Participants pick kegs from the shop's
// price list (src/lib/kegCatalog.ts) and the tap rental; the banker emails
// themselves a summary and orders by phone or email (the shop has no API).
// Pure rules and the payload shapes shared by the collection, the slug API
// and the UI.

import { KEG_CATALOG, type KegEntry, type KegKind } from './kegCatalog'

/** Max pivotéka's contacts, as the shop publishes them on maxpivoteka.cz. */
export const BEER_SHOP = {
  name: 'Max pivotéka',
  address: 'Červené Vršky 2086, Benešov',
  /** the shop manager; the site gives this number for rentals and delivery */
  phone: '+420 731 179 453',
  email: 'obchod@maxpivoteka.cz',
  url: 'https://maxpivoteka.cz/',
} as const

/**
 * The tap ("výčepní zařízení s kohoutem"). The shop publishes no rental
 * prices; 250 Kč a day is the banker's working figure until they agree the
 * real one with the shop, so the UI calls it a rough price.
 */
export const TAP_RENTAL = {
  code: 'VYCEP-KOHOUT',
  name: 'Výčepní zařízení s kohoutem',
  pricePerDay: 250,
} as const

/** What an item points at: a keg from the price list or the tap rental. */
export interface BeerProduct {
  code: string
  name: string
  /** keg size; null for the tap */
  liters: number | null
  /** CZK per keg, or per day for the tap */
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

export type KegGroup = 'all' | 'draught' | 'special' | 'nonalcoholic'

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * The picker's filter: every word of the query must appear in the name
 * (accents ignored, so "plzen" finds "Plzeň"), the size must match when one
 * is chosen. Groups follow the shop's two lists, except "nealko", which
 * collects alcohol-free beer and soft drinks from both.
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
    if (group === 'nonalcoholic' && keg.kind !== 'nonalcoholic' && keg.kind !== 'soft') return false
    if ((group === 'draught' || group === 'special') && keg.list !== group) return false
    const name = fold(keg.name)
    return words.every((word) => name.includes(word))
  })
}

/** CZK per litre, rounded to whole crowns, for comparing kegs of different sizes. */
export function pricePerLiter(keg: { price: number; liters: number | null }): number | null {
  return keg.liters ? Math.round(keg.price / keg.liters) : null
}

/** Rental days to suggest for the tap: every calendar day of the stay. */
export function defaultRentalDays(nights: number | null | undefined): number {
  return Math.max(1, Math.round(nights ?? 0) + 1)
}

export interface BeerTotals {
  /** CZK by the price list (the tap at its rough price) */
  total: number
  kegs: number
  liters: number
  /** half-litre glasses the kegs pour, rounded down */
  pints: number
}

export function beerTotals(
  items: { quantity: number; price: number; liters: number | null; unit: 'keg' | 'day' }[],
): BeerTotals {
  let total = 0
  let kegs = 0
  let liters = 0
  for (const item of items) {
    const quantity = Math.max(1, Math.round(item.quantity || 1))
    total += item.price * quantity
    if (item.unit === 'keg') {
      kegs += quantity
      liters += (item.liters ?? 0) * quantity
    }
  }
  return { total: Math.round(total * 100) / 100, kegs, liters, pints: Math.floor(liters * 2) }
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
}
