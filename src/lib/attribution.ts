/**
 * Photo credits for the images a page paints.
 *
 * Backgrounds are painted as CSS `background-image` (the chata page) or as a
 * card cover (the homepage), so an `alt` never reaches a reader and there is
 * nowhere per-image for a credit to sit. Pages register what they show and the
 * footer lists it behind one info icon: one entry on a chata page, as many as
 * there are distinct covers on the homepage.
 */
export interface ImageAttribution {
  /** The credit itself, e.g. "Petrovy kameny · MartinVeselka · CC BY-SA 4.0" */
  text: string
  /** The photo's source page, if there is one to link to */
  url?: string | null
}

/**
 * Drops blanks and repeats, keeping first-seen order.
 *
 * The homepage routinely shows one background on several cards (two Jeseníky
 * trips sharing a cover), and crediting the same photographer four times reads
 * as a bug. Two entries are the same credit when both the text and the link
 * match: the same wording pointing at different sources stays two entries.
 */
export function dedupeAttributions(items: readonly ImageAttribution[]): ImageAttribution[] {
  const seen = new Set<string>()
  const result: ImageAttribution[] = []

  for (const item of items) {
    const text = item.text?.trim()
    if (!text) continue
    const url = item.url?.trim() || null
    const key = JSON.stringify([text, url])
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ text, url })
  }

  return result
}
