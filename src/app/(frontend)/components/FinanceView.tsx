'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { ParticipantSelector } from './ParticipantSelector'
import { SelectedParticipantHeader } from './SelectedParticipantHeader'
import { ExpensesFeed } from './ExpensesFeed'
import { PersonView } from './PersonView'
import { FinanceViewSkeleton } from './Skeleton'
import { FinanceLoginPrompt } from './FinanceLoginPrompt'
import { FinanceAccountBar } from './FinanceAccountBar'
import { GlassCard } from './GlassCard'
import type { Chata, Participant, Expense, Prepayment } from '@/payload-types'
import type { ChataStats } from '@/utils/calculateStats'
import type { Identity } from '@/lib/auth/identity'

interface FinanceViewProps {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  prepayments: Prepayment[]
  stats: ChataStats
  identity: Identity | null
  urlParticipantId?: number | null
  onParticipantChange?: (participantId: number | null) => void
}

// localStorage key prefix for selected participant (admin-only convenience)
const STORAGE_KEY_PREFIX = 'chata-selected-participant-'

export function FinanceView({
  chata,
  participants,
  expenses,
  prepayments,
  stats,
  identity,
  urlParticipantId,
  onParticipantChange,
}: FinanceViewProps) {
  const searchParams = useSearchParams()
  const [redirect, setRedirect] = useState('/')

  useEffect(() => {
    // Path to return to after login/logout flows.
    setRedirect(`${window.location.pathname}?view=finance`)
  }, [])

  // Handle banker ID
  const bankerId =
    typeof chata.banker === 'object' && chata.banker !== null ? chata.banker.id : chata.banker

  // Identity still loading
  if (identity === null) {
    return <FinanceViewSkeleton />
  }

  // Not logged in → login prompt
  if (identity.type === 'none') {
    return (
      <FinanceLoginPrompt
        redirect={redirect}
        providers={identity.providers}
        notFound={searchParams.get('login') === 'notfound'}
      />
    )
  }

  // Logged in but this account isn't a participant of this chata
  if (identity.type === 'participant-unlinked') {
    return (
      <div className="w-full flex flex-col gap-6">
        <FinanceAccountBar identity={identity} redirect={redirect} providers={identity.providers} />
        <GlassCard padding="large" className="w-full max-w-lg mx-auto text-center">
          <h2 className="font-serif text-xl font-bold text-gray-900 mb-2">
            Nejste účastníkem této chaty
          </h2>
          <p className="text-gray-600">
            Tímto účtem nejste mezi účastníky této chaty. Použijte prosím odkaz pro přihlášení, který
            vám poslal organizátor.
          </p>
        </GlassCard>
      </div>
    )
  }

  // Logged-in participant → only their own finances, no selector
  if (identity.type === 'participant') {
    return (
      <ParticipantFinance
        chata={chata}
        participants={participants}
        expenses={expenses}
        prepayments={prepayments}
        stats={stats}
        participantId={identity.participant.id}
        bankerId={bankerId}
        accountBar={
          <FinanceAccountBar identity={identity} redirect={redirect} providers={identity.providers} />
        }
      />
    )
  }

  // Admin → full finance view with participant selector (legacy behaviour)
  return (
    <AdminFinance
      chata={chata}
      participants={participants}
      expenses={expenses}
      prepayments={prepayments}
      stats={stats}
      bankerId={bankerId}
      urlParticipantId={urlParticipantId}
      onParticipantChange={onParticipantChange}
      accountBar={
        <FinanceAccountBar identity={identity} redirect={redirect} providers={identity.providers} />
      }
    />
  )
}

// --- Participant: locked to their own PersonView ---

function ParticipantFinance({
  chata,
  participants,
  expenses,
  prepayments,
  stats,
  participantId,
  bankerId,
  accountBar,
}: {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  prepayments: Prepayment[]
  stats: ChataStats
  participantId: number
  bankerId?: number | null
  accountBar: React.ReactNode
}) {
  const participant = participants.find((p) => p.id === participantId)
  const participantStats = participant ? stats.participants[participant.name] : null

  if (!participant || !participantStats) {
    return (
      <div className="w-full flex flex-col gap-6">
        {accountBar}
        <GlassCard padding="large" className="w-full max-w-lg mx-auto text-center">
          <p className="text-gray-600">Vaše finanční údaje nejsou k dispozici.</p>
        </GlassCard>
      </div>
    )
  }

  const isBanker = participant.id === bankerId

  return (
    <div className="w-full flex flex-col gap-6">
      {accountBar}
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 flex flex-col gap-8">
        <aside className="order-2 lg:order-1">
          <ExpensesFeed expenses={expenses} selectedParticipantId={participantId} />
        </aside>
        <section className="flex-1 order-1 lg:order-2">
          <PersonView
            participant={participant}
            stats={participantStats}
            isBanker={isBanker}
            chata={chata}
            allParticipants={participants}
            creditors={stats.creditors}
            debtors={stats.debtors}
            prepayments={prepayments}
            expenses={expenses}
            showHeader={true}
          />
        </section>
      </div>
    </div>
  )
}

// --- Admin: existing selector-driven view ---

function AdminFinance({
  chata,
  participants,
  expenses,
  prepayments,
  stats,
  bankerId,
  urlParticipantId,
  onParticipantChange,
  accountBar,
}: {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  prepayments: Prepayment[]
  stats: ChataStats
  bankerId?: number | null
  urlParticipantId?: number | null
  onParticipantChange?: (participantId: number | null) => void
  accountBar: React.ReactNode
}) {
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    if (urlParticipantId != null) {
      const participantExists = participants.some((p) => p.id === urlParticipantId)
      if (participantExists) {
        setSelectedParticipantId(urlParticipantId)
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${chata.id}`, String(urlParticipantId))
        setIsHydrated(true)
        return
      }
    }

    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${chata.id}`)
    if (stored) {
      const storedId = parseInt(stored, 10)
      if (participants.some((p) => p.id === storedId)) {
        setSelectedParticipantId(storedId)
        onParticipantChange?.(storedId)
      }
    }
    setIsHydrated(true)
  }, [chata.id, participants, urlParticipantId, onParticipantChange])

  const handleSelectParticipant = (participantId: number) => {
    setSelectedParticipantId(participantId)
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${chata.id}`, String(participantId))
    onParticipantChange?.(participantId)
  }

  if (!isHydrated) {
    return <FinanceViewSkeleton />
  }

  if (!selectedParticipantId) {
    return (
      <div className="w-full flex flex-col gap-6">
        {accountBar}
        <ParticipantSelector
          participants={participants}
          onSelectParticipant={handleSelectParticipant}
          bankerId={bankerId}
        />
      </div>
    )
  }

  const selectedParticipant = participants.find((p) => p.id === selectedParticipantId)
  const selectedStats = selectedParticipant ? stats.participants[selectedParticipant.name] : null

  if (!selectedParticipant || !selectedStats) {
    setSelectedParticipantId(null)
    return null
  }

  const isBanker = selectedParticipant.id === bankerId

  return (
    <div className="w-full flex flex-col gap-6">
      {accountBar}
      <SelectedParticipantHeader
        selectedParticipant={selectedParticipant}
        participants={participants}
        onChangeParticipant={handleSelectParticipant}
        bankerId={bankerId}
      />

      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 flex flex-col gap-8">
        <aside className="order-2 lg:order-1">
          <ExpensesFeed expenses={expenses} selectedParticipantId={selectedParticipantId} />
        </aside>
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
