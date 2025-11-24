'use client'

import { useState, useMemo } from 'react'
import { Search, Crown } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import type { Participant } from '@/payload-types'

interface ParticipantSelectorProps {
  participants: Participant[]
  onSelectParticipant: (participantId: number) => void
  bankerId?: number | null
}

export function ParticipantSelector({
  participants,
  onSelectParticipant,
  bankerId,
}: ParticipantSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')

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
              <span className="flex-1 truncate">{participant.name}</span>
              {isBanker && <Crown size={16} className="text-primary flex-shrink-0" />}
            </button>
          )
        })}
      </div>

      {/* No results message */}
      {filteredParticipants.length === 0 && (
        <p className="text-center text-gray-500 py-8">
          Žádný účastník neodpovídá hledání „{searchQuery}"
        </p>
      )}
    </GlassCard>
  )
}
