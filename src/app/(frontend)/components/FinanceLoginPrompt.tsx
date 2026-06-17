'use client'

import { GlassCard } from './GlassCard'
import { LogIn, KeyRound } from 'lucide-react'

interface FinanceLoginPromptProps {
  redirect: string
  providers: string[]
  notFound?: boolean
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Přihlásit přes Google',
  microsoft: 'Přihlásit přes Microsoft',
}

export function FinanceLoginPrompt({ redirect, providers, notFound }: FinanceLoginPromptProps) {
  const startUrl = (provider: string) =>
    `/api/auth/oauth/start?provider=${provider}&mode=login&redirect=${encodeURIComponent(redirect)}`

  return (
    <GlassCard padding="large" className="w-full max-w-lg mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-4">
          <LogIn size={26} />
        </div>
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">Přihlaste se</h2>
        <p className="text-gray-600">
          Pro zobrazení svých financí se prosím přihlaste svým účtem.
        </p>
      </div>

      {notFound && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
          Tento e-mail jsme nenašli u žádného účastníka. Použijte prosím svůj odkaz pro přihlášení
          (magic link) a poté si e-mail přidejte.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {providers.length === 0 && (
          <p className="text-center text-gray-500 text-sm">
            Přihlášení přes Google/Microsoft není nakonfigurováno. Použijte odkaz pro přihlášení,
            který vám poslal organizátor.
          </p>
        )}
        {providers.map((provider) => (
          <a
            key={provider}
            href={startUrl(provider)}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold
                       bg-white/80 text-gray-800 shadow-md transition-all
                       hover:bg-white hover:-translate-y-0.5 hover:shadow-lg"
          >
            {PROVIDER_LABELS[provider] ?? provider}
          </a>
        ))}
      </div>

      <div className="mt-6 pt-5 border-t border-gray-200/60 flex items-start gap-2 text-sm text-gray-500">
        <KeyRound size={18} className="flex-shrink-0 mt-0.5" />
        <p>
          Organizátor vám mohl poslat osobní odkaz pro přihlášení (např. přes WhatsApp). Kliknutím na
          něj se přihlásíte i bez účtu Google/Microsoft.
        </p>
      </div>
    </GlassCard>
  )
}
