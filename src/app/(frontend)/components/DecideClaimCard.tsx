'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'

interface DecideClaimCardProps {
  token: string
  participantName: string
  chataName: string
  requesterEmail: string
  requestedAt: string
  otherPendingCount: number
  requesterLinkedCount: number
  /** approving replaces an admin-created, never-used account link */
  replacesInactiveAccount: boolean
}

const ERROR_MESSAGES: Record<string, string> = {
  expired: 'Odkaz vypršel — platí 7 dní. Žádost najdete v administraci.',
  invalid: 'Odkaz je neplatný. Použijte prosím odkaz z e-mailu.',
  forbidden: 'Tuto chatu už nespravujete — požádejte jiného správce.',
  'already-decided': 'Žádost už mezitím někdo vyřídil.',
  conflict:
    'Účastník už je propojený s jiným aktivním účtem — žádost nejde schválit. ' +
    'Případný omyl vyřešte v administraci.',
  'reason-required': 'Napište prosím důvod zamítnutí — pošleme ho žadateli.',
  'not-found': 'Žádost už neexistuje.',
}

/**
 * "Někdo říká, že je Katka" — the admin decision card. Approve is one
 * click; reject asks for a mandatory reason that is emailed to the
 * requester.
 */
export function DecideClaimCard({
  token,
  participantName,
  chataName,
  requesterEmail,
  requestedAt,
  otherPendingCount,
  requesterLinkedCount,
  replacesInactiveAccount,
}: DecideClaimCardProps) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'approve' | 'reject' | null>(null)

  const requestedAtText = new Date(requestedAt).toLocaleString('cs-CZ', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  const decide = async (action: 'approve' | 'reject') => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/claim-requests/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, ...(action === 'reject' ? { reason } : {}) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(ERROR_MESSAGES[data?.error] || 'Akce se nezdařila. Zkuste to prosím znovu.')
        return
      }
      setDone(action)
    } catch {
      setError('Akce se nezdařila. Zkuste to prosím znovu.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <GlassCard padding="large" className="w-full max-w-md text-center">
        <div
          className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-4 ${
            done === 'approve' ? 'bg-green-100 text-green-600' : 'bg-red-50 text-red-500'
          }`}
        >
          {done === 'approve' ? <Check size={28} /> : <X size={28} />}
        </div>
        <h1 className="font-serif text-2xl font-bold text-gray-900 mb-2">
          {done === 'approve' ? 'Schváleno' : 'Zamítnuto'}
        </h1>
        <p className="text-gray-600">
          {done === 'approve'
            ? `${participantName} je teď propojený s účtem ${requesterEmail}. Žadateli jsme dali vědět e-mailem.`
            : 'Žadateli jsme poslali e-mail s vaším zdůvodněním.'}
        </p>
      </GlassCard>
    )
  }

  return (
    <GlassCard padding="large" className="w-full max-w-md">
      <h1 className="font-serif text-2xl font-bold text-gray-900 mb-1">
        Někdo říká, že je {participantName}
      </h1>
      <p className="text-gray-600 text-sm mb-4">
        Na chatě <strong>{chataName}</strong> se k účastníkovi hlásí účet{' '}
        <strong>{requesterEmail}</strong> (e-mail ověřený,{' '}
        {requesterLinkedCount > 0
          ? 'účet už má propojené účastníky'
          : 'účet nový — zatím bez propojených účastníků'}
        ). Sedí to?
      </p>

      <div className="flex items-center gap-3 bg-white/70 border border-gray-200 rounded-xl px-4 py-3 mb-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${getAvatarColor(participantName)}`}
        >
          {getInitials(participantName)}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 truncate">
            {participantName} → {requesterEmail}
          </div>
          <div className="text-xs text-gray-500">
            žádost z {requestedAtText} •{' '}
            {otherPendingCount > 0
              ? `pozor: čeká ještě ${otherPendingCount} další žádost(i)`
              : 'žádná další žádost nečeká'}
          </div>
        </div>
      </div>

      {replacesInactiveAccount && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          Účastník má připravený účet, který se nikdy nepřihlásil — schválením ho nahradíte tímto
          novým propojením.
        </div>
      )}

      {error && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {rejecting ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Důvod zamítnutí — pošleme ho žadateli (např. „Katka už mi psala z jiné adresy — ozvi se mi, jestli jde o omyl.“)"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80
                       focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                       text-gray-900 placeholder-gray-400 text-sm"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => decide('reject')}
              disabled={busy || !reason.trim()}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-3
                         rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? 'Odesílám...' : 'Zamítnout s tímto důvodem'}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              disabled={busy}
              className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold
                         hover:bg-white/60 transition-colors"
            >
              Zpět
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => decide('approve')}
            disabled={busy}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-3
                       rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? 'Pracuji...' : 'Ano, schválit'}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="flex-1 bg-white border-2 border-red-200 text-red-700 font-semibold px-4 py-3
                       rounded-xl hover:bg-red-50 transition-colors"
          >
            Zamítnout…
          </button>
        </div>
      )}

      <p className="text-center text-gray-500 text-xs mt-5">
        Schválení propojí účastníka s účtem a automaticky zamítne případné další žádosti. Frontu
        žádostí najdete i v administraci pod „Claim Requests".
      </p>
    </GlassCard>
  )
}
