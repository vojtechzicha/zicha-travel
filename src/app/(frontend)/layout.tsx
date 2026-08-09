import React from 'react'
import type { Metadata } from 'next'
import { Inter, Merriweather } from 'next/font/google'
import { Footer } from './components/Footer'
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

export const metadata: Metadata = {
  title: {
    default: 'zicha.travel',
    template: '%s | zicha.travel',
  },
  description: 'Společně na chatu - plánování, informace, finance',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    siteName: 'zicha.travel',
    description: 'Společně na chatu - plánování, informace, finance',
  },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="cs" className={`${inter.variable} ${merriweather.variable}`}>
      <body className="flex flex-col min-h-screen">
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
