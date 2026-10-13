import { describe, it, expect } from 'vitest'
import { canEditShoppingItem, estimatedTotal, mergeCartLines } from '@/lib/shopping'

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
