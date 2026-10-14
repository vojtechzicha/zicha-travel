import { describe, it, expect } from 'vitest'
import {
  TAP_RENTAL,
  beerProduct,
  beerTotals,
  lineCost,
  tapRentalDays,
  filterKegs,
  mergeOrderLines,
  pricePerLiter,
} from '@/lib/beer'
import { KEG_CATALOG } from '@/lib/kegCatalog'
import {
  buildKegOrderEmail,
  daysCs,
  kegOrderEmail,
  kegOrderFingerprint,
  kegsCs,
  orderLineText,
} from '@/lib/kegOrderEmail'

describe('KEG_CATALOG', () => {
  it('has unique codes, real prices and only the four keg sizes', () => {
    const codes = KEG_CATALOG.map((keg) => keg.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const keg of KEG_CATALOG) {
      expect([15, 20, 30, 50]).toContain(keg.liters)
      expect(keg.price).toBeGreaterThan(100)
      expect(keg.name).not.toMatch(/\bkeg\b|\d+\s*l\b/i)
    }
  })
})

describe('beerProduct', () => {
  it('resolves a keg from the price list', () => {
    expect(beerProduct('BENE-VELKOPOPOVICKY-KOZEL-11-30')).toEqual({
      code: 'BENE-VELKOPOPOVICKY-KOZEL-11-30',
      name: 'Velkopopovický Kozel 11°',
      liters: 30,
      price: 1246,
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
    const found = filterKegs(KEG_CATALOG, { query: 'PILSNER 12' })
    expect(found.map((keg) => keg.code).sort()).toEqual([
      'BENE-PILSNER-URQUELL-12-15',
      'BENE-PILSNER-URQUELL-12-30',
      'BENE-PILSNER-URQUELL-12-50',
    ])
    // accents don't matter: "kozel" finds "Velkopopovický Kozel"
    expect(filterKegs(KEG_CATALOG, { query: 'velkopopovicky kozel' }).length).toBe(5)
  })

  it('filters by size', () => {
    const found = filterKegs(KEG_CATALOG, { query: 'kozel 11', liters: 50 })
    expect(found.map((keg) => keg.code)).toEqual(['BENE-VELKOPOPOVICKY-KOZEL-11-50'])
  })

  it('collects alcohol-free beer and soft drinks, Kofola included', () => {
    const found = filterKegs(KEG_CATALOG, { group: 'nonalcoholic' })
    expect(found.every((keg) => keg.kind === 'nonalcoholic' || keg.kind === 'soft')).toBe(true)
    expect(found.map((keg) => keg.name)).toContain('Kofola')
  })

  it('keeps beer and the rest apart', () => {
    expect(filterKegs(KEG_CATALOG, { group: 'beer' }).every((k) => k.kind === 'beer')).toBe(true)
    const other = filterKegs(KEG_CATALOG, { group: 'other' })
    expect(other.length).toBeGreaterThan(0)
    expect(other.every((k) => k.kind === 'wine' || k.kind === 'cider')).toBe(true)
  })
})

describe('pricePerLiter, tapRentalDays and lineCost', () => {
  it('rounds the price per litre', () => {
    expect(pricePerLiter({ price: 1230, liters: 30 })).toBe(41)
    expect(pricePerLiter({ price: 250, liters: null })).toBeNull()
  })

  it("rents taps for the chata's own days, else for the nights of the stay", () => {
    const weekend = {
      tripDateFrom: '2026-11-13T12:00:00.000Z',
      tripDateTo: '2026-11-15T12:00:00.000Z',
    }
    expect(tapRentalDays(weekend)).toBe(2)
    // Friday to Tuesday although the trip ends on Sunday
    expect(tapRentalDays({ ...weekend, beerTapDays: 4 })).toBe(4)
    expect(tapRentalDays({ tripDatesTentative: true, tripPlannedNights: 3 })).toBe(3)
    expect(tapRentalDays({})).toBe(1)
  })

  it('prices kegs by the piece and taps by the piece and day', () => {
    expect(lineCost({ quantity: 2, price: 1230, unit: 'keg' }, 4)).toBe(2460)
    expect(lineCost({ quantity: 2, price: 250, unit: 'day' }, 4)).toBe(2000)
  })
})

describe('beerTotals', () => {
  it('adds kegs, litres and glasses; the tap counts money only', () => {
    expect(
      beerTotals(
        [
          { quantity: 2, price: 1230, liters: 30, unit: 'keg' },
          { quantity: 1, price: 659, liters: 15, unit: 'keg' },
          { quantity: 2, price: 250, liters: null, unit: 'day' },
        ],
        4,
      ),
    ).toEqual({ total: 5119, kegs: 3, taps: 2, liters: 75, pints: 150 })
  })

  it('is zero for an empty order', () => {
    expect(beerTotals([], 4)).toEqual({ total: 0, kegs: 0, taps: 0, liters: 0, pints: 0 })
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
      item('BENE-VELKOPOPOVICKY-KOZEL-11-30', 1, 'Martin'),
      item('BENE-VELKOPOPOVICKY-KOZEL-11-30', 2, 'Vojta', 'na sobotu'),
      item('BENE-VELKOPOPOVICKY-KOZEL-11-30', 1, 'Martin'),
      item('BENE-BIRELL-15', 1, 'Daniela'),
    ])
    expect(lines.map((line) => [line.code, line.quantity])).toEqual([
      ['BENE-BIRELL-15', 1],
      ['BENE-VELKOPOPOVICKY-KOZEL-11-30', 4],
      [TAP_RENTAL.code, 3],
    ])
    expect(lines[1].wantedBy).toEqual(['Martin', 'Vojta'])
    expect(lines[1].notes).toEqual(['na sobotu'])
  })
})

