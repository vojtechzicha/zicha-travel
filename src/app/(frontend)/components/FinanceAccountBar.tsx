'use client'

import { useState } from 'react'
import { LogOut, Shield, Mail, Check, ChevronDown } from 'lucide-react'
import type { Identity } from '@/lib/auth/identity'

interface FinanceAccountBarProps {
  identity: Identity
  redirect: string
  providers: string[]
}

export function FinanceAccountBar({ identity, redirect, providers }: FinanceAccountBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  if (identity.type === 'none') return null

  const logoutUrl = `/api/auth/logout?redirect=${encodeURIComponent(redirect)}`
  const linkUrl = (provider: string) =>
    `/api/auth/oauth/start?provider=${provider}&mode=link&redirect=${encodeURIComponent(redirect)}`

  const isAdmin = identity.type === 'admin'
  const name =
    identity.type === 'admin'
      ? identity.name
      : identity.type === 'participant'
        ? identity.participant.name
        : identity.accountName

  const emails =
    identity.type === 'participant' || identity.type === 'participant-unlinked'
      ? identity.emails
      : []

  return (
    <div className="w-full flex items-center justify-between gap-3 rounded-xl bg-white/70 backdrop-blur px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        {isAdmin ? (
          <Shield size={16} className="text-primary flex-shrink-0" />
        ) : (
          <Mail size={16} className="text-primary flex-shrink-0" />
        )}
        <span className="text-sm font-semibold text-gray-800 truncate">
          {isAdmin ? `Admin · ${name ?? ''}` : (name ?? 'Účastník')}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isAdmin && (
          <a
            href="/admin"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-white/80 transition-colors"
          >
            <Shield size={15} /> Do administrace
          </a>
        )}

        {!isAdmin && providers.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-white/80 transition-colors"
            >
              <Mail size={15} /> Přihlašovací e-maily <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white shadow-lg border border-gray-100 p-3 z-20">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Vaše e-maily</p>
                {emails.length === 0 ? (
                  <p className="text-sm text-gray-400 mb-3">Zatím žádné</p>
                ) : (
                  <ul className="mb-3 space-y-1">
                    {emails.map((e) => (
                      <li key={e} className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Check size={14} className="text-green-600" /> {e}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Přidat e-mail</p>
                <div className="flex flex-col gap-1.5">
                  {providers.map((p) => (
                    <a
                      key={p}
                      href={linkUrl(p)}
                      className="text-sm text-gray-700 hover:text-primary px-2 py-1.5 rounded-lg hover:bg-gray-50 capitalize"
                    >
                      {p}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <a
          href={logoutUrl}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-white/80 transition-colors"
        >
          <LogOut size={15} /> Odhlásit
        </a>
      </div>
    </div>
  )
}
