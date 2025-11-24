'use client'

import { User, Crown } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import type { Participant } from '@/payload-types'

interface ParticipantListProps {
  participants: Participant[]
  selectedParticipantId: string | null
  onSelectParticipant: (participantId: string) => void
  bankerId?: string
}

export function ParticipantList({
  participants,
  selectedParticipantId,
  onSelectParticipant,
  bankerId,
}: ParticipantListProps) {
  return (
    <GlassCard padding="medium">
      <h3 className="font-serif text-xl font-bold text-gray-900 mb-4">
        Účastníci
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
        {participants.map((participant) => {
          const isSelected = participant.id === selectedParticipantId
          const isBanker = participant.id === bankerId
          const avatarColor = getAvatarColor(participant.name)

          return (
            <button
              key={participant.id}
              onClick={() => onSelectParticipant(participant.id)}
              className={`
                flex items-center gap-3 px-3 py-2 rounded-xl font-semibold
                transition-all text-left w-full
                ${
                  isSelected
                    ? 'bg-primary text-white shadow-lg shadow-primary/40 hover:-translate-y-0.5'
                    : 'bg-white/80 text-gray-800 shadow-md hover:bg-white hover:-translate-y-0.5'
                }
              `}
            >
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0
                  ${isSelected ? 'bg-white/20' : avatarColor}
                `}
              >
                {getInitials(participant.name)}
              </div>
              <span className="flex-1 truncate">{participant.name}</span>
              {isBanker && (
                <Crown
                  size={16}
                  className={isSelected ? 'text-white' : 'text-primary'}
                />
              )}
            </button>
          )
        })}
      </div>
    </GlassCard>
  )
}
