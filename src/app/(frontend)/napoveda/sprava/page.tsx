import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import SpravaContentCs from './content.cs'
import SpravaContentEn from './content.en'
import '../../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'For chata admins',
        description: 'The admin panel: participants, the banker, deposits and link requests',
      }
    : {
        title: 'Pro správce chaty',
        description: 'Administrace: účastníci, pokladník, zálohy a žádosti o propojení',
      }
}

export default async function SpravaPage() {
  const locale = await getLocale()
  return locale === 'en' ? <SpravaContentEn /> : <SpravaContentCs />
}
