import { describe, it, expect } from 'vitest'
import {
  hasRichTextContent,
  resolveCustomTab,
  safeLinkHref,
  visibleCustomTabs,
} from '@/lib/customTabs'

const paragraph = (text: string) => ({
  type: 'paragraph',
  children: text ? [{ type: 'text', text }] : [],
})
const doc = (...children: object[]) => ({ root: { type: 'root', children } })

describe('hasRichTextContent', () => {
  it('rejects missing and empty documents', () => {
    expect(hasRichTextContent(null)).toBe(false)
    expect(hasRichTextContent(undefined)).toBe(false)
    expect(hasRichTextContent({})).toBe(false)
    expect(hasRichTextContent(doc())).toBe(false)
  })

  it('rejects the empty paragraph a fresh editor saves', () => {
    expect(hasRichTextContent(doc(paragraph('')))).toBe(false)
    expect(hasRichTextContent(doc(paragraph('   ')))).toBe(false)
  })

  it('accepts text nested anywhere', () => {
    expect(hasRichTextContent(doc(paragraph('Ahoj')))).toBe(true)
    expect(
      hasRichTextContent(
        doc({ type: 'list', children: [{ type: 'listitem', children: [{ type: 'text', text: 'x' }] }] })
      )
    ).toBe(true)
  })

  it('accepts an image-only document', () => {
    expect(hasRichTextContent(doc({ type: 'upload', value: 1 }))).toBe(true)
  })
})

describe('visibleCustomTabs', () => {
  const content = doc(paragraph('Trasa'))

  it('keeps saved, titled rows with content', () => {
    const rows = [{ id: 'a', title: 'Výlet', content }]
    expect(visibleCustomTabs(rows)).toEqual(rows)
  })

  it('drops unsaved, untitled and empty rows', () => {
    expect(
      visibleCustomTabs([
        { id: null, title: 'Bez id', content },
        { id: 'b', title: '  ', content },
        { id: 'c', title: 'Prázdná', content: doc(paragraph('')) },
      ])
    ).toEqual([])
  })

  it('handles a missing array', () => {
    expect(visibleCustomTabs(null)).toEqual([])
    expect(visibleCustomTabs(undefined)).toEqual([])
  })
})

describe('resolveCustomTab', () => {
  const tabs = visibleCustomTabs([
    { id: 'a', title: 'Výlet', content: doc(paragraph('x')) },
    { id: 'b', title: 'Jídlo', content: doc(paragraph('y')) },
  ])

  it('finds the tab by id', () => {
    expect(resolveCustomTab(tabs, 'b')?.title).toBe('Jídlo')
  })

  it('returns null for a stale or missing id', () => {
    expect(resolveCustomTab(tabs, 'gone')).toBeNull()
    expect(resolveCustomTab(tabs, null)).toBeNull()
    expect(resolveCustomTab(tabs, '')).toBeNull()
  })
})

describe('safeLinkHref', () => {
  it('allows web, mail and phone links', () => {
    expect(safeLinkHref('https://mapy.cz/s/abc')).toBe('https://mapy.cz/s/abc')
    expect(safeLinkHref('http://example.com')).toBe('http://example.com')
    expect(safeLinkHref('mailto:a@b.cz')).toBe('mailto:a@b.cz')
    expect(safeLinkHref('tel:+420123456789')).toBe('tel:+420123456789')
  })

  it('allows same-site paths and anchors', () => {
    expect(safeLinkHref('/pratele?view=organization')).toBe('/pratele?view=organization')
    expect(safeLinkHref('#trasa')).toBe('#trasa')
  })

  it('refuses script, data and off-site relative URLs', () => {
    expect(safeLinkHref('javascript:alert(1)')).toBeNull()
    expect(safeLinkHref(' JavaScript:alert(1)')).toBeNull()
    expect(safeLinkHref('data:text/html,<script>')).toBeNull()
    expect(safeLinkHref('//evil.com')).toBeNull()
    expect(safeLinkHref('/\\evil.com')).toBeNull()
    expect(safeLinkHref('vbscript:x')).toBeNull()
  })

  it('refuses empty values', () => {
    expect(safeLinkHref('')).toBeNull()
    expect(safeLinkHref(null)).toBeNull()
    expect(safeLinkHref(undefined)).toBeNull()
  })
})
