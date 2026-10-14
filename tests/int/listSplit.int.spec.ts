import { describe, it, expect } from 'vitest'
import { canSetOptOut, listShares, optOutView, roundedShares, scaledShares } from '@/lib/listSplit'

const people = [1, 2, 3]

describe('listShares', () => {
  it('splits every item equally among everyone by default', () => {
    const split = listShares(people, [{ id: 10, cost: 300 }], { list: [], items: {} })
    expect(Object.fromEntries(split.shares)).toEqual({ '1': 100, '2': 100, '3': 100 })
    expect(split.total).toBe(300)
  })

  it('leaves an item to the others when someone opts out of it', () => {
    const split = listShares(
      people,
      [
        { id: 10, cost: 300 },
        { id: 11, cost: 90 },
      ],
      { list: [], items: { '10': [3] } },
    )
    expect(Object.fromEntries(split.shares)).toEqual({ '1': 180, '2': 180, '3': 30 })
  })

  it('keeps a whole-list opt-out out of every item, later ones included', () => {
    const split = listShares(
      people,
      [
        { id: 10, cost: 200 },
        { id: 11, cost: 100 },
      ],
      { list: [2], items: {} },
    )
    expect(Object.fromEntries(split.shares)).toEqual({ '1': 150, '2': 0, '3': 150 })
  })

  it('falls back to everyone when nobody wants an item, and reports it', () => {
    const split = listShares(people, [{ id: 10, cost: 300 }], {
      list: [1],
      items: { '10': [2, 3] },
    })
    expect(Object.fromEntries(split.shares)).toEqual({ '1': 100, '2': 100, '3': 100 })
    expect(split.orphaned).toEqual(['10'])
  })

  it('leaves unpriced items out and counts them', () => {
    const split = listShares(
      people,
      [
        { id: 10, cost: null },
        { id: 11, cost: 30 },
      ],
      { list: [], items: {} },
    )
    expect(split.total).toBe(30)
    expect(split.unpriced).toBe(1)
  })
})

describe('roundedShares and scaledShares', () => {
  it('rounds to whole crowns that add up to the rounded total', () => {
    const rounded = roundedShares(
      new Map([
        ['1', 33.34],
        ['2', 33.33],
        ['3', 33.33],
        ['4', 0],
      ]),
    )
    expect([...rounded.values()].reduce((a, b) => a + b, 0)).toBe(100)
    // nothing to pay = no weight row
    expect(rounded.has('4')).toBe(false)
  })

  it('scales the shares to the real bill', () => {
    const scaled = scaledShares(
      new Map([
        ['1', 150],
        ['2', 50],
      ]),
      1000,
    )
    expect(Object.fromEntries(scaled)).toEqual({ '1': 750, '2': 250 })
  })
})

describe('canSetOptOut', () => {
  it('allows the owner, the banker and chata admins only', () => {
    const base = { ownsParticipant: false, isBanker: false, isChataAdmin: false }
    expect(canSetOptOut(base)).toBe(false)
    expect(canSetOptOut({ ...base, ownsParticipant: true })).toBe(true)
    expect(canSetOptOut({ ...base, isBanker: true })).toBe(true)
    expect(canSetOptOut({ ...base, isChataAdmin: true })).toBe(true)
  })
})

describe('optOutView', () => {
  const optOuts = { list: [2], items: { '10': [1, 3] } }

  it('names people for signed-in viewers', () => {
    const view = optOutView(optOuts, { signedIn: true, canSetFor: [1] })
    expect(view.list).toEqual([2])
    expect(view.items).toEqual({ '10': [1, 3] })
    expect(view.canSetFor).toEqual([1])
  })

  it('gives anonymous visitors counts only', () => {
    const view = optOutView(optOuts, { signedIn: false, canSetFor: [] })
    expect(view.list).toBeNull()
    expect(view.items).toBeNull()
    expect(view.listCount).toBe(1)
    expect(view.itemCounts).toEqual({ '10': 2 })
  })
})
