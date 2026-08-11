// Locale plumbing for the Czech/English frontend. No URL segment: the
// middleware already routes by hostname and /[chataSlug] owns the top-level
// path, so the locale lives in a cookie instead (next-intl "without i18n
// routing" mode). Pure helpers here are unit-tested in
// tests/int/i18n.int.spec.ts.

export const LOCALES = ['cs', 'en'] as const
export type AppLocale = (typeof LOCALES)[number]

/** Czech is the site's home language — the fallback when nothing matches. */
export const DEFAULT_LOCALE: AppLocale = 'cs'

/** next-intl's conventional cookie name; set via POST /api/locale. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/** One year — an explicit choice should outlive a season of trips. */
export const LOCALE_COOKIE_TTL_SECONDS = 365 * 24 * 60 * 60

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Resolve the locale for a request: explicit cookie first, then the
 * browser's Accept-Language, then Czech. Slovak browsers get Czech —
 * closer than English for this audience.
 */
export function pickLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): AppLocale {
  if (isAppLocale(cookieValue)) return cookieValue
  const negotiated = negotiateLocale(acceptLanguage)
  return negotiated ?? DEFAULT_LOCALE
}

function negotiateLocale(acceptLanguage: string | null | undefined): AppLocale | null {
  if (!acceptLanguage) return null
  let best: { locale: AppLocale; q: number } | null = null
  for (const part of acceptLanguage.split(',')) {
    const [tag, ...params] = part.trim().split(';')
    const lang = tag.trim().toLowerCase().split('-')[0]
    const locale: AppLocale | null =
      lang === 'cs' || lang === 'sk' ? 'cs' : lang === 'en' ? 'en' : null
    if (!locale) continue
    let q = 1
    for (const param of params) {
      const [key, value] = param.trim().split('=')
      if (key === 'q') q = Number(value)
    }
    if (!Number.isFinite(q)) q = 0
    // Strictly greater: on equal quality the earlier entry wins.
    if (!best || q > best.q) best = { locale, q }
  }
  return best?.locale ?? null
}

/**
 * The Set-Cookie string for a locale choice. Domain comes from
 * SESSION_COOKIE_DOMAIN (`.zicha.travel` in production) so one choice covers
 * the apex and every chata subdomain — same reasoning as the session and
 * consent cookies.
 */
export function localeCookieString(
  locale: AppLocale,
  options: { domain?: string; secure?: boolean } = {},
): string {
  let cookie = `${LOCALE_COOKIE}=${locale}; Max-Age=${LOCALE_COOKIE_TTL_SECONDS}; Path=/; SameSite=Lax`
  if (options.domain) cookie += `; Domain=${options.domain}`
  if (options.secure) cookie += `; Secure`
  return cookie
}
