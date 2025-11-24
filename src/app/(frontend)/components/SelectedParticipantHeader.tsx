'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, Crown, Check } from 'lucide-react'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import type { Participant } from '@/payload-types'

interface SelectedParticipantHeaderProps {
  selectedParticipant: Participant
  participants: Participant[]
  onChangeParticipant: (participantId: number) => void
  bankerId?: number | null
}

export function SelectedParticipantHeader({
  selectedParticipant,
  participants,
  onChangeParticipant,
  bankerId,
}: SelectedParticipantHeaderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const avatarColor = getAvatarColor(selectedParticipant.name)
  const isBanker = selectedParticipant.id === bankerId

  // Sort and filter participants
  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    [participants]
  )

  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return sortedParticipants
    const query = searchQuery.toLowerCase()
    return sortedParticipants.filter((p) => p.name.toLowerCase().includes(query))
  }, [sortedParticipants, searchQuery])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  const handleSelect = (participantId: number) => {
    onChangeParticipant(participantId)
    setIsOpen(false)
    setSearchQuery('')
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected participant display */}
      <div className="flex items-center justify-between gap-4 bg-white/60 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold ${avatarColor}`}
          >
            {getInitials(selectedParticipant.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif text-xl font-bold text-gray-900">
                {selectedParticipant.name}
              </span>
              {isBanker && <Crown size={18} className="text-primary" />}
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 px-3 py-2 rounded-lg
                     text-gray-600 hover:text-gray-900 hover:bg-white/80
                     transition-all font-medium"
        >
          Změnit
          <ChevronDown
            size={18}
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50
                        bg-white rounded-xl shadow-2xl border border-gray-100
                        overflow-hidden">
          {/* Search input */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Hledat účastníka..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200
                           focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           text-gray-900 placeholder-gray-400 text-sm"
              />
            </div>
          </div>

          {/* Participants list */}
          <div className="max-h-64 overflow-y-auto">
            {filteredParticipants.map((participant) => {
              const isSelected = participant.id === selectedParticipant.id
              const participantIsBanker = participant.id === bankerId
              const pAvatarColor = getAvatarColor(participant.name)

              return (
                <button
                  key={participant.id}
                  onClick={() => handleSelect(participant.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left
                             transition-colors
                             ${isSelected ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${pAvatarColor}`}
                  >
                    {getInitials(participant.name)}
                  </div>
                  <span className="flex-1 font-medium text-gray-900">
                    {participant.name}
                  </span>
                  {participantIsBanker && (
                    <Crown size={14} className="text-primary" />
                  )}
                  {isSelected && (
                    <Check size={18} className="text-primary" />
                  )}
                </button>
              )
            })}

            {filteredParticipants.length === 0 && (
              <p className="text-center text-gray-500 py-4 text-sm">
                Žádný účastník nenalezen
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
