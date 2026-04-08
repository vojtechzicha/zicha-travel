import React from 'react'
import type { Metadata } from 'next'
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
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