describe('kegOrderEmail', () => {
  const lines = mergeOrderLines([
    {
      ...beerProduct('BENE-VELKOPOPOVICKY-KOZEL-11-30')!,
      quantity: 2,
      wantedBy: 'Martin',
      note: null,
    },
    { ...beerProduct(TAP_RENTAL.code)!, quantity: 2, wantedBy: null, note: null },
  ])

  it('writes the order line the shop needs, with the code', () => {
    // Intl separates thousands and the currency with no-break spaces
    expect(orderLineText(lines[0], 4).replace(/\s/g, ' ')).toBe(
      '2× Velkopopovický Kozel 11°, sud 30 l, 1 246 Kč za sud',
    )
    expect(orderLineText(lines[1], 4)).toBe('2× Výčepní kohout na 4 dny')
  })

  it('carries the order, the place, the totals and who wants what', () => {
    const email = kegOrderEmail({
      chataName: 'Přátelé',
      lines,
      tapDays: 4,
      place: 'Chata Oáza, Vavřetice',
      arrival: 'pátek 13. 11. 2026, od 16:00',
      listUrl: 'https://pratele.zicha.travel?view=beer',
    })
    expect(email.subject).toBe('Přátelé: objednávka piva do Benecentra')
    expect(email.text).toContain('Na chatu: Chata Oáza, Vavřetice.')
    expect(email.text).toContain('Celkem 2 sudy, 60 l.')
    // 2 taps × 4 days × 250 Kč
    expect(email.text.replace(/\s/g, ' ')).toContain('z toho kohouty 2 000 Kč')
    expect(email.text).toContain('Velkopopovický Kozel 11° 30 l: Martin')
    expect(email.text).not.toMatch(/[—–]/)
    expect(email.html).toContain('benesov@bene.cz')
  })

  it('escapes what participants typed', () => {
    const email = kegOrderEmail({
      chataName: 'X',
      tapDays: 2,
      lines: mergeOrderLines([
        {
          ...beerProduct('BENE-VELKOPOPOVICKY-KOZEL-11-30')!,
          quantity: 1,
          wantedBy: '<b>Eve</b>',
          note: null,
        },
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

describe('kegOrderFingerprint', () => {
  const chata = {
    name: 'Přátelé',
    slug: 'pratele',
    destinationName: 'Chata Oáza',
    tripDateFrom: '2026-11-13T12:00:00.000Z',
    tripDateTo: '2026-11-15T12:00:00.000Z',
    beerTapDays: 4,
  }
  const people = [
    { id: 1, name: 'Vojta' },
    { id: 2, name: 'Martin' },
  ]
  const items = [
    { ...beerProduct('BENE-KOFOLA-50')!, quantity: 1, participant: 1, note: null as string | null },
    { ...beerProduct(TAP_RENTAL.code)!, quantity: 1, participant: 2, note: null as string | null },
  ]
  const print = (c = chata, i = items, p = people) =>
    kegOrderFingerprint(buildKegOrderEmail(c, i, p))

  it('is stable for the same order', () => {
    expect(print()).toBe(print())
  })

  it('changes with anything the email shows', () => {
    const base = print()
    expect(print(chata, [{ ...items[0], note: 'na sobotu' }, items[1]])).not.toBe(base)
    expect(print(chata, [{ ...items[0], participant: 2 }, items[1]])).not.toBe(base)
    expect(print({ ...chata, beerTapDays: 2 })).not.toBe(base)
    expect(print({ ...chata, destinationName: 'Jinde' })).not.toBe(base)
    expect(print(chata, items, [{ id: 1, name: 'Vojtěch' }, people[1]])).not.toBe(base)
    expect(print(chata, [items[0]])).not.toBe(base)
  })
})
