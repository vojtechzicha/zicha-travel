import { describe, it, expect } from 'vitest'
import {
  TAP_RENTAL,
  beerProduct,
  beerTotals,
  defaultRentalDays,
  filterKegs,
  mergeOrderLines,
  pricePerLiter,
} from '@/lib/beer'
import { KEG_CATALOG } from '@/lib/kegCatalog'
import { daysCs, kegOrderEmail, kegsCs, orderLineText } from '@/lib/kegOrderEmail'

describe('KEG_CATALOG', () => {
  it('has unique codes, real prices and only the four keg sizes', () => {
    const codes = KEG_CATALOG.map((keg) => keg.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const keg of KEG_CATALOG) {
      expect([15, 20, 30, 50]).toContain(keg.liters)
      // the 1 Kč placeholder row stays out
      expect(keg.price).toBeGreaterThan(100)
      expect(keg.name).not.toMatch(/\bkeg\b|\d+\s*l\b/i)
    }
  })
})

describe('beerProduct', () => {
  it('resolves a keg from the price list', () => {
    expect(beerProduct('PIV311KOZ')).toEqual({
      code: 'PIV311KOZ',
      name: 'Kozel 11°',
      liters: 30,
      price: 1230,
      unit: 'keg',
      kind: 'beer',
    })
  })

  it('resolves the tap, priced per day', () => {
    expect(beerProduct(TAP_RENTAL.code)).toMatchObject({ unit: 'day', price: 250, liters: null })
  })

  it('refuses anything the shop does not list', () => {
    expect(beerProduct('NOPE')).toBeNull()
    expect(beerProduct(42)).toBeNull()
    expect(beerProduct(undefined)).toBeNull()
  })
})

describe('filterKegs', () => {
  it('ignores accents and case and needs every word', () => {
    const found = filterKegs(KEG_CATALOG, { query: 'PLZEN 12' })
    expect(found.map((keg) => keg.code).sort()).toEqual(['PIV023PLZ', 'PIV024PLZ', 'PIV025PLZ'])
  })

  it('filters by size', () => {
    const found = filterKegs(KEG_CATALOG, { query: 'kozel 11', liters: 50 })
    expect(found.map((keg) => keg.code)).toEqual(['PIV312KOZ'])
  })

  it('collects alcohol-free beer and soft drinks from both lists', () => {
    const found = filterKegs(KEG_CATALOG, { group: 'nonalcoholic' })
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((keg) => keg.kind === 'nonalcoholic' || keg.kind === 'soft')).toBe(true)
    expect(found.some((keg) => keg.list === 'special')).toBe(true)
  })

  it('follows the shop lists for classics and specials', () => {
    expect(filterKegs(KEG_CATALOG, { group: 'special' }).every((k) => k.list === 'special')).toBe(
      true,
    )
  })
})

describe('pricePerLiter and defaultRentalDays', () => {
  it('rounds the price per litre', () => {
    expect(pricePerLiter({ price: 1230, liters: 30 })).toBe(41)
    expect(pricePerLiter({ price: 250, liters: null })).toBeNull()
  })

  it('suggests every calendar day of the stay, at least one', () => {
    expect(defaultRentalDays(2)).toBe(3)
    expect(defaultRentalDays(0)).toBe(1)
    expect(defaultRentalDays(null)).toBe(1)
  })
})

describe('beerTotals', () => {
  it('adds kegs, litres and glasses; the tap counts money only', () => {
    expect(
      beerTotals([
        { quantity: 2, price: 1230, liters: 30, unit: 'keg' },
        { quantity: 1, price: 659, liters: 15, unit: 'keg' },
        { quantity: 3, price: 250, liters: null, unit: 'day' },
      ]),
    ).toEqual({ total: 3869, kegs: 3, liters: 75, pints: 150 })
  })

  it('is zero for an empty order', () => {
    expect(beerTotals([])).toEqual({ total: 0, kegs: 0, liters: 0, pints: 0 })
  })
})

describe('mergeOrderLines', () => {
  const item = (
    code: string,
    quantity: number,
    wantedBy: string | null,
    note: string | null = null,
  ) => ({
    ...beerProduct(code)!,
    quantity,
    wantedBy,
    note,
  })

  it('merges the same keg, keeps who wants it, puts the tap last', () => {
    const lines = mergeOrderLines([
      item(TAP_RENTAL.code, 3, 'Vojta'),
      item('PIV311KOZ', 1, 'Martin'),
      item('PIV311KOZ', 2, 'Vojta', 'na sobotu'),
      item('PIV311KOZ', 1, 'Martin'),
      item('KEG001BIR', 1, 'Daniela'),
    ])
    expect(lines.map((line) => [line.code, line.quantity])).toEqual([
      ['KEG001BIR', 1],
      ['PIV311KOZ', 4],
      [TAP_RENTAL.code, 3],
    ])
    expect(lines[1].wantedBy).toEqual(['Martin', 'Vojta'])
    expect(lines[1].notes).toEqual(['na sobotu'])
  })
})

describe('kegOrderEmail', () => {
  const lines = mergeOrderLines([
    { ...beerProduct('PIV311KOZ')!, quantity: 2, wantedBy: 'Martin', note: null },
    { ...beerProduct(TAP_RENTAL.code)!, quantity: 3, wantedBy: null, note: null },
  ])

  it('writes the order line the shop needs, with the code', () => {
    // Intl separates thousands and the currency with no-break spaces
    expect(orderLineText(lines[0]).replace(/\s/g, ' ')).toBe(
      '2× Kozel 11°, sud 30 l (kód PIV311KOZ), 1 230 Kč za sud',
    )
    expect(orderLineText(lines[1])).toBe('Výčepní zařízení s kohoutem na 3 dny')
  })

  it('carries the order, the place, the totals and who wants what', () => {
    const email = kegOrderEmail({
      chataName: 'Přátelé',
      lines,
      place: 'Chata Oáza, Vavřetice',
      arrival: 'pátek 13. 11. 2026, od 16:00',
      listUrl: 'https://pratele.zicha.travel?view=beer',
    })
    expect(email.subject).toBe('Přátelé: objednávka piva do Max pivotéky')
    expect(email.text).toContain('Na chatu: Chata Oáza, Vavřetice.')
    expect(email.text).toContain('Celkem 2 sudy, 60 l.')
    expect(email.text).toContain('Kozel 11° 30 l: Martin')
    expect(email.text).not.toMatch(/[—–]/)
    expect(email.html).toContain('obchod@maxpivoteka.cz')
  })

  it('escapes what participants typed', () => {
    const email = kegOrderEmail({
      chataName: 'X',
      lines: mergeOrderLines([
        { ...beerProduct('PIV311KOZ')!, quantity: 1, wantedBy: '<b>Eve</b>', note: null },
      ]),
      place: null,
      arrival: null,
      listUrl: 'https://example.test',
    })
    expect(email.html).not.toContain('<b>Eve</b>')
    expect(email.html).toContain('&lt;b&gt;Eve&lt;/b&gt;')
  })

  it('declines sudy and dny in Czech', () => {
    expect([kegsCs(1), kegsCs(3), kegsCs(5)]).toEqual(['1 sud', '3 sudy', '5 sudů'])
    expect([daysCs(1), daysCs(2), daysCs(5)]).toEqual(['1 den', '2 dny', '5 dní'])
  })
})
