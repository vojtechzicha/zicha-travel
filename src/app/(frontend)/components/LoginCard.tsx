'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, Send } from 'lucide-react'
import { GlassCard } from './GlassCard'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link: 'Přihlašovací odkaz je neplatný. Nechte si poslat nový.',
  expired_link: 'Přihlašovací odkaz vypršel nebo už byl použit. Nechte si poslat nový.',
  oauth: 'Přihlášení přes Microsoft se nezdařilo. Zkuste to prosím znovu.',
  unauthorized:
    'K tomuto e-mailu neexistuje účet. Požádejte správce chaty o vytvoření účtu.',
  missing_params: 'Neplatná odpověď přihlašovací služby. Zkuste to prosím znovu.',
  invalid_state: 'Přihlašování vypršelo. Zkuste to prosím znovu.',
  no_email: 'Od Microsoftu se nepodařilo získat e-mail. Zkuste to prosím znovu.',
  callback_failed: 'Přihlášení se nezdařilo. Zkuste to prosím znovu.',
}

export function LoginCard({ microsoftEnabled }: { microsoftEnabled: boolean }) {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')
  const returnTo = searchParams.get('returnTo') || '/'

  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(
    errorParam ? ERROR_MESSAGES[errorParam] || errorParam : null
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/magic-link/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), returnTo }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error || 'Odeslání se nezdařilo. Zkuste to prosím znovu.')
        return
      }
      setSent(true)
    } catch {
      setError('Odeslání se nezdařilo. Zkuste to prosím znovu.')
    } finally {
      setSending(false)
    }
  }

  return (
    <GlassCard padding="large" className="w-full max-w-md">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-3">
          <Mail size={28} />
        </div>
        <h1 className="font-serif text-3xl font-bold text-gray-900 mb-2">Přihlášení</h1>
        <p className="text-gray-600">
          Zadejte svůj e-mail a pošleme vám jednorázový přihlašovací odkaz.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {sent ? (
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-3">
            <Send size={24} />
          </div>
          <p className="text-gray-800 font-semibold mb-1">Odkaz je na cestě</p>
          <p className="text-gray-600 text-sm">
            Pokud k e-mailu <strong>{email.trim()}</strong> existuje účet, přišel na něj
            přihlašovací odkaz. Platí 15 minut.
          </p>
          <button
            onClick={() => setSent(false)}
            className="mt-4 text-primary font-semibold text-sm hover:underline"
          >
            Poslat znovu
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="vas@email.cz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80
                       focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                       text-gray-900 placeholder-gray-400"
          />
          <button
            type="submit"
            disabled={sending || !email.trim()}
            className="w-full bg-primary hover:bg-primary-dark text-white font-semibold
                       px-6 py-3 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending ? 'Odesílám...' : 'Poslat přihlašovací odkaz'}
          </button>
        </form>
      )}

      {microsoftEnabled && !sent && (
        <>
          <div className="flex items-center gap-3 my-5 text-gray-400 text-sm">
            <div className="flex-1 h-px bg-gray-200" />
            nebo
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <a
            href={`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-xl
                       bg-white border border-gray-200 text-gray-800 font-semibold
                       hover:bg-gray-50 transition-colors"
          >
            <MicrosoftIcon />
            Přihlásit se přes Microsoft
          </a>
        </>
      )}

      <p className="text-center text-gray-500 text-xs mt-6">
        Účty vytváří správce chaty — bez účtu jsou finance dostupné anonymně jen pro
        účastníky bez účtu.
      </p>
    </GlassCard>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
