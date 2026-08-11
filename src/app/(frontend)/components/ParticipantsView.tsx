'use client'

import { useMemo } from 'react'
import { Users, Moon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Chata, Participant } from '@/payload-types'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import {
  participantHasPet,
  getOccupantParticipant,
  getOccupantNights,
  getTripNights,
} from '../utils/participantHelpers'

interface ParticipantsViewProps {
  chata: Chata
  participants: Participant[]
}

interface ParticipantNightInfo {
  nights: number
  isPartialStay: boolean
}

function buildParticipantNightMap(chata: Chata): Map<number, ParticipantNightInfo> {
  const totalNights = getTripNights(chata)
  const nightMap = new Map<number, ParticipantNightInfo>()

  if (totalNights === 0) return nightMap

  const rooms = chata.rooms || []
  for (const room of rooms) {
    for (const bed of room.beds || []) {
      for (const occupant of bed.occupants || []) {
        const participant = getOccupantParticipant(occupant)
        if (!participant) continue

        const occupantNights = getOccupantNights(occupant)
        const stayNights = occupantNights ? occupantNights.length : totalNights

        // If participant appears in multiple beds, take the maximum
        const existing = nightMap.get(participant.id)
        if (!existing || stayNights > existing.nights) {
          nightMap.set(participant.id, {
            nights: stayNights,
            isPartialStay: occupantNights !== null && stayNights < totalNights,
          })
        }
      }
    }
  }

  return nightMap
}

export function ParticipantsView({ chata, participants }: ParticipantsViewProps) {
  const t = useTranslations('trip')
  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    [participants],
  )

  const nightMap = useMemo(() => buildParticipantNightMap(chata), [chata])

  const totalNights = getTripNights(chata)

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-6 sm:p-10 max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary-light/20 to-primary-light/40 rounded-2xl p-6 sm:p-10 text-center mb-8 border-2 border-primary/10">
        <Users size={48} className="mx-auto text-primary mb-4" />
        <h2 className="font-serif text-2xl sm:text-3xl font-black text-gray-900 mb-6">
          {t('participants.title')}
        </h2>
        <div className="flex justify-center gap-4 sm:gap-8 flex-wrap">
          <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-md min-w-[120px]">
            <span className="text-3xl block mb-1">👥</span>
            <span className="text-2xl font-bold text-primary font-serif">
              {participants.length}
            </span>
            <span className="block text-sm text-gray-600 font-medium">
              {t('participants.participantsCountLabel', { count: participants.length })}
            </span>
          </div>
          {totalNights > 0 && (
            <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-md min-w-[120px]">
              <span className="text-3xl block mb-1">🌙</span>
              <span className="text-2xl font-bold text-primary font-serif">{totalNights}</span>
              <span className="block text-sm text-gray-600 font-medium">
                {t('participants.nightsCountLabel', { count: totalNights })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Participant Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {sortedParticipants.map((participant) => {
          const nightInfo = nightMap.get(participant.id)
          const hasPet = participantHasPet(participant)
          const avatarColor = getAvatarColor(participant.name)

          return (
            <div
              key={participant.id}
              className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100"
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor}`}
              >
                {getInitials(participant.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate">
                  {participant.name}
                  {hasPet && ' + 🐕'}
                </div>
                {nightInfo && totalNights > 0 && (
                  <div className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                    <Moon size={14} />
                    {nightInfo.isPartialStay
                      ? t('participants.partialStay', {
                          nights: nightInfo.nights,
                          total: totalNights,
                        })
                      : t('participants.wholeStay')}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
