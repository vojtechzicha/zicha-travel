import React from 'react'
import type { Metadata } from 'next'
import { Footer } from './components/Footer'
import './styles.css'

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
    <html lang="en">
      <body className="flex flex-col min-h-screen">
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
