import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import FinanceContentCs from './content.cs'
import FinanceContentEn from './content.en'
import '../../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Finances line by line',
        description: 'What every number in the finance summary means and how to settle up',
      }
    : {
        title: 'Finance řádek po řádku',
        description: 'Co znamená každé číslo v přehledu financí a jak se vyrovnat',
      }
}

export default async function FinancePage() {
  const locale = await getLocale()
  return locale === 'en' ? <FinanceContentEn /> : <FinanceContentCs />
}
