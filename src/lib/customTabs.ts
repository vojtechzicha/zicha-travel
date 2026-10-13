// "Vlastní záložky" — admin-authored rich-text tabs on the chata detail,
// rendered after the built-in ones (Informace, Organizace, Finance,
// Účastníci). The content is Lexical JSON, never raw HTML: chata admins are
// not all superadmins and the page is public, so admin-entered markup would
// be a stored-XSS hole on a domain whose session cookie spans every chata.

/** Icon keys offered in the admin select; the frontend maps them to lucide. */
export const CUSTOM_TAB_ICONS = [
  'file-text',
  'mountain',
  'map',
  'utensils',
  'sparkles',
  'book-open',
  'calendar',
  'info',
] as const
export type CustomTabIcon = (typeof CUSTOM_TAB_ICONS)[number]

/** `?view=custom&tab=<row id>` addresses one custom tab. */
export const CUSTOM_TAB_VIEW = 'custom'
export const CUSTOM_TAB_PARAM = 'tab'

interface LexicalNode {
  type?: string
  text?: string
  children?: LexicalNode[]
}

/** True when the rich text holds anything a reader would see — a fresh
 * editor saves an empty paragraph, which must not produce an empty tab. */
export function hasRichTextContent(value: unknown): boolean {
  const root = (value as { root?: LexicalNode } | null | undefined)?.root
  const visit = (node: LexicalNode): boolean => {
    if (typeof node.text === 'string' && node.text.trim() !== '') return true
    // leaf nodes without text that still render something
    if (node.type === 'upload' || node.type === 'horizontalrule') return true
    return (node.children ?? []).some(visit)
  }
  return root != null && visit(root)
}

export interface CustomTabRow {
  id?: string | null
  title?: string | null
  icon?: string | null
  content?: unknown
}

export type VisibleCustomTab<T extends CustomTabRow> = T & { id: string; title: string }

/** Rows that earn a tab pill: saved (have an id), titled, with content. */
export function visibleCustomTabs<T extends CustomTabRow>(
  rows: T[] | null | undefined
): VisibleCustomTab<T>[] {
  return (rows ?? []).filter(
    (row): row is VisibleCustomTab<T> =>
      typeof row.id === 'string' &&
      row.id !== '' &&
      typeof row.title === 'string' &&
      row.title.trim() !== '' &&
      hasRichTextContent(row.content)
  )
}

/** The tab a `?tab=` value points at; null when it is gone (deleted row,
 * stale link) so the caller falls back to the default view. */
export function resolveCustomTab<T extends CustomTabRow>(
  tabs: VisibleCustomTab<T>[],
  id: string | null | undefined
): VisibleCustomTab<T> | null {
  if (!id) return null
  return tabs.find((tab) => tab.id === id) ?? null
}

/** Link targets the renderer will emit: web, mail and phone links plus
 * same-site paths and anchors. Anything else (javascript:, data:,
 * protocol-relative //host) renders as plain text. */
export function safeLinkHref(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (trimmed === '') return null
  if (trimmed.startsWith('#')) return trimmed
  if (trimmed.startsWith('/')) {
    // `//host` and `/\host` both leave the site (WHATWG reads `\` as `/`)
    return /^\/[/\\]/.test(trimmed) ? null : trimmed
  }
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed
  return null
}
