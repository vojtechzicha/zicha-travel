import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import PrehledContentCs from './content.cs'
import PrehledContentEn from './content.en'
import '../../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Detailed overview and the math',
        description: 'A table of all participants and the math the shares are computed by',
      }
    : {
        title: 'Podrobný přehled a výpočty',
        description: 'Tabulka všech účastníků a matematika, podle které se počítají podíly',
      }
}

export default async function PrehledPage() {
  const locale = await getLocale()
  return locale === 'en' ? <PrehledContentEn /> : <PrehledContentCs />
}
