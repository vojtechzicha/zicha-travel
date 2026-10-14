// "Pivo" — the chata's shared keg order from Benecentrum in Benešov
// (src/collections/KegItems.ts). Participants pick kegs from the shop's
// price list (src/lib/kegCatalog.ts) and the bar ("výčep"); the banker
// emails themselves a summary and orders by phone or email (the shop has no
// API).
// Pure rules and the payload shapes shared by the collection, the slug API
// and the UI.

import { KEG_CATALOG, type KegEntry, type KegKind } from './kegCatalog'
import type { OptOutView } from './listSplit'

/** Benecentrum Benešov, as the shop publishes it on bene.cz/kontakt. */
export const BEER_SHOP = {
  /** the PDF the keg catalog is copied from (src/lib/kegCatalog.ts) */
  priceListUrl: 'https://www.benecentrum.cz/cenik.pdf',
  name: 'Benecentrum',
  address: 'Nádražní 2142, 256 01 Benešov',
  /** the shop floor ("prodejna"); the office is +420 775 776 176 */
  phone: '+420 727 941 964',
  email: 'benesov@bene.cz',
  url: 'https://www.bene.cz/',
} as const

/**
 * The bar ("výčep"): a chiller with one or two taps, rented from Benecentrum
 * with the kegs. Its price list has no rentals, so these are the banker's
 * working figures, taken from a typical Prague rental's list (checked
 * 14. 10. 2026; VAT included, delivery left out): 300 Kč per calendar day
 * whatever the taps, 1 000 Kč for a Friday to Monday weekend. The UI calls
 * them a rough price.
 *
 * People ask for taps, not bars: the order's one bar item (TAP_CODE) counts
 * taps, and barPlan picks the bars that give that many taps for the least
 * money over the rental (tapRental), e.g. three taps = a two-tap bar and a
 * one-tap bar.
 */
export interface BarOption {
  taps: 1 | 2
  pricePerDay: number
  /** the whole Friday to Monday weekend */
  weekendPrice: number
}

export const BAR_OPTIONS: readonly BarOption[] = [
  { taps: 2, pricePerDay: 300, weekendPrice: 1000 },
  { taps: 1, pricePerDay: 300, weekendPrice: 1000 },
]

/** the weekend price covers Friday to Monday: four calendar days */
export const WEEKEND_RENTAL_DAYS = 4

/** The bar item's code; its quantity is the number of taps. */
export const TAP_CODE = 'VYCEP-KOHOUT'

/** What an item points at: a keg from the price list or the bar's taps. */
export interface BeerProduct {
  code: string
  name: string
  /** keg size; null for the bar */
  liters: number | null
  /** CZK per keg, or per bar and day for the bar (barPlan has the real cost) */
  price: number
  /** 'day': the bar, counted in taps */
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

const TAP_PRODUCT: BeerProduct = {
  code: TAP_CODE,
  name: 'Výčep',
  liters: null,
  price: Math.min(...BAR_OPTIONS.map((bar) => bar.pricePerDay)),
  unit: 'day',
  kind: 'equipment',
}

const byCode = new Map([
  ...KEG_CATALOG.map((keg) => [keg.code, kegProduct(keg)] as const),
  [TAP_CODE, TAP_PRODUCT] as const,
])

/** The catalog entry behind a code; null for anything the shop doesn't list. */
export function beerProduct(code: unknown): BeerProduct | null {
  if (typeof code !== 'string') return null
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

/** The chata fields the rental period reads. */
export interface TapRentalChata {
  beerClosedAt?: string | null
  beerClosedTapDays?: number | null
  beerClosedTapWeekend?: boolean | null
  beerTapDays?: number | null
  tripDateFrom?: string | null
  tripDateTo?: string | null
  tripDatesTentative?: boolean | null
  tripPlannedNights?: number | null
}

/**
 * How many days the bar is rented, counting every calendar day from pickup
 * to return. The chata's own `beerTapDays` when the banker set it (e.g. 4 for
 * Friday to Monday although the trip ends on Sunday), else the days of the
 * stay from arrival to departure, both included. At least one. A CLOSED order keeps the days it
 * was closed with (`beerClosedTapDays`), so editing the trip later can't
 * re-price a receipt whose Finance row is already written.
 */
export function tapRentalDays(chata: TapRentalChata): number {
  if (chata.beerClosedAt && chata.beerClosedTapDays && chata.beerClosedTapDays > 0) {
    return chata.beerClosedTapDays
  }
  if (chata.beerTapDays && chata.beerTapDays > 0) return Math.round(chata.beerTapDays)
  if (chata.tripDatesTentative) {
    return chata.tripPlannedNights && chata.tripPlannedNights > 0 ? chata.tripPlannedNights + 1 : 1
  }
  if (chata.tripDateFrom && chata.tripDateTo) {
    const ms = new Date(chata.tripDateTo).getTime() - new Date(chata.tripDateFrom).getTime()
    return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1)
  }
  return 1
}

/** The rental period every bar of the order shares. */
export interface TapRental {
  days: number
  /** picked up on a Friday and back by Monday: the weekend price applies */
  weekend: boolean
}

const isFridayInPrague = (date: string): boolean =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Prague' }).format(
    new Date(date),
  ) === 'Fri'

