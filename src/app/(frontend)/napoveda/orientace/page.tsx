import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import OrientaceContentCs from './content.cs'
import OrientaceContentEn from './content.en'
import '../../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Finding your way around',
        description: 'Picking a chata, the tabs and the individual views of zicha.travel',
      }
    : {
        title: 'Kde co najdete',
        description: 'Výběr chaty, záložky a jednotlivé pohledy v aplikaci zicha.travel',
      }
}

export default async function OrientacePage() {
  const locale = await getLocale()
  return locale === 'en' ? <OrientaceContentEn /> : <OrientaceContentCs />
}
