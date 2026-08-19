import type { MetadataRoute } from 'next'

// Compliance blocker 3 (docs/legal/compliance-gaps.md, decision 7): keep
// crawlers out of the admin panel, the API surface, the signed decide links
// and the login form. Chata pages are deliberately NOT disallowed — the
// per-view split is handled by robots meta (noindex on ?view=/?participant=
// renders), and a crawler can only see a noindex tag on a page it is allowed
// to fetch. The route is host-independent, so the wildcard *.zicha.travel
// subdomains serve the identical file.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: ['/admin', '/api/', '/expenses/decide', '/claims/decide', '/login'],
      },
    ],
  }
}
