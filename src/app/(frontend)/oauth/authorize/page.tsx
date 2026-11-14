import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { MCP_SCOPES, getPublicOrigin, validateAuthorizeRequest } from '@/lib/mcp/oauth'
import { mcpRuntime } from '@/lib/mcp/runtime'
import { ConnectorConsent } from '../../components/ConnectorConsent'
import '../../styles.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('connector.consent')
  return { title: t('metaTitle'), robots: { index: false, follow: false } }
}

// OAuth authorization endpoint of the Claude connector (src/lib/mcp/oauth.ts,
// docs/MCP.md). Validates the request, asks an anonymous visitor to sign in
// first (back here afterwards), then shows the consent card for the account.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const params = Object.fromEntries(
    Object.entries(raw)
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  const headersList = await headers()
  const origin = getPublicOrigin(headersList)
  const { payload, store } = await mcpRuntime()
  const validation = await validateAuthorizeRequest(store, params, origin)

  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
      <div className="relative z-10 max-w-app mx-auto px-5 py-10 flex items-center justify-center min-h-screen">
        {content}
      </div>
    </div>
  )

  if (!validation.ok) {
    if (validation.redirectTo) redirect(validation.redirectTo)
    return shell(<ConnectorConsent view="error" error={validation.error} />)
  }

  const { user } = await payload.auth({ headers: headersList }).catch(() => ({ user: null }))
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(params).toString()}`
    return shell(
      <ConnectorConsent view="sign-in" loginHref={`/login?returnTo=${encodeURIComponent(here)}`} />,
    )
  }

  const { request } = validation
  return shell(
    <ConnectorConsent
      view="consent"
      params={params}
      clientName={request.clientName}
      redirectHost={new URL(request.redirectUri).host}
      email={user.email}
      writeRequested={request.scopes.includes(MCP_SCOPES.WRITE)}
    />,
  )
}
