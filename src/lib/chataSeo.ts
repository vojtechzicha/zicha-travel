// Which chata-page render search engines may index (compliance blocker 3,
// decisions 7 and 12 in docs/legal/compliance-gaps.md): ONLY the default
// render — no ?view=, no ?participant= — and only when that default really
// is Informace. When `informationEnabled` is off, ChataView falls back to
// Organizace or Finance as the default view, and those carry participant
// names for anonymous viewers, so the page must not be indexable either.
//
// Everything non-default keeps robots "noindex, follow" (rather than a
// robots.txt disallow) so crawlers can still FETCH the page and see the
// noindex — a disallowed URL could linger in the index as a bare link.

/** The chata page's search params, as Next hands them to generateMetadata. */
export interface ChataRenderParams {
  view?: string | string[]
  participant?: string | string[]
}

const present = (value: string | string[] | undefined): boolean => value != null

/**
 * True only for the canonical, name-free render: no view/participant param
 * (even an empty `?view=` is a non-canonical duplicate) and Informace is
 * actually the default view of this chata.
 */
export function isIndexableChataRender(
  params: ChataRenderParams,
  informationEnabled: boolean,
): boolean {
  if (present(params.view) || present(params.participant)) return false
  return informationEnabled
}

/** Metadata `robots` value for non-indexable renders. */
export const NOINDEX_FOLLOW = { index: false, follow: true } as const
