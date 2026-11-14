import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import ClaudeContentCs from './content.cs'
import ClaudeContentEn from './content.en'
import '../../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Connect Claude',
        description: 'Connect Claude to your zicha.travel account: what it can do, what it sees, how to disconnect',
      }
    : {
        title: 'Propojení s Claude',
        description: 'Připoj si Claude ke svému účtu na zicha.travel: co umí, co vidí a jak ho odpojit',
      }
}

export default async function ClaudePage() {
  const locale = await getLocale()
  return locale === 'en' ? <ClaudeContentEn /> : <ClaudeContentCs />
}
