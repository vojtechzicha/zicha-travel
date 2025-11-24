'use client'

import { useState, useEffect } from 'react'
import { ParticipantSelector } from './ParticipantSelector'
import { SelectedParticipantHeader } from './SelectedParticipantHeader'
import { ExpensesFeed } from './ExpensesFeed'
import { PersonView } from './PersonView'
import type { Chata, Participant, Expense, Prepayment } from '@/payload-types'
import type { ChataStats } from '@/utils/calculateStats'

interface FinanceViewProps {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  prepayments: Prepayment[]
  stats: ChataStats
}

// localStorage key prefix for selected participant
const STORAGE_KEY_PREFIX = 'chata-selected-participant-'

export function FinanceView({
  chata,
  participants,
  expenses,
  prepayments,
  stats,
}: FinanceViewProps) {
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  // Handle banker ID
  const bankerId =
    typeof chata.banker === 'object' && chata.banker !== null
      ? chata.banker.id
      : chata.banker

  // Load from localStorage on mount
  useEffect(() => {
    const storageKey = `${STORAGE_KEY_PREFIX}${chata.id}`
    const stored = localStorage.getItem(storageKey)

    if (stored) {
      const storedId = parseInt(stored, 10)
      // Verify the stored participant still exists
      const participantExists = participants.some((p) => p.id === storedId)
      if (participantExists) {
        setSelectedParticipantId(storedId)
      }
    }

    setIsHydrated(true)
  }, [chata.id, participants])

  // Save to localStorage when selection changes
  const handleSelectParticipant = (participantId: number) => {
    setSelectedParticipantId(participantId)
    const storageKey = `${STORAGE_KEY_PREFIX}${chata.id}`
    localStorage.setItem(storageKey, String(participantId))
  }

  // Show loading state during hydration
  if (!isHydrated) {
    return (
      <div className="text-center text-white py-20">
        <p>Načítání...</p>
      </div>
    )
  }

  // State 1: No participant selected - show full-width selector
  if (!selectedParticipantId) {
    return (
      <div className="w-full">
        <ParticipantSelector
          participants={participants}
          onSelectParticipant={handleSelectParticipant}
          bankerId={bankerId}
        />
      </div>
    )
  }

  // State 2: Participant selected - show compact header + content
  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId)
  const selectedStats = selectedParticipant
    ? stats.participants[selectedParticipant.name]
    : null

  if (!selectedParticipant || !selectedStats) {
    // Selected participant no longer exists, reset selection
    setSelectedParticipantId(null)
    return null
  }

  const isBanker = selectedParticipant.id === bankerId

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Compact participant header - full width */}
      <SelectedParticipantHeader
        selectedParticipant={selectedParticipant}
        participants={participants}
        onChangeParticipant={handleSelectParticipant}
        bankerId={bankerId}
      />

      {/* Main content area */}
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 flex flex-col gap-8">
        {/* Sidebar - now only expenses */}
        <aside className="order-2 lg:order-1">
          <ExpensesFeed expenses={expenses} />
        </aside>

        {/* Main content */}
        <section className="flex-1 order-1 lg:order-2">
          <PersonView
            participant={selectedParticipant}
            stats={selectedStats}
            isBanker={isBanker}
            chata={chata}
            allParticipants={participants}
            creditors={stats.creditors}
            debtors={stats.debtors}
            prepayments={prepayments}
            expenses={expenses}
            showHeader={false}
          />
        </section>
      </div>
    </div>
  )
}
