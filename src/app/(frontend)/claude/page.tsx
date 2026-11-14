import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getPayload } from 'payload'
import { getTranslations } from 'next-intl/server'
import config from '@/payload.config'
import { getMcpResourceUrl, getPublicOrigin } from '@/lib/mcp/oauth'
import { GlassCard } from '../components/GlassCard'
import { ClaudeConnections } from '../components/ClaudeConnections'
import '../styles.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('connector.page')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: true },
  }
}

// "Propojení s Claude" (docs/MCP.md): connector address, Claude Code command
// and the signed-in account's connected apps. Linked from the footer.
export default async function ClaudePage() {
  const headersList = await headers()
  const payload = await getPayload({ config: await config })
  const { user } = await payload.auth({ headers: headersList }).catch(() => ({ user: null }))
  const t = await getTranslations('connector.page')
  const mcpUrl = getMcpResourceUrl(getPublicOrigin(headersList))

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
      <div className="relative z-10 max-w-app mx-auto px-4 sm:px-5 py-10 flex justify-center">
        <GlassCard padding="none" className="w-full max-w-2xl p-6 sm:p-10">
          <h1 className="font-serif text-3xl font-bold text-gray-900 mb-3">{t('title')}</h1>
          <p className="text-gray-700 mb-6">{t('intro')}</p>
          {user ? (
            <ClaudeConnections mcpUrl={mcpUrl} />
          ) : (
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-gray-700 mb-3">{t('signedOut')}</p>
              <a
                href="/login?returnTo=%2Fclaude"
                className="inline-block rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold px-5 py-2.5 transition-colors"
              >
                {t('signIn')}
              </a>
            </div>
          )}
          <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-600 space-y-2">
            <p>
              {t('privacy')}{' '}
              <a href="/soukromi#claude" className="underline underline-offset-2">
                {t('privacyLink')}
              </a>
            </p>
            <p>
              <a href="/napoveda/claude" className="underline underline-offset-2">
                {t('helpLink')}
              </a>
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
