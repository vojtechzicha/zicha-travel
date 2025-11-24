'use client'

import { useState } from 'react'
import { ParticipantList } from './ParticipantList'
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

export function FinanceView({
  chata,
  participants,
  expenses,
  prepayments,
  stats,
}: FinanceViewProps) {
  // Default to banker or first participant
  const defaultBankerId = typeof chata.banker === 'object' && chata.banker !== null
    ? chata.banker.id
    : chata.banker
  const defaultParticipant = participants.find((p) => p.id === defaultBankerId) || participants[0]
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>(
    defaultParticipant?.id || ''
  )

  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId)
  const selectedStats = selectedParticipant
    ? stats.participants[selectedParticipant.name]
    : null

  if (!selectedParticipant || !selectedStats) {
    return (
      <div className="text-center text-white py-20">
        <p>Načítání...</p>
      </div>
    )
  }

  // Handle banker being either an ID string or a populated object
  const bankerId = typeof chata.banker === 'object' && chata.banker !== null
    ? chata.banker.id
    : chata.banker
  const isBanker = selectedParticipant.id === bankerId

  return (
    <div className="w-full lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 flex flex-col gap-8">
      {/* Sidebar */}
      <aside className="flex flex-col gap-8">
        <ParticipantList
          participants={participants}
          selectedParticipantId={selectedParticipantId}
          onSelectParticipant={setSelectedParticipantId}
          bankerId={bankerId}
        />
        <ExpensesFeed expenses={expenses} />
      </aside>

      {/* Main content */}
      <section className="flex-1">
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
        />
      </section>
    </div>
  )
}
