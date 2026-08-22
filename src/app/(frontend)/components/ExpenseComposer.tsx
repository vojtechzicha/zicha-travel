'use client'

// Expense authoring for signed-in participants ("Přidat výdaj").
// One component, two layouts:
// - mobile (< lg): a 3-step wizard — entry sheet (photo / manual), then
//   "co a kolik", "kdo se dělí", "zkontrolovat a uložit"
// - desktop (lg+): a single modal form over the Finance view
// Split modes: equal ("všichni rovným dílem"), shares ("podíly") and exact
// amounts ("přesné částky", weights summing to the total; the untouched
// rows auto-absorb the remainder — "dopočítáno").
// Saves through the Payload REST API with the viewer's session cookie; the
// server enforces who may author what (see lib/expenseAuthoring).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  ChevronLeft,
  Clock,
  FileText,
  HeartHandshake,
  Minus,
  Pencil,
  Plus,
  Receipt,
  Upload,
  Wallet,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { formatCurrency, getAvatarColor, getInitials } from '@/lib/formatCurrency'
import { track } from '@/lib/analytics'
import { accusativeName } from '@/lib/czechNames'
import { needsApproval, ownJointAccounts, payerAccountIds } from '@/lib/expenseAuthoring'
import { refId } from '@/lib/access'
import { downscaleImage } from '@/lib/imageDownscale'
import { useAppTheme } from '../utils/useAppTheme'
import type { AppLocale } from '@/i18n/config'
import type { FinanceViewer } from '@/lib/financeAccess'
import type { Chata, Expense, ExpenseAttachment, JointAccount, Participant } from '@/payload-types'

interface ExpenseComposerProps {
  chata: Chata
  participants: Participant[]
  jointAccounts: JointAccount[]
  viewer: FinanceViewer
  /** null = create; an expense = edit (same form, prefilled) */
  expense: Expense | null
  /**
   * "Už zaplaceno" on a planned expense: the same edit form, opened with the
   * planned switch already off and today's date, so the amount can still be
   * corrected and the receipt attached before it becomes an actual expense.
   */
  markPaid?: boolean
  onClose: () => void
  /** reload data (and close) after a successful save */
  onSaved: () => void | Promise<void>
}

type PayerChoice = { relationTo: 'participants' | 'joint-accounts'; value: number }
type SplitMode = 'equal' | 'shares' | 'amounts'
type MobileStep = 'entry' | 'details' | 'split' | 'review'

interface SplitRow {
  included: boolean
  shares: number
  /** exact-amounts mode: the typed value ('' = auto/"dopočítáno") */
  amountText: string
}

interface NewFile {
  key: string
  file: File
  previewUrl: string | null
}

interface ManualInvite {
  host: number
  guest: number
}

const asId = (ref: number | { id: number } | null | undefined): number | null =>
  typeof ref === 'object' && ref !== null ? ref.id : (ref ?? null)

// Whole koruny only — the rest of the frontend has no haléř support
// (formatCurrency renders 0 fraction digits), so the composer neither
// accepts nor produces fractional amounts.
const sanitizeAmountInput = (text: string): string => text.replace(/[^\d]/g, '')

const parseAmount = (text: string): number | null => {
  const cleaned = text.replace(/\s/g, '')
  if (!cleaned || !/^\d+$/.test(cleaned)) return null
  return Number(cleaned)
}

/** "=" for a whole per-person amount, "≈" when it had to be rounded */
const perPersonOp = (value: number): string => (Number.isInteger(value) ? '=' : '≈')

const toDateInput = (value: string | Date): string => {
  const d = typeof value === 'string' ? new Date(value) : value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const formatDayShort = (dateStr: string, locale: AppLocale): string => {
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(d)
}

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
}

let fileKeySeq = 0

