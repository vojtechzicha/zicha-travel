import { describe, it, expect } from 'vitest'
import {
  BAR_OPTIONS,
  TAP_CODE,
  barPlan,
  beerLineCosts,
  beerProduct,
  beerTotals,
  barRentalCost,
  tapRental,
  weekendPriced,
  tapRentalDays,
  filterKegs,
  mergeOrderLines,
  pricePerLiter,
} from '@/lib/beer'
import { KEG_CATALOG } from '@/lib/kegCatalog'
import {
  barPlanCs,
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

  it('resolves the bar, counted in taps at 300 Kč per bar and day', () => {
    expect(TAP_CODE).toBe('VYCEP-KOHOUT')
    expect(beerProduct(TAP_CODE)).toMatchObject({
      name: 'Výčep',
      unit: 'day',
      price: 300,
      liters: null,
    })
    expect(BAR_OPTIONS.map((bar) => bar.taps)).toEqual([2, 1])
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

describe('pricePerLiter, tapRental and the bar plan', () => {
  it('rounds the price per litre', () => {
    expect(pricePerLiter({ price: 1230, liters: 30 })).toBe(41)
    expect(pricePerLiter({ price: 250, liters: null })).toBeNull()
  })

  // Friday 13 to Sunday 15 November 2026
  const weekend = {
    tripDateFrom: '2026-11-13T12:00:00.000Z',
    tripDateTo: '2026-11-15T12:00:00.000Z',
  }

  it("rents for the chata's own days, else every calendar day of the stay", () => {
    expect(tapRentalDays(weekend)).toBe(3)
    // Friday to Monday although the trip ends on Sunday
    expect(tapRentalDays({ ...weekend, beerTapDays: 4 })).toBe(4)
    expect(tapRentalDays({ tripDatesTentative: true, tripPlannedNights: 3 })).toBe(4)
    expect(tapRentalDays({ tripDatesTentative: true })).toBe(1)
    expect(tapRentalDays({})).toBe(1)
    // a closed order keeps the days it was closed with
    expect(
      tapRentalDays({
        ...weekend,
        beerTapDays: 2,
        beerClosedAt: '2026-11-10',
        beerClosedTapDays: 4,
      }),
    ).toBe(4)
    expect(tapRentalDays({ ...weekend, beerTapDays: 2, beerClosedTapDays: 4 })).toBe(2)
  })

  it('gives the weekend price from a Friday arrival up to Monday', () => {
    expect(tapRental(weekend)).toEqual({ days: 3, weekend: true })
    expect(tapRental({ ...weekend, beerTapDays: 4 })).toEqual({ days: 4, weekend: true })
    // Friday to Tuesday is past the weekend
    expect(tapRental({ ...weekend, beerTapDays: 5 })).toEqual({ days: 5, weekend: false })
    // a Saturday arrival
    expect(
      tapRental({ tripDateFrom: '2026-11-14T12:00:00.000Z', tripDateTo: '2026-11-15T12:00:00.000Z' }),
    ).toEqual({ days: 2, weekend: false })
    // tentative dates have no arrival day yet
    expect(
      tapRental({ ...weekend, tripDatesTentative: true, tripPlannedNights: 2 }).weekend,
    ).toBe(false)
  })

  it('keeps the weekend price a closed order was priced with', () => {
    const closed = { ...weekend, beerClosedAt: '2026-11-10', beerClosedTapDays: 4 }
    expect(tapRental({ ...closed, beerClosedTapWeekend: true })).toEqual({ days: 4, weekend: true })
    // moving the trip after closing changes nothing
    expect(
      tapRental({ ...closed, beerClosedTapWeekend: false, tripDateFrom: '2026-11-13T12:00:00.000Z' }),
    ).toEqual({ days: 4, weekend: false })
  })

  it('charges a bar per day, capped at 1 000 Kč for the weekend', () => {
    const bar = BAR_OPTIONS[0]
    expect(barRentalCost(bar, { days: 4, weekend: false })).toBe(1200)
    expect(barRentalCost(bar, { days: 4, weekend: true })).toBe(1000)
    expect(barRentalCost(bar, { days: 3, weekend: true })).toBe(900)
    expect(barRentalCost(bar, { days: 2, weekend: true })).toBe(600)
  })

  it('labels the weekend price only where the cap made it cheaper', () => {
    expect(weekendPriced({ days: 4, weekend: true })).toBe(true)
    // Friday to Sunday: 3 × 300 Kč is below the cap
    expect(weekendPriced({ days: 3, weekend: true })).toBe(false)
    expect(weekendPriced({ days: 4, weekend: false })).toBe(false)
  })

  it('plans the fewest bars for the taps asked for', () => {
    const rental = { days: 5, weekend: false }
    expect(barPlan(0, rental)).toEqual({ bars: [], cost: 0, barCount: 0 })
    expect(barPlan(1, rental)).toEqual({ bars: [{ taps: 1, count: 1 }], cost: 1500, barCount: 1 })
    expect(barPlan(2, rental)).toEqual({ bars: [{ taps: 2, count: 1 }], cost: 1500, barCount: 1 })
    expect(barPlan(3, rental)).toEqual({
      bars: [
        { taps: 2, count: 1 },
        { taps: 1, count: 1 },
      ],
      cost: 3000,
      barCount: 2,
    })
    expect(barPlan(4, rental).bars).toEqual([{ taps: 2, count: 2 }])
    expect(barPlan(5, { days: 4, weekend: true })).toMatchObject({ cost: 3000, barCount: 3 })
  })

  it('prices kegs by the piece and shares the bar plan among the bar items by taps', () => {
    const rental = { days: 4, weekend: true }
    expect(
      beerLineCosts(
        [
          { quantity: 2, price: 1230, unit: 'keg' },
          { quantity: 1, price: 300, unit: 'day' },
          { quantity: 1, price: 300, unit: 'day' },
        ],
        rental,
      ),
    ).toEqual([2460, 500, 500])
    // the stored price of an old row doesn't matter, the plan does
    expect(beerLineCosts([{ quantity: 3, price: 250, unit: 'day' }], rental)).toEqual([2000])
  })

  it('keeps the old price per tap and day for an order closed before bars', () => {
    const legacy = tapRental({
      beerClosedAt: '2026-10-01',
      beerClosedTapDays: 4,
      beerClosedTapWeekend: null,
    })
    expect(legacy).toEqual({ days: 4, weekend: false, perTap: true })
    expect(
      beerLineCosts(
        [
          { quantity: 2, price: 250, unit: 'day' },
          { quantity: 1, price: 1230, unit: 'keg' },
        ],
        legacy,
      ),
    ).toEqual([2000, 1230])
  })
})

describe('beerTotals', () => {
  it('adds kegs, litres and glasses; the taps add their bars', () => {
    expect(
      beerTotals(
        [
          { quantity: 2, price: 1230, liters: 30, unit: 'keg' },
          { quantity: 1, price: 659, liters: 15, unit: 'keg' },
          { quantity: 3, price: 300, liters: null, unit: 'day' },
        ],
        { days: 4, weekend: true },
      ),
    ).toEqual({ total: 5119, kegs: 3, bars: 2, taps: 3, liters: 75, pints: 150 })
  })

  it('is zero for an empty order', () => {
    expect(beerTotals([], { days: 4, weekend: false })).toEqual({
      total: 0,
      kegs: 0,
      bars: 0,
      taps: 0,
      liters: 0,
      pints: 0,
    })
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

  it('merges the same keg, keeps who wants it, puts the bar last', () => {
    const lines = mergeOrderLines([
      item(TAP_CODE, 2, 'Vojta'),
      item('BENE-VELKOPOPOVICKY-KOZEL-11-30', 1, 'Martin'),
      item('BENE-VELKOPOPOVICKY-KOZEL-11-30', 2, 'Vojta', 'na sobotu'),
      item('BENE-VELKOPOPOVICKY-KOZEL-11-30', 1, 'Martin'),
      item('BENE-BIRELL-15', 1, 'Daniela'),
    ])
    expect(lines.map((line) => [line.code, line.quantity])).toEqual([
      ['BENE-BIRELL-15', 1],
      ['BENE-VELKOPOPOVICKY-KOZEL-11-30', 4],
      [TAP_CODE, 2],
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
    { ...beerProduct(TAP_CODE)!, quantity: 2, wantedBy: null, note: null },
  ])
  const weekendRental = { days: 4, weekend: true }
  // Intl separates thousands and the currency with no-break spaces
  const plain = (text: string) => text.replace(/\s/g, ' ')

  it('writes the order line the shop needs, with the code', () => {
    expect(plain(orderLineText(lines[0], weekendRental))).toBe(
      '2× Velkopopovický Kozel 11°, sud 30 l, 1 246 Kč za sud',
    )
    expect(plain(orderLineText(lines[1], weekendRental))).toBe(
      'Výčep se dvěma kohouty na 4 dny (víkendová cena)',
    )
    expect(orderLineText({ ...lines[1], quantity: 3 }, { days: 5, weekend: false })).toBe(
      'Výčep se dvěma kohouty a výčep s jedním kohoutem na 5 dní',
    )
    // a Friday to Sunday weekend costs less by the day: no weekend label
    expect(orderLineText(lines[1], { days: 3, weekend: true })).toBe(
      'Výčep se dvěma kohouty na 3 dny',
    )
  })

  it('names the bars a plan picked', () => {
    const rental = { days: 5, weekend: false }
    expect(barPlanCs(barPlan(1, rental))).toBe('Výčep s jedním kohoutem')
    expect(barPlanCs(barPlan(4, rental))).toBe('2 výčepy se dvěma kohouty')
    expect(barPlanCs(barPlan(5, rental))).toBe(
      '2 výčepy se dvěma kohouty a výčep s jedním kohoutem',
    )
  })

  it('carries the order, the place, the totals and who wants what', () => {
    const email = kegOrderEmail({
      chataName: 'Přátelé',
      lines,
      rental: weekendRental,
      place: 'Chata Oáza, Vavřetice',
      arrival: 'pátek 13. 11. 2026, od 16:00',
      listUrl: 'https://pratele.zicha.travel?view=beer',
    })
    expect(email.subject).toBe('Přátelé: objednávka piva do Benecentra')
    expect(email.text).toContain('Na chatu: Chata Oáza, Vavřetice.')
    expect(email.text).toContain('Celkem 2 sudy, 60 l.')
    // 2 × 1 246 Kč of kegs, the bar at its weekend price
    expect(plain(email.text)).toContain(
      'to vychází asi na 3 492 Kč, z toho výčep 1 000 Kč podle orientační ceny 300 Kč na den za výčep (víkend 1 000 Kč).',
    )
    expect(email.text).toContain('Velkopopovický Kozel 11° 30 l: Martin')
    expect(email.text).not.toMatch(/[—–]/)
    expect(email.html).toContain('benesov@bene.cz')
  })

  it('escapes what participants typed', () => {
    const email = kegOrderEmail({
      chataName: 'X',
      rental: { days: 2, weekend: false },
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
    { ...beerProduct(TAP_CODE)!, quantity: 2, participant: 2, note: null as string | null },
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
