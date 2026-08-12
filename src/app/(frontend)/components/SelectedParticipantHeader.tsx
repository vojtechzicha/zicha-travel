'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Search, Crown, Check } from 'lucide-react'
import { getInitials, getAvatarColor } from '@/lib/formatCurrency'
import type { Participant } from '@/payload-types'

interface SelectedParticipantHeaderProps {
  selectedParticipant: Participant
  participants: Participant[]
  onChangeParticipant: (participantId: number) => void
  bankerId?: number | null
  /** false when the viewer may only see their own participant */
  canChange?: boolean
  /**
   * Fallback for "Změnit" when the dropdown has nothing else to offer
   * (e.g. one selectable participant + locked ones): clear the selection
   * and return to the full selector, which also shows the locked tiles.
   */
  onClearSelection?: () => void
}

export function SelectedParticipantHeader({
  selectedParticipant,
  participants,
  onChangeParticipant,
  bankerId,
  canChange = true,
  onClearSelection,
}: SelectedParticipantHeaderProps) {
  const t = useTranslations('chata.selectedParticipantHeader')
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
      {/* h-full: in the side-by-side row on wide screens the header shares a
          grid row with the claim banner and should match its height */}
      <div className="h-full flex items-center justify-between gap-2 bg-white/60 dark:bg-[#1b212c] dark:border dark:border-white/[0.06] backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-white text-lg font-bold ${avatarColor}`}
          >
            {getInitials(selectedParticipant.name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-serif text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                {selectedParticipant.name}
              </span>
              {isBanker && <Crown size={18} className="text-primary dark:text-primary-light shrink-0" />}
            </div>
          </div>
        </div>

        {canChange && (
          <button
            onClick={() =>
              participants.length > 1 ? setIsOpen(!isOpen) : onClearSelection?.()
            }
            className="flex items-center gap-1 shrink-0 px-3 py-2 rounded-lg
                       text-gray-600 hover:text-gray-900 hover:bg-white/80
                       dark:text-slate-300 dark:hover:text-gray-100 dark:hover:bg-white/[0.06]
                       transition-all font-medium"
          >
            {t('change')}
            <ChevronDown
              size={18}
              className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {canChange && isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50
                        bg-white rounded-xl shadow-2xl border border-gray-100
                        dark:bg-[#1b212c] dark:border-white/[0.07]
                        overflow-hidden">
          {/* Search input */}
          <div className="p-3 border-b border-gray-100 dark:border-white/[0.07]">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500"
                size={18}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200
                           dark:bg-white/[0.06] dark:border-white/[0.15]
                           focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                           text-gray-900 placeholder-gray-400 dark:text-gray-100 dark:placeholder-slate-500 text-sm"
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
                             ${isSelected ? 'bg-primary/10' : 'hover:bg-gray-50 dark:hover:bg-white/[0.06]'}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${pAvatarColor}`}
                  >
                    {getInitials(participant.name)}
                  </div>
                  <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">
                    {participant.name}
                  </span>
                  {participantIsBanker && (
                    <Crown size={14} className="text-primary dark:text-primary-light" />
                  )}
                  {isSelected && (
                    <Check size={18} className="text-primary dark:text-primary-light" />
                  )}
                </button>
              )
            })}

            {filteredParticipants.length === 0 && (
              <p className="text-center text-gray-500 dark:text-slate-400 py-4 text-sm">{t('noneFound')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