/**
 * The rental period: the days (tapRentalDays), and whether the weekend price
 * applies. It does when the bar is picked up on a Friday (the arrival day;
 * tentative dates have none) and comes back by Monday, i.e. at most four
 * calendar days. A closed order keeps both as they were when it closed.
 */
export function tapRental(chata: TapRentalChata): TapRental {
  const days = tapRentalDays(chata)
  if (chata.beerClosedAt && chata.beerClosedTapDays && chata.beerClosedTapDays > 0) {
    return { days, weekend: chata.beerClosedTapWeekend === true }
  }
  const weekend =
    days <= WEEKEND_RENTAL_DAYS &&
    !chata.tripDatesTentative &&
    Boolean(chata.tripDateFrom) &&
    isFridayInPrague(chata.tripDateFrom as string)
  return { days, weekend }
}

/** One bar for the whole rental: per day, or the weekend price if lower. */
export function barRentalCost(bar: BarOption, rental: TapRental): number {
  const byDay = bar.pricePerDay * Math.max(1, rental.days)
  return rental.weekend ? Math.min(byDay, bar.weekendPrice) : byDay
}

export interface BarPlan {
  /** two-tap bars first; empty for no taps */
  bars: { taps: 1 | 2; count: number }[]
  /** the bars together for the whole rental */
  cost: number
  barCount: number
}

/**
 * The cheapest bars giving at least `taps` taps for this rental. On a tie
 * fewer bars win, then fewer taps nobody asked for. With today's prices
 * that's as many two-tap bars as fit and a one-tap bar for an odd tap.
 */
export function barPlan(taps: number, rental: TapRental): BarPlan {
  const wanted = Math.max(0, Math.round(taps || 0))
  const two = BAR_OPTIONS.find((bar) => bar.taps === 2)!
  const one = BAR_OPTIONS.find((bar) => bar.taps === 1)!
  let best: (BarPlan & { spare: number }) | null = null
  for (let twos = 0; twos <= Math.ceil(wanted / 2); twos++) {
    const ones = Math.max(0, wanted - 2 * twos)
    const cost = twos * barRentalCost(two, rental) + ones * barRentalCost(one, rental)
    const barCount = twos + ones
    const spare = 2 * twos + ones - wanted
    if (
      !best ||
      cost < best.cost ||
      (cost === best.cost &&
        (barCount < best.barCount || (barCount === best.barCount && spare < best.spare)))
    ) {
      const bars: BarPlan['bars'] = []
      if (twos > 0) bars.push({ taps: 2, count: twos })
      if (ones > 0) bars.push({ taps: 1, count: ones })
      best = { bars, cost, barCount, spare }
    }
  }
  const { bars, cost, barCount } = best!
  return { bars, cost, barCount }
}

type CostedItem = { quantity: number; price: number; unit: 'keg' | 'day' }

const wholeQuantity = (item: { quantity: number }) => Math.max(1, Math.round(item.quantity || 1))

/** All taps the order asks for (the bar items' quantities). */
export function orderTaps(items: readonly { quantity: number; unit: 'keg' | 'day' }[]): number {
  return items.filter((item) => item.unit === 'day').reduce((sum, item) => sum + wholeQuantity(item), 0)
}

/**
 * What each item costs, in the items' order: kegs by the piece; the bars
 * are planned for the whole order's taps (barPlan) and their cost is shared
 * by the bar items in proportion to their taps.
 */
export function beerLineCosts(items: readonly CostedItem[], rental: TapRental): number[] {
  const taps = orderTaps(items)
  const barCost = taps > 0 ? barPlan(taps, rental).cost : 0
  return items.map((item) =>
    item.unit === 'day' ? (barCost * wholeQuantity(item)) / taps : item.price * wholeQuantity(item),
  )
}

export interface BeerTotals {
  /** CZK by the price list (the bar at its rough price) */
  total: number
  kegs: number
  /** the bars barPlan picked for the taps */
  bars: number
  taps: number
  liters: number
  /** half-litre glasses the kegs pour, rounded down */
  pints: number
}

export function beerTotals(
  items: readonly (CostedItem & { liters: number | null })[],
  rental: TapRental,
): BeerTotals {
  const total = beerLineCosts(items, rental).reduce((sum, cost) => sum + cost, 0)
  const taps = orderTaps(items)
  let kegs = 0
  let liters = 0
  for (const item of items) {
    if (item.unit !== 'keg') continue
    kegs += wholeQuantity(item)
    liters += (item.liters ?? 0) * wholeQuantity(item)
  }
  return {
    total: Math.round(total * 100) / 100,
    kegs,
    bars: taps > 0 ? barPlan(taps, rental).barCount : 0,
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
 * line with the quantities summed, kegs first (by name, then size), the
 * bar's taps last.
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
  orderer: {
    name: string | null
    isMe: boolean
    /** may send the summary and close or reopen: the banker or a chata admin */
    canManage: boolean
  }
  /** when the last order summary went out */
  summarySentAt: string | null
  /** the order changed since that summary (adds, edits and deletes) */
  summaryChanged: boolean
  /** rental days for every bar (tapRental) */
  tapDays: number
  /** the weekend price applies to the bars (tapRental) */
  tapWeekend: boolean
  /** the banker closed the order: everything stays readable, nothing changes */
  closedAt: string | null
  /** who doesn't chip in for what ("tohle nechci", src/lib/listSplit.ts) */
  optOuts: OptOutView
}
