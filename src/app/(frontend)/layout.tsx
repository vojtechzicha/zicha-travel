import React from 'react'
import type { Metadata, Viewport } from 'next'
import { Inter, Merriweather } from 'next/font/google'
import { cookies } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Footer } from './components/Footer'
import { AttributionProvider } from './components/AttributionProvider'
import { ConsentBanner } from './components/ConsentBanner'
import { UpdateHint } from './components/UpdateHint'
import { PwaProvider } from './components/PwaProvider'
import { AnalyticsProvider } from './components/AnalyticsProvider'
import { analyticsEnabled, CONSENT_COOKIE, resolveConsent } from '@/lib/consent'
import './styles.css'

// Self-hosted through next/font instead of an `@import` at the top of the CSS
// bundle: that import made the render-blocking chain HTML → app CSS → Google's
// CSS → woff2, on a third-party origin with no preconnect. Both families are
// loaded as variable fonts, so every weight the UI uses (including 500 and 800,
// which the old static list omitted and the browser synthesized) is covered by
// a single file per subset. `latin-ext` carries the Czech diacritics.
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
})

const merriweather = Merriweather({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-merriweather',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.meta')
  return {
    title: {
      default: 'zicha.travel',
      template: '%s | zicha.travel',
    },
    description: t('description'),
    icons: {
      icon: [
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ],
      apple: '/icons/apple-touch-icon.png',
    },
    // The manifest route is host-aware (single-chata subdomains install
    // through the apex bridge) — see src/lib/pwa.ts.
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: 'zicha.travel',
      statusBarStyle: 'default',
    },
    openGraph: {
      type: 'website',
      siteName: 'zicha.travel',
      description: t('description'),
    },
  }
}

// Colors the browser/app chrome to match the slate ground the site (and
// the PWA splash screen) sits on.
export const viewport: Viewport = {
  themeColor: '#0f172a',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  const locale = await getLocale()
  // Resolved server-side so the banner is part of the FIRST paint — mounted
  // client-only it pops in seconds late on cold loads (hydration), which
  // reads as "the banner appeared out of nowhere".
  const cookieStore = await cookies()
  const consentDecision = resolveConsent(cookieStore.get(CONSENT_COOKIE)?.value, new Date())

  return (
    <html lang={locale} className={`${inter.variable} ${merriweather.variable}`}>
      <body className="flex flex-col min-h-screen">
        <NextIntlClientProvider>
          {/* Wraps content AND footer: photo credits are raised inside the
              page and spent in the footer, which is the content's sibling. */}
          <AttributionProvider>
            <main className="flex-1">{children}</main>
            <Footer />
          </AttributionProvider>
          {/* Post-deploy refresh hint for long-lived tabs — renders nothing
              until a newer build answers /api/version. */}
          <UpdateHint />
          {/* Service worker lifecycle + rolling session refresh (renders
              nothing) — see components/PwaProvider.tsx. */}
          <PwaProvider />
          {/* Frontend route group only — /admin (its own route group) never
              sees the banner or the provider by construction. Both off
              without the PostHog key. */}
          {analyticsEnabled() && (
            <>
              <AnalyticsProvider />
              <ConsentBanner
                cookieDomain={process.env.SESSION_COOKIE_DOMAIN}
                initialDecision={consentDecision}
              />
            </>
          )}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
