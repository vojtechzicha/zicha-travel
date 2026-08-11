import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import UcetContentCs from './content.cs'
import UcetContentEn from './content.en'
import '../../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Account and signing in',
        description: 'Sign-in links, Microsoft, and linking an account to a participant',
      }
    : {
        title: 'Účet a přihlášení',
        description: 'Přihlašovací odkaz, Microsoft a propojení účtu s účastníkem',
      }
}

export default async function UcetPage() {
  const locale = await getLocale()
  return locale === 'en' ? <UcetContentEn /> : <UcetContentCs />
}
