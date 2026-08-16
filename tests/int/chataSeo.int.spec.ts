import { describe, expect, it } from 'vitest'
import { isIndexableChataRender, NOINDEX_FOLLOW } from '@/lib/chataSeo'

// Compliance blocker 3 (decisions 7 and 12): only the default Informace
// render of the chata page is indexable; every ?view=/?participant= render
// carries noindex, and so does a chata whose default view is not Informace.

describe('isIndexableChataRender', () => {
  it('indexes the default render when Informace is the default view', () => {
    expect(isIndexableChataRender({}, true)).toBe(true)
  })

  it('noindexes every ?view= render', () => {
    expect(isIndexableChataRender({ view: 'organization' }, true)).toBe(false)
    expect(isIndexableChataRender({ view: 'participants' }, true)).toBe(false)
    expect(isIndexableChataRender({ view: 'finance' }, true)).toBe(false)
    expect(isIndexableChataRender({ view: 'finance-overview' }, true)).toBe(false)
    // even an explicit ?view=information is a non-canonical duplicate
    expect(isIndexableChataRender({ view: 'information' }, true)).toBe(false)
  })

  it('noindexes ?participant= renders (they open the finance view)', () => {
    expect(isIndexableChataRender({ participant: '42' }, true)).toBe(false)
  })

  it('treats a bare or repeated param as non-default', () => {
    // ?view= without a value still reaches the page as an empty string
    expect(isIndexableChataRender({ view: '' }, true)).toBe(false)
    // ?view=a&view=b arrives as an array
    expect(isIndexableChataRender({ view: ['information', 'finance'] }, true)).toBe(false)
  })

  it('noindexes chatas whose default view is not Informace', () => {
    // informationEnabled off makes Organizace or Finance the default render,
    // and those carry participant names for anonymous viewers
    expect(isIndexableChataRender({}, false)).toBe(false)
  })

  it('keeps the noindex value follow-friendly', () => {
    expect(NOINDEX_FOLLOW).toEqual({ index: false, follow: true })
  })
})
