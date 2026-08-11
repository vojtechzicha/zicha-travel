import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import HelpContentCs from './content.cs'
import HelpContentEn from './content.en'
import '../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Help',
        description: 'How zicha.travel works for visitors, participants and chata admins',
      }
    : {
        title: 'Nápověda',
        description: 'Jak zicha.travel funguje pro návštěvníka, účastníka a správce chaty',
      }
}

export default async function HelpPage() {
  const locale = await getLocale()
  return locale === 'en' ? <HelpContentEn /> : <HelpContentCs />
}
