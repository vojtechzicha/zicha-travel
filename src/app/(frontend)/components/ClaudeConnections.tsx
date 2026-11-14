'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, Copy } from 'lucide-react'

// The /claude page body (docs/MCP.md): how to connect, and the account's
// connected apps with "Odpojit". Reads and revokes through
// /api/mcp/connections (session cookie, own grants only).

interface Connection {
  id: string
  clientName: string
  canWrite: boolean
  createdAt: string
  lastUsedAt: string | null
}

function CopyBox({ value }: { value: string }) {
  const t = useTranslations('connector.page')
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard refused (insecure context); the text stays selectable
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 p-2 pl-3">
      <code className="flex-1 min-w-0 break-all text-sm text-gray-900">{value}</code>
      <button
        type="button"
        onClick={copy}
        className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
      >
        {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
        {copied ? t('copied') : t('copy')}
      </button>
    </div>
  )
}

export function ClaudeConnections({ mcpUrl }: { mcpUrl: string }) {
  const t = useTranslations('connector.page')
  const locale = useLocale()
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/connections', { credentials: 'same-origin', cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { connections: Connection[] }
      setConnections(json.connections)
    } catch {
      setError(t('loadFailed'))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const disconnect = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch('/api/mcp/connections', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoke: id }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setConnections((list) => (list ?? []).filter((c) => c.id !== id))
    } catch {
      setError(t('disconnectFailed'))
    }
    setBusy(null)
  }

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

  const command = `claude mcp add --transport http --scope user zicha-travel ${mcpUrl}`

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-serif text-lg font-bold text-gray-900 mb-2">{t('claudeAiTitle')}</h2>
        <p className="text-gray-600 mb-3">{t('claudeAiSteps')}</p>
        <CopyBox value={mcpUrl} />
      </section>

      <section>
        <h2 className="font-serif text-lg font-bold text-gray-900 mb-2">{t('claudeCodeTitle')}</h2>
        <p className="text-gray-600 mb-3">{t('claudeCodeSteps')}</p>
        <CopyBox value={command} />
      </section>

      <section>
        <h2 className="font-serif text-lg font-bold text-gray-900 mb-3">{t('connectionsTitle')}</h2>
        {error && (
          <p role="alert" className="mb-3 rounded-xl bg-red-50 text-red-700 text-sm p-3">
            {error}
          </p>
        )}
        {connections === null && !error && <div className="h-16 rounded-xl bg-gray-100 animate-pulse" />}
        {connections?.length === 0 && <p className="text-gray-500">{t('empty')}</p>}
        <ul className="space-y-2">
          {connections?.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3"
            >
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 truncate">{c.clientName}</div>
                <div className="text-sm text-gray-500">
                  {c.canWrite ? t('canWrite') : t('readOnly')} · {t('connectedOn', { date: date(c.createdAt) })}
                  {c.lastUsedAt && <> · {t('lastUsed', { date: date(c.lastUsedAt) })}</>}
                </div>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => disconnect(c.id)}
                className="flex-shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {busy === c.id ? t('disconnecting') : t('disconnect')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
