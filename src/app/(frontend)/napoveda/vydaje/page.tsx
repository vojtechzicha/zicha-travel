import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import VydajeContentCs from './content.cs'
import VydajeContentEn from './content.en'
import '../../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Adding and editing expenses',
        description: 'How to record an expense from a phone or a computer, split it and attach a receipt',
      }
    : {
        title: 'Přidání a úprava výdaje',
        description: 'Jak z telefonu i z počítače zapsat výdaj, rozdělit ho a přiložit účtenku',
      }
}

export default async function VydajePage() {
  const locale = await getLocale()
  return locale === 'en' ? <VydajeContentEn /> : <VydajeContentCs />
}
