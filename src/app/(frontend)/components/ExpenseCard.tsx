'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { createPortal } from 'react-dom'
import {
  Receipt,
  ArrowLeft,
  CheckCircle2,
  Clock,
  HeartHandshake,
  FileText,
  X,
  Pencil,
  Trash2,
} from 'lucide-react'
import { formatCurrency, formatShortDate } from '@/lib/formatCurrency'
import { track } from '@/lib/analytics'
import { useAppTheme } from '../utils/useAppTheme'
import { getPayerDisplay } from '@/lib/payerRef'
import { accusativeName } from '@/lib/czechNames'
import type { AppLocale } from '@/i18n/config'
import type { Expense, ExpenseAttachment } from '@/payload-types'

const MAX_VISIBLE_OTHERS = 5

interface ExpenseCardProps {
  expense: Expense
  isMine?: boolean
  showAll?: boolean
  selectedParticipantId?: number | null
  /** the viewer authored this expense — show the manage footer (1b) */
  canManage?: boolean
  onEdit?: (expense: Expense) => void
  /** planned expense of your own: reopen the composer to confirm the payment */
  onMarkPaid?: (expense: Expense) => void
  /** resolves after the expense is deleted (data reload included) */
  onDelete?: (expense: Expense) => Promise<void>
  /** the viewer may confirm/refuse this pending expense (docs/PRD-vydaj-za-jineho.md) */
  canDecideApproval?: boolean
  /** resolves after the verdict is stored (data reload included) */
  onDecideApproval?: (expense: Expense, action: 'approve' | 'reject', reason: string) => Promise<void>
}

