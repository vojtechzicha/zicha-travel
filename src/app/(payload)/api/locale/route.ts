import { NextResponse } from 'next/server'
import { isAppLocale, localeCookieString } from '@/i18n/config'

/**
 * POST /api/locale — persist the visitor's language choice. Static routes
 * under (payload)/api win over the [...slug] catch-all, same as the auth
 * routes. Body: { locale: 'cs' | 'en' }.
 */
export async function POST(request: Request) {
  let locale: unknown
  try {
    ;({ locale } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!isAppLocale(locale)) {
    return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 })
  }

  const response = NextResponse.json({ ok: true, locale })
  response.headers.set(
    'Set-Cookie',
    localeCookieString(locale, {
      domain: process.env.SESSION_COOKIE_DOMAIN,
      secure: process.env.NODE_ENV === 'production',
    }),
  )
  return response
}
