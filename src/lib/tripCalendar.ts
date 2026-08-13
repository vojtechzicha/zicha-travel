/**
 * Body text for the "trip to calendar" event. Google Calendar renders a small
 * subset of HTML in `details`, so the structure (<b> headings, <br> breaks) is
 * ours and everything coming from the database gets escaped.
 *
 * Blocks with no usable lines disappear — a chata without a program or a
 * packing list simply gets a shorter description, never an empty heading.
 */

export interface CalendarBlock {
  /** bold heading above the lines */
  title?: string | null
  lines: (string | null | undefined | false)[]
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

export function escapeCalendarText(value: string): string {
  return value.replace(/[&<>]/g, (char) => ESCAPES[char])
}

export function calendarDetails(blocks: CalendarBlock[]): string {
  return blocks
    .map((block) => {
      const lines = block.lines
        .filter((line): line is string => typeof line === 'string' && line.trim() !== '')
        .map((line) => escapeCalendarText(line.trim()))
      if (lines.length === 0) return null
      const body = lines.join('<br>')
      return block.title ? `<b>${escapeCalendarText(block.title)}</b><br>${body}` : body
    })
    .filter((block): block is string => block !== null)
    .join('<br><br>')
}

/** `a · b · c`, skipping the parts that aren't there. */
export function joinParts(parts: (string | null | undefined | false)[]): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' · ')
}
