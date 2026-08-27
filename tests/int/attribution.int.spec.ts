import { describe, it, expect } from 'vitest'
import { dedupeAttributions } from '@/lib/attribution'

const commons = 'https://commons.wikimedia.org/wiki/File:Petrovy_kameny.jpg'

describe('dedupeAttributions', () => {
  it('keeps one entry when the same cover is shown by several chatas', () => {
    // The homepage case: two Jeseníky trips sharing a background
    expect(
      dedupeAttributions([
        { text: 'Petrovy kameny · MartinVeselka · CC BY-SA 4.0', url: commons },
        { text: 'Petrovy kameny · MartinVeselka · CC BY-SA 4.0', url: commons },
      ])
    ).toEqual([{ text: 'Petrovy kameny · MartinVeselka · CC BY-SA 4.0', url: commons }])
  })

  it('keeps first-seen order', () => {
    expect(
      dedupeAttributions([{ text: 'B' }, { text: 'A' }, { text: 'B' }, { text: 'C' }]).map(
        (a) => a.text
      )
    ).toEqual(['B', 'A', 'C'])
  })

  it('treats the same wording pointing at different sources as two credits', () => {
    const items = dedupeAttributions([
      { text: 'Jeseníky', url: 'https://example.com/one' },
      { text: 'Jeseníky', url: 'https://example.com/two' },
    ])
    expect(items).toHaveLength(2)
  })

  it('normalizes a missing link to null so entries compare equal', () => {
    expect(dedupeAttributions([{ text: 'Foto' }, { text: 'Foto', url: '' }])).toEqual([
      { text: 'Foto', url: null },
    ])
  })

  it('drops blank credits rather than rendering an empty line', () => {
    expect(dedupeAttributions([{ text: '   ' }, { text: '' }])).toEqual([])
  })

  it('trims surrounding whitespace', () => {
    expect(dedupeAttributions([{ text: '  Foto  ', url: '  https://example.com  ' }])).toEqual([
      { text: 'Foto', url: 'https://example.com' },
    ])
  })

  it('returns nothing for an empty page', () => {
    expect(dedupeAttributions([])).toEqual([])
  })
})