export function ExpenseComposer({
  chata,
  participants,
  jointAccounts,
  viewer,
  expense,
  markPaid = false,
  onClose,
  onSaved,
}: ExpenseComposerProps) {
  const isEdit = expense !== null
  const isDesktop = useIsDesktop()
  const t = useTranslations('composer')
  const locale = useLocale() as AppLocale
  const { theme } = useAppTheme()

  const ownIds = viewer.linkedParticipantIds
  const ownIdsStr = useMemo(() => ownIds.map(String), [ownIds])
  const ownParticipants = useMemo(
    () => participants.filter((p) => ownIds.includes(p.id)),
    [participants, ownIds],
  )
  const payableJointAccounts = useMemo(
    () => ownJointAccounts(ownIdsStr, jointAccounts),
    [ownIdsStr, jointAccounts],
  )
  // "Zaplatil někdo jiný" — everyone else in the chata, people and shared
  // wallets alike. Not the usual case, so it hides behind one quiet link and
  // the expense then waits for confirmation (docs/PRD-vydaj-za-jineho.md)
  const otherPayers = useMemo<{ choice: PayerChoice; name: string; isJoint: boolean }[]>(() => {
    const ownJointIds = new Set(payableJointAccounts.map((ja) => ja.id))
    const people = participants
      .filter((p) => !ownIds.includes(p.id))
      .map((p) => ({
        choice: { relationTo: 'participants' as const, value: p.id },
        name: p.name,
        isJoint: false,
      }))
    const wallets = jointAccounts
      .filter((ja) => !ownJointIds.has(ja.id))
      .map((ja) => ({
        choice: { relationTo: 'joint-accounts' as const, value: ja.id },
        name: ja.name,
        isJoint: true,
      }))
    return [...people, ...wallets].sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  }, [participants, ownIds, jointAccounts, payableJointAccounts])

  // Split rows keep ALL chata participants: own first, then alphabetically
  const orderedParticipants = useMemo(() => {
    const others = participants
      .filter((p) => !ownIds.includes(p.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
    return [...ownParticipants, ...others]
  }, [participants, ownParticipants, ownIds])

  // ── initial state from the edited expense ────────────────────────────
  const initialPayer = useMemo<PayerChoice | null>(() => {
    if (expense?.payer) {
      const value = asId(expense.payer.value as number | { id: number })
      if (value !== null) return { relationTo: expense.payer.relationTo, value }
    }
    return ownParticipants.length > 0
      ? { relationTo: 'participants', value: ownParticipants[0].id }
      : null
  }, [expense, ownParticipants])

  const initialSplit = useMemo<{ mode: SplitMode; rows: Record<number, SplitRow> }>(() => {
    const rows: Record<number, SplitRow> = {}
    const weights = expense?.weights ?? []
    if (!expense || expense.splitType === 'equal' || weights.length === 0) {
      for (const p of participants) rows[p.id] = { included: true, shares: 1, amountText: '' }
      return { mode: 'equal', rows }
    }
    const weightsSum = weights.reduce((sum, w) => sum + (w.weight ?? 0), 0)
    const areAmounts = Math.abs(weightsSum - expense.amount) <= 1
    const byParticipant = new Map<number, number>()
    for (const w of weights) {
      const id = asId(w.participant as number | { id: number })
      if (id !== null) byParticipant.set(id, w.weight ?? 0)
    }
    let lastIncluded: number | null = null
    for (const p of participants) {
      const weight = byParticipant.get(p.id)
      const included = weight !== undefined && weight > 0
      rows[p.id] = {
        included,
        shares: areAmounts || !included ? 1 : weight,
        amountText: areAmounts && included ? String(Math.round(weight!)) : '',
      }
      if (included) lastIncluded = p.id
    }
    // exact-amounts mode: reopen with the LAST row as the auto ("dopočítáno")
    // one so the sum keeps matching while the user tweaks other rows
    if (areAmounts && lastIncluded !== null) rows[lastIncluded].amountText = ''
    return { mode: areAmounts ? 'amounts' : 'shares', rows }
  }, [expense, participants])

  // "Už zaplaceno" opens straight on the summary — everything is prefilled,
  // one tap saves, and the back arrow leads to the amount
  const [mobileStep, setMobileStep] = useState<MobileStep>(
    markPaid ? 'review' : isEdit ? 'details' : 'entry',
  )

  // ── funnel instrumentation (docs/PRD-analytika.md) ───────────────────
  // savedRef distinguishes "closed after saving" from "abandoned";
  // stepRef remembers how far the wizard got (desktop = single form = 1)
  const savedRef = useRef(false)
  const stepRef = useRef(1)
  useEffect(() => {
    // desktop opens straight into the form; the mobile entry sheet fires
    // expense_compose_started from its photo/manual buttons instead
    if (!isEdit && isDesktop) track('expense_compose_started', { entry: 'manual' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (isEdit || isDesktop) return
    const step = mobileStep === 'details' ? 1 : mobileStep === 'split' ? 2 : mobileStep === 'review' ? 3 : null
    if (step !== null) {
      stepRef.current = step
      track('expense_compose_step', { step, split_mode: splitMode })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileStep])
  useEffect(
    () => () => {
      // unmounted without a save = the wizard was abandoned (dev-only
      // StrictMode double-mount makes this noisy locally; production and
      // preview builds mount once)
      if (!savedRef.current && !isEdit) {
        track('expense_compose_abandoned', { step: stepRef.current })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [title, setTitle] = useState(expense?.title ?? '')
  const [amountText, setAmountText] = useState(
    expense ? String(Math.round(Math.abs(expense.amount))) : '',
  )
  const [isRefund, setIsRefund] = useState((expense?.amount ?? 0) < 0)
  // Planned expense ("zatím nezaplacený") — the amount is a promise, so the
  // math keeps it apart from the real one (utils/calculateStats).
  // The switch is a ONE-WAY door: it shows while composing a new expense and
  // on an expense that is still planned. Once paid, editing no longer offers
  // it — turning a real payment back into a promise is a mistake waiting to
  // happen (one stray tap), and the way back is to delete and add it again.
  const plannedEditable = !isEdit || (expense?.isPlanned ?? false)
  const [isPlanned, setIsPlanned] = useState(markPaid ? false : (expense?.isPlanned ?? false))
  // Confirming a payment re-dates the expense to the day it was paid
  const [dateStr, setDateStr] = useState(
    toDateInput(markPaid ? new Date() : (expense?.createdAt ?? new Date())),
  )
  const [payer, setPayer] = useState<PayerChoice | null>(initialPayer)
  const [splitMode, setSplitMode] = useState<SplitMode>(initialSplit.mode)
  const [rows, setRows] = useState<Record<number, SplitRow>>(initialSplit.rows)
  const [manualInvites, setManualInvites] = useState<ManualInvite[]>(() =>
    (expense?.invitations ?? [])
      .filter((inv) => !inv.auto)
      .flatMap((inv) => {
        const host = asId(inv.host as number | { id: number })
        const guest = asId(inv.guest as number | { id: number })
        return host !== null && guest !== null ? [{ host, guest }] : []
      }),
  )
  const [draftHost, setDraftHost] = useState<number | ''>('')
  const [existingAttachments, setExistingAttachments] = useState<ExpenseAttachment[]>(() =>
    (expense?.attachments ?? []).filter(
      (a): a is ExpenseAttachment => typeof a === 'object' && a !== null,
    ),
  )
  const [newFiles, setNewFiles] = useState<NewFile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  // Auto rows of the edited expense are preserved verbatim on save
  const preservedAutoRows = useMemo(
    () =>
      (expense?.invitations ?? [])
        .filter((inv) => inv.auto)
        .flatMap((inv) => {
          const host = asId(inv.host as number | { id: number })
          const guest = asId(inv.guest as number | { id: number })
          return host !== null && guest !== null
            ? [{ host, guest, auto: true as const, ...(inv.id ? { id: inv.id } : {}) }]
            : []
        }),
    [expense],
  )

  // ── derived ──────────────────────────────────────────────────────────
  const amount = parseAmount(amountText)
  const amountValid = amount !== null && amount > 0

  // Payer somebody else than the author: the expense is saved but stays
  // invisible (and out of the maths) until it is confirmed. Admins of the
  // chata skip that queue — they are the ones who would confirm it anyway.
  const alternatePayer = useMemo(
    () =>
      payer === null
        ? null
        : (otherPayers.find(
            (o) => o.choice.relationTo === payer.relationTo && o.choice.value === payer.value,
          ) ?? null),
    [payer, otherPayers],
  )
  // Who can actually confirm it, so the note names real people: the accounts
  // speaking for the payer, and the banker only if there IS one with an
  // account (the chata's admins are the fallback that always exists)
  const bankerCanConfirm = useMemo(() => {
    const bankerId = chata.banker != null ? refId(chata.banker) : null
    if (bankerId == null) return false
    return participants.some((p) => String(p.id) === bankerId && p.account != null)
  }, [chata.banker, participants])
  const payerCanConfirm = useMemo(
    () =>
      alternatePayer !== null &&
      payerAccountIds(
        { relationTo: alternatePayer.choice.relationTo, value: alternatePayer.choice.value },
        participants,
        jointAccounts,
      ).length > 0,
    [alternatePayer, participants, jointAccounts],
  )
  const approvalRequired = needsApproval({
    isAdmin: viewer.canViewAll,
    payerIsOwn: alternatePayer === null,
  })
  const [showOtherPayers, setShowOtherPayers] = useState(() => alternatePayer !== null)

  const includedParticipants = useMemo(
    () =>
      splitMode === 'equal'
        ? orderedParticipants
        : orderedParticipants.filter((p) => rows[p.id]?.included),
    [splitMode, orderedParticipants, rows],
  )

  const totalShares = includedParticipants.reduce(
    (sum, p) => sum + (splitMode === 'shares' ? (rows[p.id]?.shares ?? 1) : 1),
    0,
  )

  // Exact amounts: typed rows are fixed, untouched rows split the remainder
  // in whole koruny — the first rows get the extra 1 Kč (617/617/616 style)
  const amountsPlan = useMemo(() => {
    const total = amount ?? 0
    const included = orderedParticipants.filter((p) => rows[p.id]?.included)
    const typed = included.filter((p) => rows[p.id].amountText.trim() !== '')
    const auto = included.filter((p) => rows[p.id].amountText.trim() === '')
    let typedSum = 0
    let typedInvalid = false
    const typedValues = new Map<number, number>()
    for (const p of typed) {
      const v = parseAmount(rows[p.id].amountText)
      if (v === null) {
        typedInvalid = true
        continue
      }
      typedValues.set(p.id, v)
      typedSum += v
    }
    const remainder = total - typedSum
    const autoValues = new Map<number, number>()
    if (auto.length > 0) {
      const base = Math.floor(remainder / auto.length)
      const extras = remainder - base * auto.length
      auto.forEach((p, i) => {
        autoValues.set(p.id, base + (i < extras ? 1 : 0))
      })
    }
    const negativeAuto = [...autoValues.values()].some((v) => v < 0)
    const leftover = auto.length > 0 ? 0 : remainder
    const valid = !typedInvalid && included.length > 0 && !negativeAuto && leftover === 0
    return { typedValues, autoValues, leftover, remainder, valid, autoCount: auto.length }
  }, [amount, orderedParticipants, rows])

  const splitValid =
    splitMode === 'equal'
      ? orderedParticipants.length > 0
      : splitMode === 'shares'
        ? includedParticipants.length > 0 && totalShares > 0
        : amountsPlan.valid

  const detailsValid = title.trim().length > 0 && amountValid && payer !== null
  const formValid = detailsValid && splitValid

  // Refunds keep shares/equal — negative exact amounts don't exist (weights
  // are non-negative), so the mode falls back when the toggle flips on
  useEffect(() => {
    if (isRefund && splitMode === 'amounts') setSplitMode('shares')
  }, [isRefund, splitMode])

  // ── invitations ──────────────────────────────────────────────────────
  const participantById = useMemo(() => {
    const map = new Map<number, Participant>()
    for (const p of participants) map.set(p.id, p)
    return map
  }, [participants])

  const takesShare = useCallback(
    (participantId: number): boolean =>
      splitMode === 'equal' ? true : (rows[participantId]?.included ?? false),
    [splitMode, rows],
  )

  // Standing paidBy pairs that will apply to THIS expense (guest takes a
  // share). On create the server hook adds them; here they're only a banner.
  const applicableAutoPairs = useMemo(() => {
    if (isEdit) {
      return preservedAutoRows.map((row) => ({ host: row.host, guest: row.guest }))
    }
    return participants.flatMap((p) => {
      const host = asId(p.paidBy as number | { id: number } | null | undefined)
      if (host === null || host === p.id) return []
      if (!takesShare(p.id)) return []
      return [{ host, guest: p.id }]
    })
  }, [isEdit, preservedAutoRows, participants, takesShare])

  const invitedGuestIds = useMemo(
    () =>
      new Set([
        ...manualInvites.map((inv) => inv.guest),
        ...applicableAutoPairs.map((pair) => pair.guest),
      ]),
    [manualInvites, applicableAutoPairs],
  )

  const inviteHostOptions = includedParticipants
  const inviteGuestOptions = useMemo(
    () =>
      includedParticipants.filter(
        (p) => p.id !== draftHost && !invitedGuestIds.has(p.id),
      ),
    [includedParticipants, draftHost, invitedGuestIds],
  )

  const autoBannerText = useMemo(() => {
    if (applicableAutoPairs.length === 0) return null
    const parts = applicableAutoPairs.map((pair) => {
      const host = participantById.get(pair.host)
      const guest = participantById.get(pair.guest)
      if (!guest) return null
      const guestName = accusativeName(guest, locale)
      return host && ownIds.includes(host.id)
        ? t('invites.youPayFor', { guest: guestName })
        : t('invites.hostPaysFor', { host: host?.name ?? '—', guest: guestName })
    })
    return parts.filter(Boolean).join(', ')
  }, [applicableAutoPairs, participantById, ownIds, t, locale])

  // ── attachments ──────────────────────────────────────────────────────
  const addFiles = useCallback((files: FileList | File[]) => {
    const accepted = [...files].filter(
      (f) => f.type.startsWith('image/') || f.type === 'application/pdf',
    )
    if (accepted.length === 0) return
    setNewFiles((prev) => [
      ...prev,
      ...accepted.map((file) => ({
        key: `f${++fileKeySeq}`,
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ])
  }, [])

  useEffect(
    () => () => {
      // revoke object URLs on unmount
      setNewFiles((prev) => {
        prev.forEach((nf) => nf.previewUrl && URL.revokeObjectURL(nf.previewUrl))
        return prev
      })
    },
    [],
  )

  const removeNewFile = (key: string) =>
    setNewFiles((prev) => {
      const found = prev.find((nf) => nf.key === key)
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl)
      return prev.filter((nf) => nf.key !== key)
    })

  // ── scroll lock + Escape ─────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  // ── save ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formValid || payer === null || amount === null || saving) return
    setSaving(true)
    setError(null)
    try {
      // 1) upload new receipts (downscaled client-side; Vercel body cap)
      const uploadedIds: number[] = []
      for (const nf of newFiles) {
        const prepared = await downscaleImage(nf.file)
        if (prepared.size > 4 * 1024 * 1024) {
          throw new Error(t('errors.fileTooLarge', { name: nf.file.name }))
        }
        const fd = new FormData()
        fd.append('file', prepared)
        const res = await fetch('/api/expense-attachments', {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
        })
        if (!res.ok) {
          track('save_failed', { operation: 'attachment_upload', status: res.status })
          throw new Error(t('errors.uploadFailedRetry'))
        }
        const json = await res.json()
        const id = json?.doc?.id
        if (typeof id !== 'number') throw new Error(t('errors.uploadFailed'))
        uploadedIds.push(id)
      }

      // 2) build the expense payload
      const signedAmount = isRefund ? -Math.abs(amount) : amount
      let weights: { participant: number; weight: number }[] = []
      if (splitMode === 'shares') {
        weights = includedParticipants.map((p) => ({
          participant: p.id,
          weight: rows[p.id]?.shares ?? 1,
        }))
      } else if (splitMode === 'amounts') {
        weights = includedParticipants.map((p) => ({
          participant: p.id,
          weight: amountsPlan.typedValues.get(p.id) ?? amountsPlan.autoValues.get(p.id) ?? 0,
        }))
      }

      const invitations = [
        ...preservedAutoRows,
        ...manualInvites.map((inv) => ({ host: inv.host, guest: inv.guest, auto: false })),
      ]

      // keep the original time of day; new expenses stamp "now"
      const baseDate = expense ? new Date(expense.createdAt) : new Date()
      const [y, m, d] = dateStr.split('-').map(Number)
      if (y && m && d) baseDate.setFullYear(y, m - 1, d)

      const payload = {
        chata: chata.id,
        title: title.trim(),
        amount: signedAmount,
        payer: { relationTo: payer.relationTo, value: payer.value },
        splitType: splitMode === 'equal' ? 'equal' : 'weighted',
        weights,
        invitations,
        createdAt: baseDate.toISOString(),
        attachments: [...existingAttachments.map((a) => a.id), ...uploadedIds],
        // only where the switch was offered; a paid expense keeps its flag
        // untouched (PATCH is partial), so it can never revert to planned
        ...(plannedEditable ? { isPlanned } : {}),
      }

      const res = await fetch(isEdit ? `/api/expenses/${expense!.id}` : '/api/expenses', {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        track('save_failed', {
          operation: isEdit ? 'expense_update' : 'expense_create',
          status: res.status,
        })
        throw new Error(
          json?.errors?.[0]?.message || t('errors.saveFailedRetry'),
        )
      }
      savedRef.current = true
      if (!isEdit) {
        track('expense_created', {
          split_mode: splitMode,
          planned: isPlanned,
          for_other: alternatePayer !== null,
        })
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.saveFailed'))
      setSaving(false)
    }
  }

  // ── shared render helpers ────────────────────────────────────────────
  const heading = markPaid ? t('headingMarkPaid') : isEdit ? t('headingEdit') : t('headingNew')
  const saveLabel = markPaid ? t('saveMarkPaid') : t('save')

  const payerName = (choice: PayerChoice): string => {
    if (choice.relationTo === 'participants') {
      return participantById.get(choice.value)?.name ?? '—'
    }
    return jointAccounts.find((ja) => ja.id === choice.value)?.name ?? '—'
  }

  const renderPayerChips = () => {
    const options: { choice: PayerChoice; label: string; initialsOf?: string }[] = []
    for (const p of ownParticipants) {
      options.push({
        choice: { relationTo: 'participants', value: p.id },
        label: ownParticipants.length === 1 ? t('payer.you') : t('payer.nameYou', { name: p.name }),
        initialsOf: p.name,
      })
    }
    for (const ja of payableJointAccounts) {
      options.push({ choice: { relationTo: 'joint-accounts', value: ja.id }, label: ja.name })
    }
    // an edited expense may have a payer outside the viewer's options
    // (a joint account assigned by an admin) — keep it selectable so saving
    // doesn't break. Another participant needs no chip: the select below
    // already shows them.
    if (
      payer &&
      alternatePayer === null &&
      !options.some(
        (o) => o.choice.relationTo === payer.relationTo && o.choice.value === payer.value,
      )
    ) {
      options.push({
        choice: payer,
        label: payerName(payer),
        initialsOf:
          payer.relationTo === 'participants' ? payerName(payer) : undefined,
      })
    }
    // The rest of the chata, in the same chip language as the row above —
    // a native select would be the odd control out here, and these are just
    // as pickable, only rarer. Once one is chosen the row stays open: it is
    // the only place showing who is meant to have paid.
    const otherPayerUi =
      otherPayers.length === 0 ? null : !showOtherPayers && alternatePayer === null ? (
        <button
          type="button"
          onClick={() => setShowOtherPayers(true)}
          className="mt-2.5 text-[13px] text-gray-500 dark:text-slate-400 underline underline-offset-2 hover:text-gray-700 dark:hover:text-slate-200"
        >
          {t('payer.someoneElseLink')}
        </button>
      ) : (
        <div className="mt-3" role="group" aria-label={t('payer.someoneElseLabel')}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1.5">
            {t('payer.someoneElseLabel')}
          </div>
          <div className="flex flex-wrap gap-2">
            {otherPayers.map((option) =>
              renderPayerChip({
                choice: option.choice,
                label: option.name,
                initialsOf: option.isJoint ? undefined : option.name,
              }),
            )}
          </div>
        </div>
      )

    return (
      <div>
        <div className="flex flex-wrap gap-2">{options.map(renderPayerChip)}</div>
        {otherPayerUi}
        {renderApprovalNote()}
      </div>
    )
  }

  const renderPayerChip = (option: {
    choice: PayerChoice
    label: string
    /** a person: their initials avatar; omitted for a joint account (wallet) */
    initialsOf?: string
  }) => {
    const selected =
      payer !== null &&
      payer.relationTo === option.choice.relationTo &&
      payer.value === option.choice.value
    return (
      <button
        key={`${option.choice.relationTo}-${option.choice.value}`}
        type="button"
        onClick={() => setPayer(option.choice)}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
          selected
            ? 'border-2 border-primary bg-primary/10'
            : 'border-gray-200 hover:border-gray-300 dark:border-white/[0.12] dark:hover:border-white/[0.25]'
        }`}
      >
        {option.initialsOf ? (
          <span
            className={`w-[26px] h-[26px] rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${getAvatarColor(option.initialsOf)}`}
          >
            {getInitials(option.initialsOf)}
          </span>
        ) : (
          <span className="w-[26px] h-[26px] rounded-full bg-gray-700 text-white flex items-center justify-center flex-shrink-0">
            <Wallet size={13} />
          </span>
        )}
        <span
          className={`text-sm ${selected ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-slate-300'}`}
        >
          {option.label}
        </span>
        {selected && (
          <Check size={16} className="text-primary dark:text-primary-light" strokeWidth={2.5} />
        )}
      </button>
    )
  }

  // The one thing people must understand before saving an expense for
  // somebody else: it is recorded, but nobody sees it and nothing moves
  // until it is confirmed. Name only confirmers who really exist — with no
  // banker account, the chata's admins are the ones who will do it.
  const renderApprovalNote = () => {
    if (!approvalRequired || !alternatePayer) return null
    const fallback = bankerCanConfirm ? t('payer.approverBanker') : t('payer.approverAdmin')
    const payerSide = alternatePayer.isJoint
      ? t('payer.approverJoint', { name: alternatePayer.name })
      : alternatePayer.name
    return (
      <div className="flex items-start gap-2.5 mt-2.5 bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-400/10 dark:border-amber-400/30 dark:text-amber-200 rounded-xl px-3 py-2.5">
        <Clock size={15} className="flex-shrink-0 mt-0.5" />
        <span className="text-[13px] leading-relaxed">
          {payerCanConfirm
            ? t('payer.approvalTwo', { first: payerSide, second: fallback })
            : t('payer.approvalOne', { who: fallback })}
        </span>
      </div>
    )
  }

  // Switch row. compact = desktop column (switch left of the label), the
  // roomier variant puts the label left and the switch on the right.
  const renderSwitch = ({
    label,
    checked,
    onToggle,
    onColor,
    compact,
  }: {
    label: string
    checked: boolean
    onToggle: () => void
    onColor: string
    compact: boolean
  }) => {
    const knob = (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={`relative rounded-full flex-shrink-0 transition-colors ${
          compact ? 'w-[38px] h-[22px]' : 'w-[46px] h-7'
        } ${checked ? onColor : 'bg-gray-200 dark:bg-white/[0.15]'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform ${
            compact ? 'w-[18px] h-[18px]' : 'w-6 h-6'
          } ${checked ? (compact ? 'translate-x-4' : 'translate-x-[18px]') : ''}`}
        />
      </button>
    )
    return (
      <div className={`flex items-center gap-2 ${compact ? 'mt-2' : 'justify-between mt-2.5 px-0.5'}`}>
        {compact && knob}
        <span className="text-sm text-gray-600 dark:text-slate-300">{label}</span>
        {!compact && knob}
      </div>
    )
  }

  // Both flags of the amount: a refund (money came back) and a planned
  // expense (money hasn't left yet). They are independent — a deposit we
  // expect back is a planned refund. Mobile stacks them under the amount;
  // the desktop modal hangs one under each of the amount/date columns.
  const renderRefundSwitch = (compact = false) =>
    renderSwitch({
      label: t('stepWhat.refundToggle'),
      checked: isRefund,
      onToggle: () => setIsRefund((v) => !v),
      onColor: 'bg-green-500',
      compact,
    })

  const renderPlannedSwitch = (compact = false) =>
    plannedEditable
      ? renderSwitch({
          label: t('stepWhat.plannedToggle'),
          checked: isPlanned,
          onToggle: () => setIsPlanned((v) => !v),
          onColor: 'bg-amber-500',
          compact,
        })
      : null

  const renderAmountToggles = (compact = false) => (
    <>
      {renderRefundSwitch(compact)}
      {renderPlannedSwitch(compact)}
    </>
  )

  const setRow = (participantId: number, patch: Partial<SplitRow>) =>
    setRows((prev) => ({
      ...prev,
      [participantId]: { ...prev[participantId], ...patch },
    }))

  const renderSplitRows = (mode: 'shares' | 'amounts') => (
    <div className="flex flex-col gap-2">
      {orderedParticipants.map((p) => {
        const row = rows[p.id] ?? { included: true, shares: 1, amountText: '' }
        const isOwn = ownIds.includes(p.id)
        const label = isOwn ? t('payer.nameYou', { name: p.name }) : p.name
        const isAuto =
          mode === 'amounts' && row.included && row.amountText.trim() === ''
        const autoValue = amountsPlan.autoValues.get(p.id)
        return (
          <div
            key={p.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
              !row.included
                ? 'border-dashed border-gray-200 dark:border-white/[0.12] opacity-55'
                : isAuto
                  ? 'border-2 border-primary bg-primary/5'
                  : 'border-gray-200 dark:border-white/[0.12]'
            }`}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={row.included}
              aria-label={t('stepWho.ariaIncluded', { name: p.name })}
              onClick={() => setRow(p.id, { included: !row.included })}
              className={`w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                row.included ? 'bg-primary' : 'border-2 border-gray-300 dark:border-white/[0.25]'
              }`}
            >
              {row.included && <Check size={14} className="text-white" strokeWidth={3} />}
            </button>
            <span
              className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${getAvatarColor(p.name)}`}
            >
              {getInitials(p.name)}
            </span>
            <span className="flex-1 min-w-0 truncate text-[15px] font-medium text-gray-900 dark:text-gray-100">
              {label}
            </span>
            {row.included && mode === 'shares' && (
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white dark:bg-white/[0.06] dark:border-white/[0.15] flex-shrink-0">
                <button
                  type="button"
                  aria-label={t('stepWho.ariaFewerShares')}
                  onClick={() => setRow(p.id, { shares: Math.max(1, row.shares - 1) })}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-white/[0.06]"
                >
                  <Minus size={14} />
                </button>
                <span
                  className={`w-9 text-center text-sm ${
                    row.shares !== 1
                      ? 'font-bold text-primary dark:text-primary-light'
                      : 'font-semibold text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {row.shares}×
                </span>
                <button
                  type="button"
                  aria-label={t('stepWho.ariaMoreShares')}
                  onClick={() => setRow(p.id, { shares: row.shares + 1 })}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-white/[0.06]"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
            {row.included && mode === 'amounts' && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {isAuto && (
                  <span className="text-xs text-primary-dark dark:text-primary-light font-medium">{t('stepWho.computed')}</span>
                )}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={isAuto ? (autoValue !== undefined ? String(autoValue) : '') : row.amountText}
                    placeholder="0"
                    aria-label={t('stepWho.ariaAmountFor', { name: p.name })}
                    onChange={(e) => setRow(p.id, { amountText: sanitizeAmountInput(e.target.value) })}
                    onFocus={(e) => {
                      // touching the auto field makes it a typed one
                      if (isAuto && autoValue !== undefined) {
                        setRow(p.id, { amountText: String(autoValue) })
                        requestAnimationFrame(() => e.target.select())
                      }
                    }}
                    className={`w-24 text-right text-sm font-semibold rounded-lg border pl-2 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:placeholder-slate-500 ${
                      isAuto
                        ? 'border-primary text-primary-dark bg-white dark:bg-white/[0.06] dark:text-primary-light'
                        : 'border-gray-200 text-gray-900 dark:border-white/[0.15] dark:bg-white/[0.06] dark:text-gray-100'
                    }`}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-slate-500 pointer-events-none">
                    {t('currencySuffix')}
                  </span>
                </div>
              </div>
            )}
            {!row.included && (
              <span className="text-[13px] text-gray-400 dark:text-slate-500">{t('stepWho.notIncluded')}</span>
            )}
          </div>
        )
      })}
    </div>
  )

  // Equal split, the default (design 1c "výchozí stav"): a friendly summary
  // card — overlapping avatars, headcount and the per-person amount — with a
  // nudge towards the shares mode when only some people took part
  const renderEqualSummary = (switchLabel: string) => {
    const count = orderedParticipants.length
    const shown = orderedParticipants.slice(0, 6)
    const extra = count - shown.length
    const headline = t('stepWho.headline', { count })
    const total = amount !== null ? (isRefund ? -amount : amount) : null
    return (
      <div>
        <div className="border border-gray-200 dark:border-white/[0.12] dark:bg-white/[0.03] rounded-2xl px-5 py-5 text-center">
          <div className="flex justify-center mb-3.5">
            {shown.map((p, i) => (
              <span
                key={p.id}
                className={`w-11 h-11 rounded-full text-white text-sm font-bold flex items-center justify-center border-[3px] border-white dark:border-[#1b212c] shadow-sm ${getAvatarColor(p.name)} ${i > 0 ? '-ml-2.5' : ''}`}
              >
                {getInitials(p.name)}
              </span>
            ))}
            {extra > 0 && (
              <span className="w-11 h-11 rounded-full bg-gray-200 text-gray-600 dark:bg-white/[0.1] dark:text-slate-300 text-sm font-bold flex items-center justify-center border-[3px] border-white dark:border-[#1b212c] shadow-sm -ml-2.5">
                +{extra}
              </span>
            )}
          </div>
          <div className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-1">{headline}</div>
          {total !== null && count > 0 && (
            <div className="text-sm text-gray-500 dark:text-slate-400">
              {formatCurrency(total, locale)} ÷ {count} {perPersonOp(total / count)}{' '}
              <strong className="text-gray-900 dark:text-gray-100">
                {formatCurrency(Math.round(total / count), locale)}
              </strong>{' '}
              {t('stepWho.perPerson')}
            </div>
          )}
        </div>
        {count > 1 && (
          <p className="text-[13px] text-gray-400 dark:text-slate-500 text-center mt-3.5">
            {t('stepWho.equalNudge', { label: switchLabel })}
          </p>
        )}
      </div>
    )
  }

  const renderSplitHint = () => {
    if (!amountValid) return null
    if (splitMode === 'amounts') {
      const ok = amountsPlan.valid
      return (
        <div className="flex items-center justify-between mt-2.5 px-1">
          <span className="text-[13px] text-gray-500 dark:text-slate-400">
            {t('stepWho.toSplit')}{' '}
            <strong className="text-gray-700 dark:text-slate-300">{formatCurrency(amount!, locale)}</strong>
          </span>
          <span
            className={`flex items-center gap-1.5 text-[13px] font-semibold ${
              ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {ok && <Check size={14} strokeWidth={2.5} />}
            {t('stepWho.leftToSplit')} {formatCurrency(amountsPlan.leftover, locale)}
          </span>
        </div>
      )
    }
    if (splitMode === 'shares' && includedParticipants.length > 0 && totalShares > 0) {
      const perShare = (isRefund ? -amount! : amount!) / totalShares
      const sharesLabel = t('stepWho.sharesCount', { count: totalShares })
      return (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-400/15 dark:border-amber-400/30 dark:text-amber-300 rounded-xl px-3.5 py-3 text-[13px] mt-2.5">
          <strong>{formatCurrency(isRefund ? -amount! : amount!, locale)}</strong> · {sharesLabel}{' '}
          {perPersonOp(perShare)} <strong>{formatCurrency(Math.round(perShare), locale)}</strong>{' '}
          {t('stepWho.perShare')}
        </div>
      )
    }
    return null
  }

  const renderInvitations = () => (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-300">{t('invites.title')}</span>
        <span className="text-xs text-gray-400 dark:text-slate-500">{t('invites.subtitle')}</span>
      </div>
      {autoBannerText && (
        <div className="flex items-center gap-2.5 bg-pink-50 border border-pink-200 dark:bg-pink-500/10 dark:border-pink-500/30 rounded-xl px-3 py-2.5 mb-2">
          <HeartHandshake size={15} className="text-pink-700 dark:text-pink-300 flex-shrink-0" />
          <span className="text-[13px] text-pink-900 dark:text-pink-200">
            {t('invites.autoPrefix')} <strong>{autoBannerText}</strong>{' '}
            {isEdit ? t('invites.autoSuffixEdit') : t('invites.autoSuffixCreate')}
          </span>
        </div>
      )}
      {manualInvites.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {manualInvites.map((inv, i) => {
            const host = participantById.get(inv.host)
            const guest = participantById.get(inv.guest)
            const guestName = guest ? accusativeName(guest, locale) : '—'
            const chipLabel =
              host && ownIds.includes(host.id) && ownParticipants.length === 1
                ? t('invites.youInvite', { guest: guestName })
                : t('invites.hostInvites', { host: host?.name ?? '—', guest: guestName })
            return (
              <span
                key={`${inv.host}-${inv.guest}-${i}`}
                className="flex items-center gap-1.5 bg-pink-50 text-pink-700 dark:bg-pink-500/10 dark:text-pink-300 text-[13px] font-medium px-3 py-2 rounded-full"
              >
                <HeartHandshake size={13} />
                {chipLabel}
                <button
                  type="button"
                  aria-label={t('invites.ariaRemove')}
                  onClick={() => setManualInvites((prev) => prev.filter((_, j) => j !== i))}
                  className="hover:text-pink-900 dark:hover:text-pink-100"
                >
                  <X size={13} />
                </button>
              </span>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <select
          value={draftHost}
          aria-label={t('invites.ariaHost')}
          onChange={(e) => setDraftHost(e.target.value === '' ? '' : Number(e.target.value))}
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">{t('invites.hostPlaceholder')}</option>
          {inviteHostOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-gray-500 dark:text-slate-400 flex-shrink-0">{t('invites.between')}</span>
        <select
          value=""
          aria-label={t('invites.ariaGuest')}
          disabled={draftHost === ''}
          onChange={(e) => {
            const guest = Number(e.target.value)
            if (draftHost !== '' && guest) {
              setManualInvites((prev) => [...prev, { host: draftHost, guest }])
              setDraftHost('')
            }
          }}
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white disabled:text-gray-400 disabled:bg-gray-50 dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 dark:disabled:text-slate-500 dark:disabled:bg-white/[0.03] focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">{t('invites.guestPlaceholder')}</option>
          {inviteGuestOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )

  const renderAttachmentThumbs = (size = 'w-11 h-11') => (
    <>
      {existingAttachments.map((att) => (
        <div key={`ex-${att.id}`} className={`relative ${size} flex-shrink-0`}>
          {att.mimeType?.startsWith('image/') && att.url ? (
            <img
              src={att.url}
              alt={att.alt || att.filename || t('attachments.receiptAlt')}
              className="w-full h-full object-cover rounded-lg border border-gray-200 dark:border-white/[0.12]"
            />
          ) : (
            <div className="w-full h-full rounded-lg border border-gray-200 bg-gray-50 dark:border-white/[0.12] dark:bg-white/[0.04] flex items-center justify-center text-gray-400 dark:text-slate-500">
              <FileText size={16} />
            </div>
          )}
          <button
            type="button"
            aria-label={t('attachments.ariaRemove')}
            onClick={() =>
              setExistingAttachments((prev) => prev.filter((a) => a.id !== att.id))
            }
            className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-gray-700 text-white flex items-center justify-center hover:bg-gray-900"
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        </div>
      ))}
      {newFiles.map((nf) => (
        <div key={nf.key} className={`relative ${size} flex-shrink-0`}>
          {nf.previewUrl ? (
            <img
              src={nf.previewUrl}
              alt={nf.file.name}
              className="w-full h-full object-cover rounded-lg border border-gray-200 dark:border-white/[0.12]"
            />
          ) : (
            <div className="w-full h-full rounded-lg border border-gray-200 bg-gray-50 dark:border-white/[0.12] dark:bg-white/[0.04] flex items-center justify-center text-gray-400 dark:text-slate-500">
              <FileText size={16} />
            </div>
          )}
          <button
            type="button"
            aria-label={t('attachments.ariaRemove')}
            onClick={() => removeNewFile(nf.key)}
            className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-gray-700 text-white flex items-center justify-center hover:bg-gray-900"
          >
            <X size={10} strokeWidth={2.5} />
          </button>
        </div>
      ))}
    </>
  )

  const hiddenFileInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(e.target.files)
            setMobileStep('details')
          }
          e.target.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </>
  )

  const errorBanner = error && (
    <div className="bg-red-50 border border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300 text-sm rounded-xl px-3.5 py-2.5">
      {error}
    </div>
  )

  // ═══ MOBILE: entry bottom sheet ══════════════════════════════════════
  if (!isDesktop && mobileStep === 'entry') {
    return createPortal(
      <div
        data-app-theme={theme}
        className="fixed inset-0 z-50"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
      >
        {hiddenFileInputs}
        <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} />
        <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-[#1b212c] dark:border dark:border-white/[0.06] rounded-t-[28px] px-5 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-20px_50px_rgba(0,0,0,0.35)] animate-slideUp">
          <div className="w-9 h-[5px] rounded-full bg-gray-300 dark:bg-white/[0.2] mx-auto mb-4" />
          <h3 className="font-serif text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">{t('headingNew')}</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">{t('entry.prompt')}</p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                track('expense_compose_started', { entry: 'photo' })
                cameraInputRef.current?.click()
              }}
              className="flex items-center gap-3.5 p-4 rounded-2xl border border-gray-200 bg-gray-50 active:bg-gray-100 dark:border-white/[0.12] dark:bg-white/[0.04] dark:active:bg-white/[0.07] text-left transition-colors"
            >
              <span className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Camera size={21} className="text-primary dark:text-primary-light" />
              </span>
              <span>
                <span className="block font-semibold text-gray-900 dark:text-gray-100">{t('entry.photo')}</span>
                <span className="block text-[13px] text-gray-500 dark:text-slate-400">{t('entry.photoHint')}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                track('expense_compose_started', { entry: 'manual' })
                setMobileStep('details')
              }}
              className="flex items-center gap-3.5 p-4 rounded-2xl border border-gray-200 bg-gray-50 active:bg-gray-100 dark:border-white/[0.12] dark:bg-white/[0.04] dark:active:bg-white/[0.07] text-left transition-colors"
            >
              <span className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Pencil size={19} className="text-primary dark:text-primary-light" />
              </span>
              <span>
                <span className="block font-semibold text-gray-900 dark:text-gray-100">{t('entry.manual')}</span>
                <span className="block text-[13px] text-gray-500 dark:text-slate-400">{t('entry.manualHint')}</span>
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-[15px] font-medium text-gray-500 dark:text-slate-400 pt-4"
          >
            {t('cancel')}
          </button>
        </div>
      </div>,
      document.body,
    )
  }

  // ═══ MOBILE: wizard steps ════════════════════════════════════════════
  if (!isDesktop) {
    const stepIndex = mobileStep === 'details' ? 1 : mobileStep === 'split' ? 2 : 3
    const stepLabel =
      mobileStep === 'details'
        ? t('wizard.stepWhat')
        : mobileStep === 'split'
          ? t('wizard.stepWho')
          : t('wizard.stepReview')
    const goBack = () => {
      if (mobileStep === 'details') {
        if (isEdit) onClose()
        else setMobileStep('entry')
      } else if (mobileStep === 'split') setMobileStep('details')
      // "Už zaplaceno" starts on the summary, so back leads to the amount
      else setMobileStep(markPaid ? 'details' : 'split')
    }

    return createPortal(
      <div
        data-app-theme={theme}
        className="fixed inset-0 z-50 bg-white dark:bg-[#1b212c] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
      >
        {hiddenFileInputs}
        {/* header */}
        <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
          <button
            type="button"
            onClick={goBack}
            aria-label={t('back')}
            className="p-1 -ml-1 text-gray-500 dark:text-slate-400"
          >
            <ChevronLeft size={24} />
          </button>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{heading}</span>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 dark:text-slate-400">
            {t('cancel')}
          </button>
        </div>
        {/* progress */}
        <div className="px-5">
          <div className="flex gap-1.5 mb-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-gray-200 dark:bg-white/[0.1]'}`}
              />
            ))}
          </div>
          <div className="text-[13px] text-gray-500 dark:text-slate-400 mb-4">
            {t('wizard.progress', { step: stepIndex, label: stepLabel })}
          </div>
        </div>

        {/* content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-5">
          {mobileStep === 'details' && (
            <>
              {(existingAttachments.length > 0 || newFiles.length > 0) && (
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.12] rounded-2xl px-3 py-2.5">
                  <div className="flex gap-2 flex-wrap flex-1 min-w-0 items-center">
                    {renderAttachmentThumbs()}
                    <span className="text-xs text-gray-400 dark:text-slate-500">{t('stepWhat.receiptAttached')}</span>
                  </div>
                </div>
              )}
              <div>
                <label
                  htmlFor="expense-title"
                  className="block text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-1.5"
                >
                  {t('stepWhat.titleLabel')}
                </label>
                <input
                  id="expense-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('stepWhat.titlePlaceholder')}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base text-gray-900 dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>
              <div>
                <label
                  htmlFor="expense-amount"
                  className="block text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-1.5"
                >
                  {t('stepWhat.amountLabelMobile')}
                </label>
                <div className="border-2 border-primary rounded-2xl px-3.5 py-3 flex items-baseline justify-center gap-2 shadow-[0_0_0_4px] shadow-primary/10">
                  <input
                    id="expense-amount"
                    type="text"
                    inputMode="numeric"
                    value={amountText}
                    onChange={(e) => setAmountText(sanitizeAmountInput(e.target.value))}
                    placeholder="0"
                    className="w-40 text-3xl font-bold text-gray-900 dark:text-gray-100 dark:placeholder-slate-500 text-right focus:outline-none bg-transparent"
                  />
                  <span className="text-lg text-gray-400 dark:text-slate-500 font-medium">{t('currencySuffix')}</span>
                </div>
                {renderAmountToggles()}
              </div>
              <div>
                <label
                  htmlFor="expense-date"
                  className="block text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-1.5"
                >
                  {t('stepWhat.dateLabelMobile')}
                </label>
                <div className="relative">
                  <Calendar
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none"
                  />
                  <input
                    id="expense-date"
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-3.5 py-3 text-[15px] text-gray-900 bg-white dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 dark:[color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-1.5">{t('stepWhat.payerLabel')}</div>
                {renderPayerChips()}
              </div>
            </>
          )}

          {mobileStep === 'split' && (
            <>
              <div className="flex bg-gray-100 dark:bg-white/[0.07] rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setSplitMode('equal')}
                  className={`flex-1 text-center text-sm py-2 rounded-lg transition-colors ${
                    splitMode === 'equal'
                      ? 'bg-white font-semibold text-gray-900 shadow-sm dark:bg-white/[0.12] dark:text-gray-100'
                      : 'font-medium text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {t('stepWho.modeEqual')}
                </button>
                <button
                  type="button"
                  onClick={() => splitMode === 'equal' && setSplitMode('shares')}
                  className={`flex-1 text-center text-sm py-2 rounded-lg transition-colors ${
                    splitMode !== 'equal'
                      ? 'bg-white font-semibold text-gray-900 shadow-sm dark:bg-white/[0.12] dark:text-gray-100'
                      : 'font-medium text-gray-500 dark:text-slate-400'
                  }`}
                >
                  {t('stepWho.selectShares')}
                </button>
              </div>
              {splitMode === 'equal' ? (
                renderEqualSummary(t('stepWho.selectShares'))
              ) : (
                <>
                  {renderSplitRows(splitMode === 'amounts' ? 'amounts' : 'shares')}
                  {renderSplitHint()}
                  {!isRefund && (
                    <button
                      type="button"
                      onClick={() =>
                        setSplitMode(splitMode === 'amounts' ? 'shares' : 'amounts')
                      }
                      className="text-center text-[13px] text-primary-dark dark:text-primary-light underline underline-offset-2"
                    >
                      {splitMode === 'amounts'
                        ? t('stepWho.switchToShares')
                        : t('stepWho.switchToAmounts')}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {mobileStep === 'review' && (
            <>
              {/* preview card */}
              <div className="bg-gray-50 border border-gray-200 dark:bg-white/[0.04] dark:border-white/[0.12] rounded-2xl p-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    {/* mirrors the finished card (ExpenseCard): planned wins
                        over refund in the styling */}
                    <div
                      className={`p-2 rounded-lg ${
                        isPlanned
                          ? 'bg-amber-100 dark:bg-amber-400/15'
                          : isRefund
                            ? 'bg-green-100 dark:bg-green-500/15'
                            : 'bg-primary/10'
                      }`}
                    >
                      {isPlanned ? (
                        <Clock size={20} className="text-amber-600 dark:text-amber-300" />
                      ) : isRefund ? (
                        <ArrowLeft size={20} className="text-green-600 dark:text-green-300" />
                      ) : (
                        <Receipt size={20} className="text-primary dark:text-primary-light" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 mb-0.5">
                      <span className="font-semibold text-[15px] text-gray-900 dark:text-gray-100 min-w-0 break-words">
                        {title || '—'}
                      </span>
                      <span
                        className={`font-bold text-[15px] flex-shrink-0 ${
                          isPlanned
                            ? 'text-amber-600 dark:text-amber-300'
                            : isRefund
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {amount !== null
                          ? formatCurrency(isRefund ? -amount : amount, locale)
                          : '—'}
                      </span>
                    </div>
                    <div className="text-[13px] text-gray-600 dark:text-slate-300 mb-2">
                      {t(isPlanned ? 'summary.willPay' : 'summary.paidBy')}{' '}
                      <strong>{payer ? payerName(payer) : '—'}</strong> ·{' '}
                      {formatDayShort(dateStr, locale)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {splitMode === 'equal' ? (
                        <span className="bg-white border border-gray-200 text-gray-700 dark:bg-white/[0.06] dark:border-white/[0.12] dark:text-slate-300 text-[11px] px-2 py-1 rounded-md">
                          {t('stepWho.modeEqual')}
                        </span>
                      ) : (
                        includedParticipants.map((p) => (
                          <span
                            key={p.id}
                            className="bg-white border border-gray-200 text-gray-700 dark:bg-white/[0.06] dark:border-white/[0.12] dark:text-slate-300 text-[11px] px-2 py-1 rounded-md"
                          >
                            {p.name.split(' ')[0]}:{' '}
                            {splitMode === 'shares'
                              ? `${rows[p.id]?.shares ?? 1}×`
                              : formatCurrency(
                                  amountsPlan.typedValues.get(p.id) ??
                                    amountsPlan.autoValues.get(p.id) ??
                                    0,
                                  locale,
                                )}
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2 mt-2.5 flex-wrap">
                      {renderAttachmentThumbs()}
                      <button
                        type="button"
                        aria-label={t('attachments.ariaAdd')}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-11 h-11 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 dark:border-white/[0.15] dark:text-slate-500 dark:hover:text-slate-300 dark:hover:border-white/[0.25] flex items-center justify-center"
                      >
                        <Camera size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {renderApprovalNote()}
              {renderInvitations()}
              {errorBanner}
            </>
          )}
        </div>

        {/* sticky CTA */}
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-white border-t border-gray-100 dark:bg-[#1b212c] dark:border-white/[0.07]">
          {mobileStep === 'review' ? (
            <>
              <button
                type="button"
                disabled={!formValid || saving}
                onClick={handleSave}
                className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-center font-semibold text-base rounded-2xl py-[15px] shadow-lg shadow-primary/40 transition-colors"
              >
                {saving ? t('saving') : saveLabel}
              </button>
              <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-2.5">
                {t('summary.editHint')}
              </p>
            </>
          ) : (
            <button
              type="button"
              disabled={mobileStep === 'details' ? !detailsValid : !splitValid}
              onClick={() => setMobileStep(mobileStep === 'details' ? 'split' : 'review')}
              className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-center font-semibold text-base rounded-2xl py-[15px] shadow-lg shadow-primary/40 transition-colors"
            >
              {t('continue')}
            </button>
          )}
        </div>
      </div>,
      document.body,
    )
  }

  // ═══ DESKTOP: single modal form ══════════════════════════════════════
  return createPortal(
    <div
      data-app-theme={theme}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      {hiddenFileInputs}
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => !saving && onClose()} />
      <div className="relative bg-white dark:bg-[#1b212c] dark:border dark:border-white/[0.06] rounded-3xl shadow-2xl w-full max-w-[720px] max-h-[92vh] flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100 dark:border-white/[0.07] flex-shrink-0">
          <h2 className="font-serif text-[22px] font-bold text-gray-900 dark:text-gray-100">{heading}</h2>
          <button
            type="button"
            aria-label={t('close')}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 dark:bg-white/[0.07] dark:hover:bg-white/[0.1] dark:text-slate-400 flex items-center justify-center transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-7 py-6 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label
                htmlFor="expense-title"
                className="block text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-1.5"
              >
                {t('stepWhat.titleLabel')}
              </label>
              <input
                id="expense-title"
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('stepWhat.titlePlaceholder')}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-[15px] text-gray-900 dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
            <div>
              <label
                htmlFor="expense-amount"
                className="block text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-1.5"
              >
                {t('stepWhat.amountLabel')}
              </label>
              <div className="relative">
                <input
                  id="expense-amount"
                  type="text"
                  inputMode="numeric"
                  value={amountText}
                  onChange={(e) => setAmountText(sanitizeAmountInput(e.target.value))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl pl-3.5 pr-10 py-3 text-lg font-bold text-gray-900 dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-slate-500 pointer-events-none">
                  {t('currencySuffix')}
                </span>
              </div>
              {renderRefundSwitch(true)}
            </div>
            <div>
              <label
                htmlFor="expense-date"
                className="block text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-1.5"
              >
                {t('stepWhat.dateLabel')}
              </label>
              <div className="relative">
                <Calendar
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 pointer-events-none"
                />
                <input
                  id="expense-date"
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3.5 py-3 text-[15px] text-gray-900 bg-white dark:bg-white/[0.06] dark:border-white/[0.15] dark:text-gray-100 dark:[color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              {renderPlannedSwitch(true)}
            </div>
            <div className="col-span-2">
              <div className="text-[13px] font-semibold text-gray-700 dark:text-slate-300 mb-1.5">{t('stepWhat.payerLabel')}</div>
              {renderPayerChips()}
            </div>
          </div>

          {/* attachments */}
          <div>
            <div className="text-xs font-bold tracking-[0.08em] uppercase text-gray-400 dark:text-slate-500 mb-2.5">
              {t('attachments.title')}
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                addFiles(e.dataTransfer.files)
              }}
              className={`border-2 border-dashed rounded-2xl px-5 py-4 flex items-center gap-4 transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-white/[0.12]'
              }`}
            >
              {(existingAttachments.length > 0 || newFiles.length > 0) && (
                <div className="flex gap-2.5 flex-wrap flex-shrink-0">
                  {renderAttachmentThumbs('w-12 h-12')}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('attachments.dropHere')}
                </div>
                <div className="text-[13px] text-gray-400 dark:text-slate-500">
                  {t('attachments.orPrefix')}{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary-dark dark:text-primary-light font-semibold hover:underline"
                  >
                    {t('attachments.chooseFile')}
                  </button>{' '}
                  {t('attachments.mobileHint')}
                </div>
              </div>
              <Upload size={22} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
            </div>
          </div>

          {/* split */}
          <div>
            <div className="text-xs font-bold tracking-[0.08em] uppercase text-gray-400 dark:text-slate-500 mb-2.5">
              {t('stepWho.sectionTitle')}
            </div>
            <div className="flex gap-2 mb-3.5 flex-wrap">
              {(
                [
                  { mode: 'equal' as const, label: t('stepWho.modeEqual') },
                  { mode: 'shares' as const, label: t('stepWho.modeShares') },
                  { mode: 'amounts' as const, label: t('stepWho.modeAmounts') },
                ] as const
              ).map(({ mode, label }) => {
                const disabled = mode === 'amounts' && isRefund
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    title={disabled ? t('stepWho.refundSharesOnly') : undefined}
                    onClick={() => setSplitMode(mode)}
                    className={`text-[13px] px-3.5 py-2 rounded-full border transition-colors ${
                      splitMode === mode
                        ? 'font-semibold text-white bg-primary border-primary'
                        : 'font-medium text-gray-500 border-gray-200 hover:border-gray-300 dark:text-slate-400 dark:border-white/[0.12] dark:hover:border-white/[0.25] disabled:opacity-40'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {splitMode === 'equal' ? (
              renderEqualSummary(t('stepWho.modeShares'))
            ) : (
              <>
                {renderSplitRows(splitMode === 'amounts' ? 'amounts' : 'shares')}
                {renderSplitHint()}
              </>
            )}
          </div>

          {/* invitations */}
          {renderInvitations()}
          {errorBanner}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-4 px-7 py-4 border-t border-gray-100 bg-gray-50/60 dark:border-white/[0.07] dark:bg-white/[0.03] flex-shrink-0">
          <div className="flex gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/[0.07] px-4.5 py-2.5 rounded-xl transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={!formValid || saving}
              onClick={handleSave}
              className="text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 px-5.5 py-2.5 rounded-xl shadow-lg shadow-primary/30 transition-colors"
            >
              {saving ? t('saving') : saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
