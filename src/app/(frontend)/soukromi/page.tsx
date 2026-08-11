import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import PrivacyContentCs from './content.cs'
import PrivacyContentEn from './content.en'
import '../styles.css'

// The privacy page required by docs/PRD-analytika.md — linked from the
// consent banner ("Více o soukromí") and the footer. Static server
// component, same building blocks as /napoveda; the prose lives in
// per-locale content modules.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Privacy',
        description:
          'What we measure on zicha.travel, what we never measure, and how to manage cookie consent',
      }
    : {
        title: 'Soukromí',
        description: 'Co na zicha.travel měříme, co nikdy neměříme a jak spravujete souhlas s cookies',
      }
}

export default async function PrivacyPage() {
  const locale = await getLocale()
  return locale === 'en' ? <PrivacyContentEn /> : <PrivacyContentCs />
}
