'use client'

import { useState, useMemo } from 'react'
import { Search, Crown, Lock } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import type { Participant } from '@/payload-types'

interface ParticipantSelectorProps {
  participants: Participant[]
  onSelectParticipant: (participantId: number) => void
  bankerId?: number | null
  /** participants locked behind login (active account) — shown greyed out */
  lockedParticipants?: Array<{ participant: Participant; maskedEmail: string }>
  /** quiet claim hints ("bez účtu") for anonymous-style selectors */
  showClaimHints?: boolean
  /** participant ids with a pending claim request */
  pendingClaimIds?: number[]
}

export function ParticipantSelector({
  participants,
  onSelectParticipant,
  bankerId,
  lockedParticipants = [],
  showClaimHints = false,
  pendingClaimIds = [],
}: ParticipantSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  // Locked tile the visitor tapped — reveals the full login hint below the
  // grid (the in-tile masked email is necessarily tiny)
  const [revealedLockedId, setRevealedLockedId] = useState<number | null>(null)

  // Send the visitor back HERE after they sign in (threaded through the
  // magic-link email and the OAuth flow via ?returnTo)
  const loginHref =
    typeof window !== 'undefined'
      ? `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
      : '/login'

  // Sort participants alphabetically by name
  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    [participants]
  )

  // Filter participants based on search query
  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return sortedParticipants
    const query = searchQuery.toLowerCase()
    return sortedParticipants.filter((p) => p.name.toLowerCase().includes(query))
  }, [sortedParticipants, searchQuery])

  // Locked participants follow the same sort + search
  const filteredLocked = useMemo(() => {
    const sorted = [...lockedParticipants].sort((a, b) =>
      a.participant.name.localeCompare(b.participant.name, 'cs')
    )
    if (!searchQuery.trim()) return sorted
    const query = searchQuery.toLowerCase()
    return sorted.filter(({ participant }) => participant.name.toLowerCase().includes(query))
  }, [lockedParticipants, searchQuery])

  return (
    <GlassCard padding="large" className="w-full">
      <div className="text-center mb-6">
        <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">
          Kdo jste?
        </h2>
        <p className="text-gray-600">
          Vyberte své jméno pro zobrazení vašich financí
        </p>
      </div>

      {/* Search input */}
      <div className="relative mb-6 max-w-md mx-auto">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          size={20}
        />
        <input
          type="text"
          placeholder="Hledat účastníka..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white/80
                     focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                     text-gray-900 placeholder-gray-400"
        />
      </div>

      {/* Participants grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filteredParticipants.map((participant) => {
          const isBanker = participant.id === bankerId
          const avatarColor = getAvatarColor(participant.name)
          // Quiet claim trail (the real entry is the banner after opening):
          // "bez účtu" for unlinked participants, a note when someone
          // already asked for this one
          const hasPendingClaim = showClaimHints && pendingClaimIds.includes(participant.id)
          const claimHint = hasPendingClaim
            ? 'někdo už požádal — jsi to ty? ozvi se taky'
            : showClaimHints && participant.account == null
              ? 'bez účtu'
              : null

          return (
            <button
              key={participant.id}
              onClick={() => onSelectParticipant(participant.id)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl font-semibold
                         transition-all text-left w-full
                         bg-white/80 text-gray-800 shadow-md
                         hover:bg-white hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor}`}
              >
                {getInitials(participant.name)}
              </div>
              <span className="flex-1 min-w-0">
                <span className="block truncate">{participant.name}</span>
                {claimHint && (
                  <span
                    className={`block text-[11px] font-normal truncate ${
                      hasPendingClaim ? 'text-amber-700' : 'text-gray-400'
                    }`}
                  >
                    {claimHint}
                  </span>
                )}
              </span>
              {isBanker && <Crown size={16} className="text-primary flex-shrink-0" />}
            </button>
          )
        })}
      </div>

      {/* No results message */}
      {filteredParticipants.length === 0 && participants.length > 0 && (
        <p className="text-center text-gray-500 py-8">
          Žádný účastník neodpovídá hledání „{searchQuery}"
        </p>
      )}

      {/* Everyone selectable has an account — point to login */}
      {participants.length === 0 && lockedParticipants.length > 0 && (
        <p className="text-center text-gray-500 py-8">
          Finance všech účastníků jsou přístupné po přihlášení.
        </p>
      )}

      {/* Participants locked behind login (their account is active) */}
      {filteredLocked.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4 text-gray-400 text-sm">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="flex items-center gap-1.5">
              <Lock size={13} /> Přístupné po přihlášení
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredLocked.map(({ participant, maskedEmail }) => {
              const isRevealed = revealedLockedId === participant.id
              return (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() =>
                    setRevealedLockedId(isRevealed ? null : participant.id)
                  }
                  title={`Pro zobrazení se přihlaste e-mailem ${maskedEmail}`}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold
                             text-left w-full bg-white/40 text-gray-400 shadow-sm
                             transition-all ${
                               isRevealed
                                 ? 'opacity-100 ring-2 ring-primary/50'
                                 : 'opacity-70 hover:opacity-100'
                             }`}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-300 text-white text-sm font-bold flex-shrink-0">
                    {getInitials(participant.name)}
                  </div>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{participant.name}</span>
                    <span className="block text-[11px] font-normal text-gray-400 truncate">
                      {maskedEmail}
                    </span>
                  </span>
                  <Lock size={14} className="flex-shrink-0" />
                </button>
              )
            })}
          </div>

          {/* Full-size hint for the tapped locked participant */}
          {(() => {
            const revealed = filteredLocked.find(
              ({ participant }) => participant.id === revealedLockedId
            )
            if (!revealed) {
              return (
                <p className="text-center text-gray-500 text-sm mt-4">
                  Klepnutím na zamčeného účastníka zobrazíte, jakým e-mailem se přihlásit.
                </p>
              )
            }
            return (
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3 bg-primary/10 border border-primary/25 rounded-xl px-5 py-4">
                <p className="text-sm text-gray-700 text-center sm:text-left">
                  Finance účastníka <strong>{revealed.participant.name}</strong> uvidíte po
                  přihlášení e-mailem{' '}
                  <strong className="whitespace-nowrap text-base">{revealed.maskedEmail}</strong>.
                </p>
                <a
                  href={loginHref}
                  className="flex-none bg-primary hover:bg-primary-dark text-white font-semibold
                             px-5 py-2.5 rounded-xl transition-colors text-sm"
                >
                  Přihlásit se
                </a>
              </div>
            )
          })()}
        </div>
      )}
    </GlassCard>
  )
}
