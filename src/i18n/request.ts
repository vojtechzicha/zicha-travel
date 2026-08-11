import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { LOCALE_COOKIE, pickLocale } from './config'

// One JSON file per namespace so different areas of the app can evolve (and
// be migrated) independently; every file must exist for both locales or the
// import below throws at request time. Help & privacy prose lives in
// locale-keyed page content instead of here — catalogs stay lean enough to
// ship to the client wholesale.
const NAMESPACES = ['common', 'chata', 'finance', 'composer', 'trip', 'auth'] as const

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const locale = pickLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get('accept-language'),
  )

  const entries = await Promise.all(
    NAMESPACES.map(
      async (ns) => [ns, (await import(`../../messages/${locale}/${ns}.json`)).default] as const,
    ),
  )

  return { locale, messages: Object.fromEntries(entries) }
})
