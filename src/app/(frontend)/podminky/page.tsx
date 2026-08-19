import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import TermsContentCs from './content.cs'
import TermsContentEn from './content.en'
import '../styles.css'

// The terms of use (docs/legal/*.md), the second legal document next to
// /soukromi. Static server component, same building blocks as /napoveda;
// the prose lives in per-locale content modules. Needs its entry in the
// middleware SITE_PATHS allowlist (single-segment path, like /soukromi).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return locale === 'en'
    ? {
        title: 'Terms of use',
        description:
          'The rules of using zicha.travel: accounts, expenses and receipts, chata admin duties, liability and governing law',
      }
    : {
        title: 'Podmínky užití',
        description:
          'Pravidla užívání zicha.travel: účty, výdaje a účtenky, povinnosti správců chat, odpovědnost a rozhodné právo',
      }
}

export default async function TermsPage() {
  const locale = await getLocale()
  return locale === 'en' ? <TermsContentEn /> : <TermsContentCs />
}
