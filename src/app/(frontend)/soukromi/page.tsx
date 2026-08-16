import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import PrivacyContentCs from './content.cs'
import PrivacyContentEn from './content.en'
import '../styles.css'

// The privacy policy (docs/legal/*.md), linked from the consent banner
// ("Více o soukromí") and the footer. Static server component, same
// building blocks as /napoveda; the prose lives in per-locale content
// modules. Deliberately indexable: it is a public legal document.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Privacy policy',
        description:
          'How zicha.travel handles personal data: what we process and why, who can see it, cookies, retention periods and your rights',
      }
    : {
        title: 'Zásady zpracování osobních údajů',
        description:
          'Jak zicha.travel nakládá s osobními údaji: co a proč zpracováváme, kdo co vidí, cookies, doby uchování a vaše práva',
      }
}

export default async function PrivacyPage() {
  const locale = await getLocale()
  return locale === 'en' ? <PrivacyContentEn /> : <PrivacyContentCs />
}
