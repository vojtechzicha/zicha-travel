'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Receipt, ArrowLeft, Clock, HeartHandshake, FileText, X } from 'lucide-react'
import { formatCurrency } from '@/lib/formatCurrency'
import { getPayerDisplay } from '@/lib/payerRef'
import { akuzativName } from '@/lib/czechNames'
import type { Expense, ExpenseAttachment } from '@/payload-types'

const MAX_VISIBLE_OTHERS = 5

interface ExpenseCardProps {
  expense: Expense
  isMine?: boolean
  showAll?: boolean
  selectedParticipantId?: number | null
}

export function ExpenseCard({
  expense,
  isMine = true,
  showAll = false,
  selectedParticipantId,
}: ExpenseCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [lightboxAttachment, setLightboxAttachment] = useState<ExpenseAttachment | null>(null)
  const isRefund = expense.amount < 0
  const isPlanned = expense.isPlanned || false
  const payer = getPayerDisplay(expense.payer)
  const payerName = payer.name

  // Muted styling for "other" expenses when showing all
  const isOther = showAll && !isMine

  // Process weights for display. When the weights add up to the expense
  // amount (within the usual 1 Kč tolerance), they are Kč amounts, not
  // abstract multipliers — show them as currency
  const weights = expense.weights ?? []
  const weightsSum = weights.reduce((sum, w) => sum + (w.weight ?? 0), 0)
  const weightsAreAmounts = weights.length > 0 && Math.abs(weightsSum - expense.amount) <= 1
  const myWeight = weights.find((w) => {
    const participantId =
      typeof w.participant === 'object' && w.participant !== null
        ? w.participant.id
        : w.participant
    return participantId === selectedParticipantId
  })
  const otherWeights = weights.filter((w) => {
    const participantId =
      typeof w.participant === 'object' && w.participant !== null
        ? w.participant.id
        : w.participant
    return participantId !== selectedParticipantId
  })

  // Invitations ("pozvání") - the host covers the guest's share. Standing
  // "paid by" arrangements (auto, e.g. a parent paying for a child) are a
  // permanent fact, not news — only one-off invitations get a badge
  const invitations = (expense.invitations ?? []).filter(
    (inv) =>
      !inv.auto &&
      typeof inv.host === 'object' &&
      inv.host !== null &&
      typeof inv.guest === 'object' &&
      inv.guest !== null
  )

  // Attachments ("účtenky") arrive populated via depth: 1 in the chata API
  const attachments = (expense.attachments ?? []).filter(
    (a): a is ExpenseAttachment => typeof a === 'object' && a !== null && !!a.url
  )

  useEffect(() => {
    if (!lightboxAttachment) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxAttachment(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [lightboxAttachment])

  const totalOthers = otherWeights.length
  const visibleOthers = expanded ? otherWeights : otherWeights.slice(0, MAX_VISIBLE_OTHERS)
  const hiddenCount = totalOthers - MAX_VISIBLE_OTHERS

  const renderWeightBadge = (w: (typeof weights)[0]) => {
    const participantName =
      typeof w.participant === 'object' && w.participant !== null
        ? w.participant.name
        : ''
    return (
      <span
        key={participantName}
        className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-md"
      >
        {participantName}: {weightsAreAmounts ? formatCurrency(w.weight) : `${w.weight}x`}
      </span>
    )
  }

  return (
    <div
      className={`
        rounded-xl p-4 shadow-md flex gap-3 transition-transform hover:scale-[1.02]
        ${isOther ? 'bg-gray-50 opacity-60' : 'bg-white'}
        ${isRefund ? 'border-2 border-green-200' : ''}
        ${isPlanned ? 'border-2 border-dashed border-amber-300 bg-amber-50/50' : ''}
      `}
    >
      <div className="flex-shrink-0">
        {isPlanned ? (
          <div className="bg-amber-100 p-2 rounded-lg">
            <Clock size={20} className="text-amber-600" />
          </div>
        ) : isRefund ? (
          <div className="bg-green-100 p-2 rounded-lg">
            <ArrowLeft size={20} className="text-green-600" />
          </div>
        ) : (
          <div className="bg-primary/10 p-2 rounded-lg">
            <Receipt size={20} className="text-primary" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 mb-1">
          <span className="font-semibold text-gray-900 min-w-0 break-words [overflow-wrap:anywhere]">
            {expense.title}
          </span>
          <span
            className={`font-bold flex-shrink-0 ${
              isPlanned ? 'text-amber-600' : isRefund ? 'text-green-600' : 'text-gray-900'
            }`}
          >
            {formatCurrency(expense.amount)}
          </span>
        </div>

        <div className="text-sm text-gray-600 mb-2 flex items-center gap-2 flex-wrap">
          <span>
            {isPlanned
              ? 'Zaplatí '
              : isRefund
                ? payer.kind === 'jointAccount'
                  ? 'Peníze vrátili '
                  : 'Peníze vrátil/a '
                : payer.kind === 'jointAccount'
                  ? 'Platili '
                  : 'Platil/a '}
            <strong>{payerName}</strong>
            {payer.kind === 'jointAccount' && (
              <span className="text-gray-400"> (společný účet)</span>
            )}
          </span>
          {isPlanned && (
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-md uppercase">
              Plánovaný
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {expense.splitType === 'equal' ? (
            <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-md">
              Všichni rovným dílem
            </span>
          ) : (
            <>
              {/* Current user first */}
              {myWeight && renderWeightBadge(myWeight)}
              {/* Other participants */}
              {visibleOthers.map((w) => renderWeightBadge(w))}
              {/* Show more/less button */}
              {hiddenCount > 0 && !expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-md hover:bg-gray-300 transition-colors"
                >
                  +{hiddenCount} dalších
                </button>
              )}
              {expanded && totalOthers > MAX_VISIBLE_OTHERS && (
                <button
                  onClick={() => setExpanded(false)}
                  className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-md hover:bg-gray-300 transition-colors"
                >
                  skrýt
                </button>
              )}
            </>
          )}
        </div>

        {invitations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {invitations.map((inv, i) => {
              const hostName = typeof inv.host === 'object' && inv.host !== null ? inv.host.name : ''
              // Guest is the object of "zve" — accusative ("Vojta zve Katku")
              const guestName =
                typeof inv.guest === 'object' && inv.guest !== null ? akuzativName(inv.guest) : ''
              return (
                <span
                  key={inv.id ?? i}
                  className="bg-pink-50 text-pink-700 text-xs px-2 py-1 rounded-md flex items-center gap-1"
                >
                  <HeartHandshake size={12} /> {hostName} zve {guestName}
                </span>
              )
            })}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {attachments.map((att, i) =>
              att.mimeType?.startsWith('image/') ? (
                <button
                  key={att.id ?? i}
                  onClick={() => setLightboxAttachment(att)}
                  className="block w-10 h-10 rounded-md overflow-hidden border border-gray-200 hover:border-primary transition-colors"
                  title={att.alt || att.filename || 'účtenka'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={att.url!}
                    alt={att.alt || att.filename || 'účtenka'}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <a
                  key={att.id ?? i}
                  href={att.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-md flex items-center gap-1 hover:bg-gray-200 transition-colors"
                  title={att.alt || att.filename || 'příloha'}
                >
                  <FileText size={12} /> PDF
                </a>
              )
            )}
          </div>
        )}

        {/* Portal to body - ancestors with backdrop-filter (glass cards)
            would otherwise become the containing block for position:fixed
            and clip the overlay to the card */}
        {lightboxAttachment &&
          createPortal(
            <div
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
              onClick={() => setLightboxAttachment(null)}
            >
              <button
                onClick={() => setLightboxAttachment(null)}
                className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
                aria-label="Zavřít"
              >
                <X size={28} />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxAttachment.url!}
                alt={lightboxAttachment.alt || lightboxAttachment.filename || 'účtenka'}
                className="max-w-full max-h-full rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body
          )}
      </div>
    </div>
  )
}
