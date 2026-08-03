'use client'

import { useState, useEffect, useMemo } from 'react'
import { ParticipantSelector } from './ParticipantSelector'
import { SelectedParticipantHeader } from './SelectedParticipantHeader'
import { ExpensesFeed } from './ExpensesFeed'
import { PersonView } from './PersonView'
import { FinanceViewSkeleton } from './Skeleton'
import {
  anonymousViewer,
  selectableParticipants,
  type FinanceViewer,
  type LockedParticipant,
} from '@/lib/financeAccess'
import type { Chata, Participant, Expense, Prepayment } from '@/payload-types'
import type { ChataStats } from '@/utils/calculateStats'

interface FinanceViewProps {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  prepayments: Prepayment[]
  stats: ChataStats
  viewer?: FinanceViewer
  locked?: LockedParticipant[]
  urlParticipantId?: number | null
  onParticipantChange?: (participantId: number | null) => void
}

// localStorage key prefix for selected participant
const STORAGE_KEY_PREFIX = 'chata-selected-participant-'

export function FinanceView({
  chata,
  participants,
  expenses,
  prepayments,
  stats,
  viewer = anonymousViewer,
  locked = [],
  urlParticipantId,
  onParticipantChange,
}: FinanceViewProps) {
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  // Handle banker ID
  const bankerId =
    typeof chata.banker === 'object' && chata.banker !== null
      ? chata.banker.id
      : chata.banker

  // Which participants this viewer may open: admins of the chata see all,
  // a linked user only their own, anonymous everyone except locked
  // participants — active accounts (see lib/financeAccess)
  const allowedParticipants = useMemo(
    () => selectableParticipants(viewer, participants, locked),
    [viewer, participants, locked]
  )

  // Locked participants shown greyed-out at the bottom of the selector —
  // only relevant for the anonymous-style selector (admins see everyone;
  // linked users never reach the selector)
  const lockedForSelector = useMemo(() => {
    if (viewer.canViewAll || viewer.linkedParticipantIds.length > 0) return []
    return locked.flatMap((l) => {
      const participant = participants.find((p) => p.id === l.id)
      return participant ? [{ participant, maskedEmail: l.maskedEmail }] : []
    })
  }, [viewer, participants, locked])

  // Load from URL param (priority), localStorage, or the viewer's own
  // linked participant on mount — always restricted to the allowed set
  useEffect(() => {
    const storageKey = `${STORAGE_KEY_PREFIX}${chata.id}`
    const isAllowed = (id: number) => allowedParticipants.some((p) => p.id === id)

    // URL param takes priority over localStorage
    if (urlParticipantId != null && isAllowed(urlParticipantId)) {
      setSelectedParticipantId(urlParticipantId)
      // Also save to localStorage so it persists
      localStorage.setItem(storageKey, String(urlParticipantId))
      setIsHydrated(true)
      return
    }

    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const storedId = parseInt(stored, 10)
      if (isAllowed(storedId)) {
        setSelectedParticipantId(storedId)
        // Sync URL with localStorage selection
        onParticipantChange?.(storedId)
        setIsHydrated(true)
        return
      }
    }

    // Signed-in with linked participant(s): preselect the first own one
    // (plain users can then switch only among their own; admins among all)
    const ownDefault = viewer.linkedParticipantIds.find((id) => isAllowed(id))
    if (ownDefault != null) {
      setSelectedParticipantId(ownDefault)
      localStorage.setItem(storageKey, String(ownDefault))
      onParticipantChange?.(ownDefault)
    }

    setIsHydrated(true)
  }, [chata.id, allowedParticipants, urlParticipantId, onParticipantChange, viewer.linkedParticipantIds])

  // Save to localStorage and notify parent when selection changes
  const handleSelectParticipant = (participantId: number) => {
    if (!allowedParticipants.some((p) => p.id === participantId)) return
    setSelectedParticipantId(participantId)
    const storageKey = `${STORAGE_KEY_PREFIX}${chata.id}`
    localStorage.setItem(storageKey, String(participantId))
    onParticipantChange?.(participantId)
  }

  // Show skeleton during hydration (very brief, usually unnoticeable)
  if (!isHydrated) {
    return <FinanceViewSkeleton />
  }

  // State 1: No participant selected - show full-width selector
  if (!selectedParticipantId) {
    return (
      <div className="w-full">
        <ParticipantSelector
          participants={allowedParticipants}
          onSelectParticipant={handleSelectParticipant}
          bankerId={bankerId}
          lockedParticipants={lockedForSelector}
        />
      </div>
    )
  }

  // State 2: Participant selected - show compact header + content
  const selectedParticipant = allowedParticipants.find((p) => p.id === selectedParticipantId)
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
        participants={allowedParticipants}
        onChangeParticipant={handleSelectParticipant}
        bankerId={bankerId}
        canChange={allowedParticipants.length > 1}
      />

      {/* Main content area */}
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 flex flex-col gap-8">
        {/* Sidebar - now only expenses */}
        <aside className="order-2 lg:order-1">
          <ExpensesFeed expenses={expenses} selectedParticipantId={selectedParticipantId} />
        </aside>

        {/* Main content */}
        <section className="flex-1 order-1 lg:order-2 min-w-0">
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
