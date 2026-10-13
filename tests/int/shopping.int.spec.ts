import { describe, it, expect } from 'vitest'
import {
  canEditShoppingItem,
  estimatedTotal,
  mergeCartLines,
  refreshedRohlik,
  sendRoute,
} from '@/lib/shopping'

describe('canEditShoppingItem', () => {
  const base = { viewerId: 7, authoredBy: 7, isChataAdmin: false, isBanker: false }

  it('lets the author edit their own item', () => {
    expect(canEditShoppingItem(base)).toBe(true)
  })

  it('refuses another participant', () => {
    expect(canEditShoppingItem({ ...base, viewerId: 8 })).toBe(false)
  })

  it('lets the banker and chata admins tidy any item', () => {
    expect(canEditShoppingItem({ ...base, viewerId: 8, isBanker: true })).toBe(true)
    expect(canEditShoppingItem({ ...base, viewerId: 8, isChataAdmin: true })).toBe(true)
  })

  it('refuses anonymous viewers and items without an author', () => {
    expect(canEditShoppingItem({ ...base, viewerId: null })).toBe(false)
    expect(canEditShoppingItem({ ...base, viewerId: 8, authoredBy: null })).toBe(false)
  })

  it('compares ids across number and string', () => {
    expect(canEditShoppingItem({ ...base, viewerId: '7', authoredBy: 7 })).toBe(true)
  })
})

describe('mergeCartLines', () => {
  it('merges the same product and sums quantities', () => {
    expect(
      mergeCartLines([
        { title: 'Mléko', quantity: 2, rohlik: { productId: '100' } },
        { title: 'Mlíčko do kafe', quantity: 1, rohlik: { productId: '100' } },
        { title: 'Chleba', quantity: 1, rohlik: { productId: '200' } },
      ]),
    ).toEqual([
      { productId: '100', quantity: 3, titles: ['Mléko', 'Mlíčko do kafe'] },
      { productId: '200', quantity: 1, titles: ['Chleba'] },
    ])
  })

  it('skips free-text items', () => {
    expect(
      mergeCartLines([
        { title: 'Něco na gril', quantity: 1, rohlik: null },
        { title: 'Pivo', quantity: 1, rohlik: { productId: '' } },
      ]),
    ).toEqual([])
  })

  it('normalizes odd quantities to whole pieces, at least one', () => {
    expect(
      mergeCartLines([
        { title: 'A', quantity: 0, rohlik: { productId: '1' } },
        { title: 'B', quantity: 2.6, rohlik: { productId: '2' } },
      ]).map((line) => line.quantity),
    ).toEqual([1, 3])
  })
})

describe('estimatedTotal', () => {
  it('sums price times quantity and counts unpriced items', () => {
    expect(
      estimatedTotal([
        { quantity: 2, rohlik: { price: 24.9 } },
        { quantity: 1, rohlik: { price: 59 } },
        { quantity: 3, rohlik: null },
        { quantity: 1, rohlik: { price: null } },
      ]),
    ).toEqual({ total: 108.8, unpriced: 2 })
  })

  it('is zero for an empty list', () => {
    expect(estimatedTotal([])).toEqual({ total: 0, unpriced: 0 })
  })
})

describe('refreshedRohlik', () => {
  const now = new Date('2026-11-10T05:00:00Z')
  const stored = {
    productId: '712705',
    name: 'Mléko',
    price: 34.9,
    amount: '1 l',
    imageUrl: 'https://cdn.rohlik.cz/images/grocery/products/712705/712705-1.jpg',
    url: 'https://www.rohlik.cz/712705',
    inStock: true,
  }
  const fresh = (over: object = {}) => ({
    productId: '712705',
    name: 'Mléko',
    price: 34.9,
    amount: '1 l',
    imageUrl: null,
    url: 'https://www.rohlik.cz/712705',
    inStock: true,
    ...over,
  })

  it('takes the new price and keeps the image', () => {
    const result = refreshedRohlik(stored, fresh({ price: 29.9 }), now)
    expect(result.changed).toBe(true)
    expect(result.rohlik).toMatchObject({ price: 29.9, imageUrl: stored.imageUrl })
    expect(result.rohlik.checkedAt).toBe(now.toISOString())
  })

  it('reports no change when nothing a viewer sees moved', () => {
    const result = refreshedRohlik(stored, fresh(), now)
    expect(result.changed).toBe(false)
    expect(result.rohlik.checkedAt).toBe(now.toISOString())
  })

  it('marks a sold-out or delisted product', () => {
    expect(refreshedRohlik(stored, fresh({ inStock: false }), now).rohlik.inStock).toBe(false)
    const gone = refreshedRohlik(stored, undefined, now)
    expect(gone.rohlik.inStock).toBe(false)
    expect(gone.rohlik.price).toBe(34.9)
    expect(gone.changed).toBe(true)
  })

  it('keeps the stored price when Rohlík sends none', () => {
    expect(refreshedRohlik(stored, fresh({ price: null }), now).rohlik.price).toBe(34.9)
  })
})

describe('sendRoute', () => {
  it('sends Rohlík products to the cart', () => {
    expect(sendRoute({ productId: '712705', inStock: true }, true)).toBe('cart')
    // never checked, or Rohlík didn't say: try the cart
    expect(sendRoute({ productId: '712705' }, true)).toBe('cart')
    expect(sendRoute({ productId: '712705', inStock: null }, true)).toBe('cart')
  })

  it('keeps sold-out products out of the cart', () => {
    expect(sendRoute({ productId: '712705', inStock: false }, true)).toBe('soldOut')
  })

  it("doesn't trust a stale sold-out when the check before the send failed", () => {
    expect(sendRoute({ productId: '712705', inStock: false }, false)).toBe('cart')
  })

  it('routes free-text items to the checklist', () => {
    expect(sendRoute(null, true)).toBe('text')
    expect(sendRoute({ productId: null, inStock: false }, false)).toBe('text')
  })
})