export function ExpenseCard({
  expense,
  isMine = true,
  showAll = false,
  selectedParticipantId,
  canManage = false,
  onEdit,
  onMarkPaid,
  onDelete,
  canDecideApproval = false,
  onDecideApproval,
}: ExpenseCardProps) {
  const t = useTranslations('finance')
  const locale = useLocale() as AppLocale
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState(false)
  const [lightboxAttachment, setLightboxAttachment] = useState<ExpenseAttachment | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // "Výdaj za jiného plátce" — waiting for (or refused) confirmation. The
  // card only ever reaches the people involved; the journal, the balances
  // and everybody else stay untouched until it is confirmed.
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [deciding, setDeciding] = useState(false)
  const [decideError, setDecideError] = useState<string | null>(null)
  const isPending = expense.approvalStatus === 'pending'
  const isRejected = expense.approvalStatus === 'rejected'
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
        className="bg-gray-100 text-gray-700 dark:bg-white/[0.07] dark:text-slate-300 text-xs px-2 py-1 rounded-md"
      >
        {participantName}: {weightsAreAmounts ? formatCurrency(w.weight, locale) : `${w.weight}x`}
      </span>
    )
  }

  // A planned expense of your own gets the one action that matters: the day
  // it is really paid, confirm it in the composer (amount, receipt, date)
  const markPaidButton =
    isPlanned && onMarkPaid ? (
      <button
        type="button"
        onClick={() => onMarkPaid(expense)}
        className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-100 hover:bg-amber-200 active:bg-amber-200 dark:bg-amber-400/15 dark:hover:bg-amber-400/25 transition-colors"
      >
        <CheckCircle2 size={13} /> {t('expenseCard.markPaid')}
      </button>
    ) : null

  const decide = async (action: 'approve' | 'reject') => {
    if (!onDecideApproval) return
    setDeciding(true)
    setDecideError(null)
    try {
      await onDecideApproval(expense, action, rejectReason.trim())
      track('expense_approval_decided', { action, from: 'card' })
    } catch {
      setDecideError(t('expenseCard.approval.decideFailed'))
      setDeciding(false)
    }
  }

  return (
    <div
      className={`
        rounded-xl p-4 shadow-md flex gap-3 transition-transform hover:scale-[1.02]
        ${isOther ? 'bg-gray-50 opacity-60 dark:bg-white/[0.04]' : 'bg-white dark:bg-[#1b212c]'}
        ${isRefund ? 'border-2 border-green-200 dark:border-green-500/30' : ''}
        ${isPlanned ? 'border-2 border-dashed border-amber-300 bg-amber-50/50 dark:border-amber-400/40 dark:bg-amber-400/10' : ''}
        ${isPending ? 'border-2 border-dashed border-slate-300 bg-slate-50/70 dark:border-white/[0.2] dark:bg-white/[0.05]' : ''}
        ${isRejected ? 'border-2 border-red-200 bg-red-50/40 dark:border-red-500/30 dark:bg-red-500/[0.07]' : ''}
      `}
    >
      <div className="flex-shrink-0">
        {isPlanned ? (
          <div className="bg-amber-100 dark:bg-amber-400/15 p-2 rounded-lg">
            <Clock size={20} className="text-amber-600 dark:text-amber-300" />
          </div>
        ) : isRefund ? (
          <div className="bg-green-100 dark:bg-green-500/15 p-2 rounded-lg">
            <ArrowLeft size={20} className="text-green-600 dark:text-green-300" />
          </div>
        ) : (
          <div className="bg-primary/10 p-2 rounded-lg">
            <Receipt size={20} className="text-primary dark:text-primary-light" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2 mb-1">
          <span className="font-semibold text-gray-900 dark:text-gray-100 min-w-0 break-words [overflow-wrap:anywhere]">
            {expense.title}
          </span>
          <span
            className={`font-bold flex-shrink-0 ${
              isPlanned
                ? 'text-amber-600 dark:text-amber-300'
                : isRefund
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {formatCurrency(expense.amount, locale)}
          </span>
        </div>

        <div className="text-sm text-gray-600 dark:text-slate-300 mb-2 flex items-center gap-2 flex-wrap">
          <span>
            {t.rich(
              isPlanned
                ? 'expenseCard.willPay'
                : isRefund
                  ? payer.kind === 'jointAccount'
                    ? 'expenseCard.refundedByJoint'
                    : 'expenseCard.refundedBy'
                  : payer.kind === 'jointAccount'
                    ? 'expenseCard.paidByJoint'
                    : 'expenseCard.paidBy',
              { name: payerName, strong: (chunks) => <strong>{chunks}</strong> }
            )}
            {payer.kind === 'jointAccount' && (
              <span className="text-gray-400 dark:text-slate-500"> {t('expenseCard.jointAccount')}</span>
            )}
          </span>
          {isPlanned && (
            <span className="bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300 text-xs font-bold px-2 py-0.5 rounded-md uppercase">
              {t('expenseCard.plannedBadge')}
            </span>
          )}
          {isPending && (
            <span className="bg-slate-200 text-slate-700 dark:bg-white/[0.12] dark:text-slate-200 text-xs font-bold px-2 py-0.5 rounded-md uppercase">
              {t('expenseCard.approval.pendingBadge')}
            </span>
          )}
          {isRejected && (
            <span className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300 text-xs font-bold px-2 py-0.5 rounded-md uppercase">
              {t('expenseCard.approval.rejectedBadge')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {expense.splitType === 'equal' ? (
            <span className="bg-gray-100 text-gray-700 dark:bg-white/[0.07] dark:text-slate-300 text-xs px-2 py-1 rounded-md">
              {t('expenseCard.equalSplit')}
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
                  className="bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-white/[0.1] dark:text-slate-300 dark:hover:bg-white/[0.14] text-xs px-2 py-1 rounded-md transition-colors"
                >
                  {t('expenseCard.showMore', { count: hiddenCount })}
                </button>
              )}
              {expanded && totalOthers > MAX_VISIBLE_OTHERS && (
                <button
                  onClick={() => setExpanded(false)}
                  className="bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-white/[0.1] dark:text-slate-300 dark:hover:bg-white/[0.14] text-xs px-2 py-1 rounded-md transition-colors"
                >
                  {t('expenseCard.hide')}
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
                typeof inv.guest === 'object' && inv.guest !== null
                  ? accusativeName(inv.guest, locale)
                  : ''
              return (
                <span
                  key={inv.id ?? i}
                  className="bg-pink-50 text-pink-700 dark:bg-pink-500/10 dark:text-pink-300 text-xs px-2 py-1 rounded-md flex items-center gap-1"
                >
                  <HeartHandshake size={12} /> {t('expenseCard.invites', { host: hostName, guest: guestName })}
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
                  onClick={() => {
                    track('expense_attachment_opened', { kind: 'image' })
                    setLightboxAttachment(att)
                  }}
                  className="block w-10 h-10 rounded-md overflow-hidden border border-gray-200 dark:border-white/[0.12] hover:border-primary dark:hover:border-primary-light transition-colors"
                  title={att.alt || att.filename || t('expenseCard.receipt')}
                >
                  <img
                    src={att.url!}
                    alt={att.alt || att.filename || t('expenseCard.receipt')}
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
                  onClick={() => track('expense_attachment_opened', { kind: 'pdf' })}
                  className="bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/[0.07] dark:text-slate-300 dark:hover:bg-white/[0.1] text-xs px-2 py-1 rounded-md flex items-center gap-1 transition-colors"
                  title={att.alt || att.filename || t('expenseCard.attachment')}
                >
                  <FileText size={12} /> PDF
                </a>
              )
            )}
          </div>
        )}

        {/* Approval state ("výdaj za jiného plátce"): what is holding the
            expense up, and — for the payer, the banker and chata admins —
            the two buttons that resolve it */}
        {(isPending || isRejected) && (
          <div className="mt-2.5 pt-2 border-t border-gray-100 dark:border-white/[0.07] flex flex-col gap-2">
            <span className="text-[13px] text-gray-600 dark:text-slate-300">
              {isRejected
                ? expense.approvalNote
                  ? t('expenseCard.approval.rejectedWithReason', { reason: expense.approvalNote })
                  : t('expenseCard.approval.rejectedNote')
                : canDecideApproval
                  ? payer.kind === 'jointAccount'
                    ? t('expenseCard.approval.decidePromptJoint', { payer: payerName })
                    : t('expenseCard.approval.decidePrompt', { payer: payerName })
                  : t('expenseCard.approval.waitingNote')}
            </span>
            {isPending && canDecideApproval && onDecideApproval && (
              <>
                {rejecting && (
                  <input
                    type="text"
                    value={rejectReason}
                    autoFocus
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('expenseCard.approval.reasonPlaceholder')}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-900 bg-white dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {!rejecting ? (
                    <>
                      <button
                        type="button"
                        disabled={deciding}
                        onClick={() => decide('approve')}
                        className="flex items-center gap-1.5 text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                      >
                        <CheckCircle2 size={13} /> {t('expenseCard.approval.approve')}
                      </button>
                      <button
                        type="button"
                        disabled={deciding}
                        onClick={() => setRejecting(true)}
                        className="flex items-center gap-1.5 text-gray-700 dark:text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-white/[0.07] dark:hover:bg-white/[0.1] transition-colors"
                      >
                        <X size={13} /> {t('expenseCard.approval.reject')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={deciding}
                        onClick={() => decide('reject')}
                        className="text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
                      >
                        {deciding ? t('expenseCard.approval.deciding') : t('expenseCard.approval.rejectConfirm')}
                      </button>
                      <button
                        type="button"
                        disabled={deciding}
                        onClick={() => {
                          setRejecting(false)
                          setRejectReason('')
                        }}
                        className="text-gray-700 dark:text-slate-300 text-xs font-semibold px-2.5 py-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/[0.07] transition-colors"
                      >
                        {t('expenseCard.back')}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            {decideError && (
              <span className="text-[13px] text-red-600 dark:text-red-400">{decideError}</span>
            )}
          </div>
        )}

        {/* Manage footer (1b): only on expenses the viewer authored */}
        {canManage && !confirmingDelete && (
          <div className="flex flex-col items-start gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between mt-2.5 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
            <span className="text-xs text-gray-400 dark:text-slate-500 max-w-full min-w-0 truncate">
              {t('expenseCard.addedByYou')}
              {/* date only where the icon buttons leave room (design 1b) */}
              <span className="hidden lg:inline"> · {formatShortDate(expense.createdAt, locale)}</span>
            </span>
            {/* Desktop: compact icon buttons */}
            <div className="hidden lg:flex items-center gap-1.5 flex-shrink-0">
              {markPaidButton}
              <button
                type="button"
                title={t('expenseCard.edit')}
                aria-label={t('expenseCard.editExpense')}
                onClick={() => onEdit?.(expense)}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-gray-100 transition-colors"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                title={t('expenseCard.delete')}
                aria-label={t('expenseCard.deleteExpense')}
                onClick={() => {
                  setDeleteError(null)
                  setConfirmingDelete(true)
                }}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/15 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {/* Mobile: labeled pill buttons above the thumb. NOT flex-shrink-0
                and not sharing the row with the label — a non-shrinking item
                keeps its max-content width, so three pills ("Už zaplaceno",
                Upravit, Smazat) never wrapped: they spilled past the card edge
                and gave the whole page a horizontal scroll on narrow phones */}
            <div className="flex lg:hidden flex-wrap gap-2">
              {markPaidButton}
              <button
                type="button"
                onClick={() => onEdit?.(expense)}
                className="flex items-center gap-1.5 text-gray-700 dark:text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-100 active:bg-gray-200 dark:bg-white/[0.07] dark:active:bg-white/[0.1] transition-colors"
              >
                <Pencil size={13} /> {t('expenseCard.edit')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null)
                  setConfirmingDelete(true)
                }}
                className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 active:bg-red-100 dark:bg-red-500/10 dark:active:bg-red-500/20 transition-colors"
              >
                <Trash2 size={13} /> {t('expenseCard.delete')}
              </button>
            </div>
          </div>
        )}

        {/* Inline delete confirmation (1b) — no browser dialogs */}
        {canManage && confirmingDelete && (
          <div className="flex items-center justify-between flex-wrap gap-2 mt-2.5 bg-red-50 border border-red-200 dark:bg-red-500/10 dark:border-red-500/30 rounded-lg px-2.5 py-2">
            <span className="text-[13px] text-red-800 dark:text-red-300 font-medium">
              {deleteError ?? t('expenseCard.confirmDelete')}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true)
                  setDeleteError(null)
                  try {
                    await onDelete?.(expense)
                  } catch {
                    setDeleteError(t('expenseCard.deleteFailed'))
                    setDeleting(false)
                  }
                }}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                {deleting ? t('expenseCard.deleting') : t('expenseCard.delete')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  setConfirmingDelete(false)
                  setDeleteError(null)
                }}
                className="text-gray-700 hover:bg-red-100 dark:text-slate-300 dark:hover:bg-red-500/20 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              >
                {t('expenseCard.back')}
              </button>
            </div>
          </div>
        )}

        {/* Portal to body - ancestors with backdrop-filter (glass cards)
            would otherwise become the containing block for position:fixed
            and clip the overlay to the card */}
        {lightboxAttachment &&
          createPortal(
            <div
              data-app-theme={theme}
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
              onClick={() => setLightboxAttachment(null)}
            >
              <button
                onClick={() => setLightboxAttachment(null)}
                className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
                aria-label={t('expenseCard.close')}
              >
                <X size={28} />
              </button>
              <img
                src={lightboxAttachment.url!}
                alt={lightboxAttachment.alt || lightboxAttachment.filename || t('expenseCard.receipt')}
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
