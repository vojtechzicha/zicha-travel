import React from 'react'
import type { Metadata } from 'next'
import './styles.css'

export const metadata: Metadata = {
  title: {
    default: 'Aplikace Chata',
    template: '%s | Aplikace Chata',
  },
  description: 'Společně na chatu - plánování, informace, finance',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    siteName: 'Aplikace Chata',
    description: 'Společně na chatu - plánování, informace, finance',
  },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
