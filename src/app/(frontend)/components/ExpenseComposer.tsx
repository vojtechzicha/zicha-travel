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
import { formatCurrency, getAvatarColor, getInitials } from '@/lib/formatCurrency'
import { akuzativName } from '@/lib/czechNames'
import { ownJointAccounts } from '@/lib/expenseAuthoring'
import { downscaleImage } from '@/lib/imageDownscale'
import type { FinanceViewer } from '@/lib/financeAccess'
import type { Chata, Expense, ExpenseAttachment, JointAccount, Participant } from '@/payload-types'

interface ExpenseComposerProps {
  chata: Chata
  participants: Participant[]
  jointAccounts: JointAccount[]
  viewer: FinanceViewer
  /** null = create; an expense = edit (same form, prefilled) */
  expense: Expense | null
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

const formatDayShort = (dateStr: string): string => {
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return new Intl.DateTimeFormat('cs-CZ', {
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
  onClose,
  onSaved,
}: ExpenseComposerProps) {
  const isEdit = expense !== null
  const isDesktop = useIsDesktop()

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

  const [mobileStep, setMobileStep] = useState<MobileStep>(isEdit ? 'details' : 'entry')
  const [title, setTitle] = useState(expense?.title ?? '')
  const [amountText, setAmountText] = useState(
    expense ? String(Math.round(Math.abs(expense.amount))) : '',
  )
  const [isRefund, setIsRefund] = useState((expense?.amount ?? 0) < 0)
  const [dateStr, setDateStr] = useState(toDateInput(expense?.createdAt ?? new Date()))
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
      const guestName = akuzativName(guest)
      return host && ownIds.includes(host.id)
        ? `platíte za ${guestName}`
        : `${host?.name ?? '—'} platí za ${guestName}`
    })
    return parts.filter(Boolean).join(', ')
  }, [applicableAutoPairs, participantById, ownIds])

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
          throw new Error(`Soubor „${nf.file.name}“ je příliš velký (max 4 MB).`)
        }
        const fd = new FormData()
        fd.append('file', prepared)
        const res = await fetch('/api/expense-attachments', {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
        })
        if (!res.ok) throw new Error('Nahrání účtenky se nepovedlo. Zkuste to znovu.')
        const json = await res.json()
        const id = json?.doc?.id
        if (typeof id !== 'number') throw new Error('Nahrání účtenky se nepovedlo.')
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
      }

      const res = await fetch(isEdit ? `/api/expenses/${expense!.id}` : '/api/expenses', {
        method: isEdit ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(
          json?.errors?.[0]?.message || 'Uložení výdaje se nepovedlo. Zkuste to znovu.',
        )
      }
      await onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uložení výdaje se nepovedlo.')
      setSaving(false)
    }
  }

  // ── shared render helpers ────────────────────────────────────────────
  const heading = isEdit ? 'Upravit výdaj' : 'Nový výdaj'

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
        label: ownParticipants.length === 1 ? 'Vy' : `${p.name} (vy)`,
        initialsOf: p.name,
      })
    }
    for (const ja of payableJointAccounts) {
      options.push({ choice: { relationTo: 'joint-accounts', value: ja.id }, label: ja.name })
    }
    // an edited expense may have a payer outside the viewer's options
    // (assigned by an admin) — keep it selectable so saving doesn't break
    if (
      payer &&
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
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
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
                    : 'border-gray-200 hover:border-gray-300'
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
                  className={`text-sm ${selected ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
                >
                  {option.label}
                </span>
                {selected && <Check size={16} className="text-primary" strokeWidth={2.5} />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const renderRefundToggle = (compact = false) => (
    <div
      className={`flex items-center gap-2 ${compact ? 'mt-2' : 'justify-between mt-2.5 px-0.5'}`}
    >
      {compact && (
        <button
          type="button"
          role="switch"
          aria-checked={isRefund}
          onClick={() => setIsRefund((v) => !v)}
          className={`relative w-[38px] h-[22px] rounded-full flex-shrink-0 transition-colors ${
            isRefund ? 'bg-green-500' : 'bg-gray-200'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${
              isRefund ? 'translate-x-4' : ''
            }`}
          />
        </button>
      )}
      <span className="text-sm text-gray-600">Byly vám vráceny peníze (vratka)</span>
      {!compact && (
        <button
          type="button"
          role="switch"
          aria-checked={isRefund}
          onClick={() => setIsRefund((v) => !v)}
          className={`relative w-[46px] h-7 rounded-full flex-shrink-0 transition-colors ${
            isRefund ? 'bg-green-500' : 'bg-gray-200'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
              isRefund ? 'translate-x-[18px]' : ''
            }`}
          />
        </button>
      )}
    </div>
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
        const label = isOwn ? `${p.name} (vy)` : p.name
        const isAuto =
          mode === 'amounts' && row.included && row.amountText.trim() === ''
        const autoValue = amountsPlan.autoValues.get(p.id)
        return (
          <div
            key={p.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
              !row.included
                ? 'border-dashed border-gray-200 opacity-55'
                : isAuto
                  ? 'border-2 border-primary bg-primary/5'
                  : 'border-gray-200'
            }`}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={row.included}
              aria-label={`Účastní se: ${p.name}`}
              onClick={() => setRow(p.id, { included: !row.included })}
              className={`w-[22px] h-[22px] rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                row.included ? 'bg-primary' : 'border-2 border-gray-300'
              }`}
            >
              {row.included && <Check size={14} className="text-white" strokeWidth={3} />}
            </button>
            <span
              className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ${getAvatarColor(p.name)}`}
            >
              {getInitials(p.name)}
            </span>
            <span className="flex-1 min-w-0 truncate text-[15px] font-medium text-gray-900">
              {label}
            </span>
            {row.included && mode === 'shares' && (
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white flex-shrink-0">
                <button
                  type="button"
                  aria-label="Méně podílů"
                  onClick={() => setRow(p.id, { shares: Math.max(1, row.shares - 1) })}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                >
                  <Minus size={14} />
                </button>
                <span
                  className={`w-9 text-center text-sm ${
                    row.shares !== 1 ? 'font-bold text-primary' : 'font-semibold text-gray-900'
                  }`}
                >
                  {row.shares}×
                </span>
                <button
                  type="button"
                  aria-label="Více podílů"
                  onClick={() => setRow(p.id, { shares: row.shares + 1 })}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
            {row.included && mode === 'amounts' && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {isAuto && (
                  <span className="text-xs text-primary-dark font-medium">dopočítáno</span>
                )}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={isAuto ? (autoValue !== undefined ? String(autoValue) : '') : row.amountText}
                    placeholder="0"
                    aria-label={`Částka pro ${p.name}`}
                    onChange={(e) => setRow(p.id, { amountText: sanitizeAmountInput(e.target.value) })}
                    onFocus={(e) => {
                      // touching the auto field makes it a typed one
                      if (isAuto && autoValue !== undefined) {
                        setRow(p.id, { amountText: String(autoValue) })
                        requestAnimationFrame(() => e.target.select())
                      }
                    }}
                    className={`w-24 text-right text-sm font-semibold rounded-lg border pl-2 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                      isAuto
                        ? 'border-primary text-primary-dark bg-white'
                        : 'border-gray-200 text-gray-900'
                    }`}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                    Kč
                  </span>
                </div>
              </div>
            )}
            {!row.included && <span className="text-[13px] text-gray-400">neúčastní se</span>}
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
    // Czech plural: 1 účastník, 2–4 všichni … účastníci, 5+ všech … účastníků
    const headline =
      count === 1
        ? 'Jediný účastník'
        : count <= 4
          ? `Všichni ${count} účastníci`
          : `Všech ${count} účastníků`
    const total = amount !== null ? (isRefund ? -amount : amount) : null
    return (
      <div>
        <div className="border border-gray-200 rounded-2xl px-5 py-5 text-center">
          <div className="flex justify-center mb-3.5">
            {shown.map((p, i) => (
              <span
                key={p.id}
                className={`w-11 h-11 rounded-full text-white text-sm font-bold flex items-center justify-center border-[3px] border-white shadow-sm ${getAvatarColor(p.name)} ${i > 0 ? '-ml-2.5' : ''}`}
              >
                {getInitials(p.name)}
              </span>
            ))}
            {extra > 0 && (
              <span className="w-11 h-11 rounded-full bg-gray-200 text-gray-600 text-sm font-bold flex items-center justify-center border-[3px] border-white shadow-sm -ml-2.5">
                +{extra}
              </span>
            )}
          </div>
          <div className="text-[15px] font-semibold text-gray-900 mb-1">{headline}</div>
          {total !== null && count > 0 && (
            <div className="text-sm text-gray-500">
              {formatCurrency(total)} ÷ {count} {perPersonOp(total / count)}{' '}
              <strong className="text-gray-900">{formatCurrency(Math.round(total / count))}</strong>{' '}
              na osobu
            </div>
          )}
        </div>
        {count > 1 && (
          <p className="text-[13px] text-gray-400 text-center mt-3.5">
            Platí to jen část lidí, nebo nerovným dílem? Přepněte na „{switchLabel}“.
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
          <span className="text-[13px] text-gray-500">
            Rozdělit: <strong className="text-gray-700">{formatCurrency(amount!)}</strong>
          </span>
          <span
            className={`flex items-center gap-1.5 text-[13px] font-semibold ${
              ok ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {ok && <Check size={14} strokeWidth={2.5} />}
            Zbývá rozdělit: {formatCurrency(amountsPlan.leftover)}
          </span>
        </div>
      )
    }
    if (splitMode === 'shares' && includedParticipants.length > 0 && totalShares > 0) {
      const perShare = (isRefund ? -amount! : amount!) / totalShares
      // Czech plural: 1 podíl, 2–4 podíly, 5+ podílů
      const sharesLabel =
        totalShares === 1
          ? '1 podíl'
          : `${totalShares} ${totalShares >= 2 && totalShares <= 4 ? 'podíly' : 'podílů'}`
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-[13px] text-amber-800 mt-2.5">
          <strong>{formatCurrency(isRefund ? -amount! : amount!)}</strong> · {sharesLabel}{' '}
          {perPersonOp(perShare)} <strong>{formatCurrency(Math.round(perShare))}</strong> na podíl.
        </div>
      )
    }
    return null
  }

  const renderInvitations = () => (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-700">Pozvání</span>
        <span className="text-xs text-gray-400">hostitel zaplatí podíl pozvaného</span>
      </div>
      {autoBannerText && (
        <div className="flex items-center gap-2.5 bg-pink-50 border border-pink-200 rounded-xl px-3 py-2.5 mb-2">
          <HeartHandshake size={15} className="text-pink-700 flex-shrink-0" />
          <span className="text-[13px] text-pink-900">
            Automaticky: <strong>{autoBannerText}</strong>
            {isEdit ? ' (trvalé nastavení).' : ' — přidá se samo.'}
          </span>
        </div>
      )}
      {manualInvites.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {manualInvites.map((inv, i) => {
            const host = participantById.get(inv.host)
            const guest = participantById.get(inv.guest)
            const hostLabel =
              host && ownIds.includes(host.id) && ownParticipants.length === 1
                ? 'Vy zvete'
                : `${host?.name ?? '—'} zve`
            return (
              <span
                key={`${inv.host}-${inv.guest}-${i}`}
                className="flex items-center gap-1.5 bg-pink-50 text-pink-700 text-[13px] font-medium px-3 py-2 rounded-full"
              >
                <HeartHandshake size={13} />
                {hostLabel} {guest ? akuzativName(guest) : '—'}
                <button
                  type="button"
                  aria-label="Odebrat pozvání"
                  onClick={() => setManualInvites((prev) => prev.filter((_, j) => j !== i))}
                  className="hover:text-pink-900"
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
          aria-label="Hostitel pozvání"
          onChange={(e) => setDraftHost(e.target.value === '' ? '' : Number(e.target.value))}
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Kdo zve…</option>
          {inviteHostOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-gray-500 flex-shrink-0">zve</span>
        <select
          value=""
          aria-label="Pozvaný"
          disabled={draftHost === ''}
          onChange={(e) => {
            const guest = Number(e.target.value)
            if (draftHost !== '' && guest) {
              setManualInvites((prev) => [...prev, { host: draftHost, guest }])
              setDraftHost('')
            }
          }}
          className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white disabled:text-gray-400 disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">Vyberte…</option>
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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={att.url}
              alt={att.alt || att.filename || 'účtenka'}
              className="w-full h-full object-cover rounded-lg border border-gray-200"
            />
          ) : (
            <div className="w-full h-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400">
              <FileText size={16} />
            </div>
          )}
          <button
            type="button"
            aria-label="Odebrat přílohu"
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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={nf.previewUrl}
              alt={nf.file.name}
              className="w-full h-full object-cover rounded-lg border border-gray-200"
            />
          ) : (
            <div className="w-full h-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400">
              <FileText size={16} />
            </div>
          )}
          <button
            type="button"
            aria-label="Odebrat přílohu"
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
    <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-3.5 py-2.5">
      {error}
    </div>
  )

  // ═══ MOBILE: entry bottom sheet ══════════════════════════════════════
  if (!isDesktop && mobileStep === 'entry') {
    return createPortal(
      <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={heading}>
        {hiddenFileInputs}
        <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} />
        <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[28px] px-5 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-20px_50px_rgba(0,0,0,0.35)] animate-slideUp">
          <div className="w-9 h-[5px] rounded-full bg-gray-300 mx-auto mb-4" />
          <h3 className="font-serif text-xl font-bold text-gray-900 mb-1">Nový výdaj</h3>
          <p className="text-sm text-gray-500 mb-4">Jak ho chcete zadat?</p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center gap-3.5 p-4 rounded-2xl border border-gray-200 bg-gray-50 text-left active:bg-gray-100 transition-colors"
            >
              <span className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Camera size={21} className="text-primary" />
              </span>
              <span>
                <span className="block font-semibold text-gray-900">Vyfotit účtenku</span>
                <span className="block text-[13px] text-gray-500">
                  Částku a popis doplníte v dalším kroku
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMobileStep('details')}
              className="flex items-center gap-3.5 p-4 rounded-2xl border border-gray-200 bg-gray-50 text-left active:bg-gray-100 transition-colors"
            >
              <span className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Pencil size={19} className="text-primary" />
              </span>
              <span>
                <span className="block font-semibold text-gray-900">Zadat ručně</span>
                <span className="block text-[13px] text-gray-500">
                  Účtenku můžete přiložit kdykoli později
                </span>
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-[15px] font-medium text-gray-500 pt-4"
          >
            Zrušit
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
        ? 'Co a kolik'
        : mobileStep === 'split'
          ? 'Kdo se dělí'
          : 'Zkontrolovat a uložit'
    const goBack = () => {
      if (mobileStep === 'details') {
        if (isEdit) onClose()
        else setMobileStep('entry')
      } else if (mobileStep === 'split') setMobileStep('details')
      else setMobileStep('split')
    }

    return createPortal(
      <div
        className="fixed inset-0 z-50 bg-white flex flex-col"
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
            aria-label="Zpět"
            className="p-1 -ml-1 text-gray-500"
          >
            <ChevronLeft size={24} />
          </button>
          <span className="font-semibold text-gray-900">{heading}</span>
          <button type="button" onClick={onClose} className="text-sm text-gray-500">
            Zrušit
          </button>
        </div>
        {/* progress */}
        <div className="px-5">
          <div className="flex gap-1.5 mb-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-gray-200'}`}
              />
            ))}
          </div>
          <div className="text-[13px] text-gray-500 mb-4">
            Krok {stepIndex} ze 3 · {stepLabel}
          </div>
        </div>

        {/* content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-5">
          {mobileStep === 'details' && (
            <>
              {(existingAttachments.length > 0 || newFiles.length > 0) && (
                <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5">
                  <div className="flex gap-2 flex-wrap flex-1 min-w-0 items-center">
                    {renderAttachmentThumbs()}
                    <span className="text-xs text-gray-400">účtenka přiložena</span>
                  </div>
                </div>
              )}
              <div>
                <label
                  htmlFor="expense-title"
                  className="block text-[13px] font-semibold text-gray-700 mb-1.5"
                >
                  Co jste platili?
                </label>
                <input
                  id="expense-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="např. Velký nákup potravin"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>
              <div>
                <label
                  htmlFor="expense-amount"
                  className="block text-[13px] font-semibold text-gray-700 mb-1.5"
                >
                  Kolik to stálo?
                </label>
                <div className="border-2 border-primary rounded-2xl px-3.5 py-3 flex items-baseline justify-center gap-2 shadow-[0_0_0_4px] shadow-primary/10">
                  <input
                    id="expense-amount"
                    type="text"
                    inputMode="numeric"
                    value={amountText}
                    onChange={(e) => setAmountText(sanitizeAmountInput(e.target.value))}
                    placeholder="0"
                    className="w-40 text-3xl font-bold text-gray-900 text-right focus:outline-none bg-transparent"
                  />
                  <span className="text-lg text-gray-400 font-medium">Kč</span>
                </div>
                {renderRefundToggle()}
              </div>
              <div>
                <label
                  htmlFor="expense-date"
                  className="block text-[13px] font-semibold text-gray-700 mb-1.5"
                >
                  Kdy?
                </label>
                <div className="relative">
                  <Calendar
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                  <input
                    id="expense-date"
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-3.5 py-3 text-[15px] text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-gray-700 mb-1.5">Kdo platil?</div>
                {renderPayerChips()}
              </div>
            </>
          )}

          {mobileStep === 'split' && (
            <>
              <div className="flex bg-gray-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setSplitMode('equal')}
                  className={`flex-1 text-center text-sm py-2 rounded-lg transition-colors ${
                    splitMode === 'equal'
                      ? 'bg-white font-semibold text-gray-900 shadow-sm'
                      : 'font-medium text-gray-500'
                  }`}
                >
                  Všichni rovným dílem
                </button>
                <button
                  type="button"
                  onClick={() => splitMode === 'equal' && setSplitMode('shares')}
                  className={`flex-1 text-center text-sm py-2 rounded-lg transition-colors ${
                    splitMode !== 'equal'
                      ? 'bg-white font-semibold text-gray-900 shadow-sm'
                      : 'font-medium text-gray-500'
                  }`}
                >
                  Vybrat podíly
                </button>
              </div>
              {splitMode === 'equal' ? (
                renderEqualSummary('Vybrat podíly')
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
                      className="text-center text-[13px] text-primary-dark underline underline-offset-2"
                    >
                      {splitMode === 'amounts'
                        ? 'Raději rozdělit na podíly'
                        : 'Raději zadat přesné částky v Kč'}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {mobileStep === 'review' && (
            <>
              {/* preview card */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div
                      className={`p-2 rounded-lg ${isRefund ? 'bg-green-100' : 'bg-primary/10'}`}
                    >
                      {isRefund ? (
                        <ArrowLeft size={20} className="text-green-600" />
                      ) : (
                        <Receipt size={20} className="text-primary" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2 mb-0.5">
                      <span className="font-semibold text-[15px] text-gray-900 min-w-0 break-words">
                        {title || '—'}
                      </span>
                      <span
                        className={`font-bold text-[15px] flex-shrink-0 ${
                          isRefund ? 'text-green-600' : 'text-gray-900'
                        }`}
                      >
                        {amount !== null
                          ? formatCurrency(isRefund ? -amount : amount)
                          : '—'}
                      </span>
                    </div>
                    <div className="text-[13px] text-gray-600 mb-2">
                      Platí <strong>{payer ? payerName(payer) : '—'}</strong> ·{' '}
                      {formatDayShort(dateStr)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {splitMode === 'equal' ? (
                        <span className="bg-white border border-gray-200 text-gray-700 text-[11px] px-2 py-1 rounded-md">
                          Všichni rovným dílem
                        </span>
                      ) : (
                        includedParticipants.map((p) => (
                          <span
                            key={p.id}
                            className="bg-white border border-gray-200 text-gray-700 text-[11px] px-2 py-1 rounded-md"
                          >
                            {p.name.split(' ')[0]}:{' '}
                            {splitMode === 'shares'
                              ? `${rows[p.id]?.shares ?? 1}×`
                              : formatCurrency(
                                  amountsPlan.typedValues.get(p.id) ??
                                    amountsPlan.autoValues.get(p.id) ??
                                    0,
                                )}
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2 mt-2.5 flex-wrap">
                      {renderAttachmentThumbs()}
                      <button
                        type="button"
                        aria-label="Přiložit účtenku"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-11 h-11 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400"
                      >
                        <Camera size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {renderInvitations()}
              {errorBanner}
            </>
          )}
        </div>

        {/* sticky CTA */}
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-white border-t border-gray-100">
          {mobileStep === 'review' ? (
            <>
              <button
                type="button"
                disabled={!formValid || saving}
                onClick={handleSave}
                className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-center font-semibold text-base rounded-2xl py-[15px] shadow-lg shadow-primary/40 transition-colors"
              >
                {saving ? 'Ukládám…' : 'Uložit výdaj'}
              </button>
              <p className="text-center text-xs text-gray-400 mt-2.5">
                Výdaj můžete kdykoli upravit nebo smazat.
              </p>
            </>
          ) : (
            <button
              type="button"
              disabled={mobileStep === 'details' ? !detailsValid : !splitValid}
              onClick={() => setMobileStep(mobileStep === 'details' ? 'split' : 'review')}
              className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-center font-semibold text-base rounded-2xl py-[15px] shadow-lg shadow-primary/40 transition-colors"
            >
              Pokračovat
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
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      {hiddenFileInputs}
      <div className="absolute inset-0 bg-slate-900/60" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-[720px] max-h-[92vh] flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-serif text-[22px] font-bold text-gray-900">{heading}</h2>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
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
                className="block text-[13px] font-semibold text-gray-700 mb-1.5"
              >
                Co jste platili?
              </label>
              <input
                id="expense-title"
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="např. Velký nákup potravin"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-[15px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </div>
            <div>
              <label
                htmlFor="expense-amount"
                className="block text-[13px] font-semibold text-gray-700 mb-1.5"
              >
                Částka
              </label>
              <div className="relative">
                <input
                  id="expense-amount"
                  type="text"
                  inputMode="numeric"
                  value={amountText}
                  onChange={(e) => setAmountText(sanitizeAmountInput(e.target.value))}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl pl-3.5 pr-10 py-3 text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
                  Kč
                </span>
              </div>
              {renderRefundToggle(true)}
            </div>
            <div>
              <label
                htmlFor="expense-date"
                className="block text-[13px] font-semibold text-gray-700 mb-1.5"
              >
                Datum
              </label>
              <div className="relative">
                <Calendar
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  id="expense-date"
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3.5 py-3 text-[15px] text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[13px] font-semibold text-gray-700 mb-1.5">Kdo platil?</div>
              {renderPayerChips()}
            </div>
          </div>

          {/* attachments */}
          <div>
            <div className="text-xs font-bold tracking-[0.08em] uppercase text-gray-400 mb-2.5">
              Účtenky
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
                dragActive ? 'border-primary bg-primary/5' : 'border-gray-200'
              }`}
            >
              {(existingAttachments.length > 0 || newFiles.length > 0) && (
                <div className="flex gap-2.5 flex-wrap flex-shrink-0">
                  {renderAttachmentThumbs('w-12 h-12')}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-700">
                  Přetáhněte sem fotky nebo PDF
                </div>
                <div className="text-[13px] text-gray-400">
                  …nebo{' '}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-primary-dark font-semibold hover:underline"
                  >
                    vyberte soubor
                  </button>{' '}
                  · na mobilu jde rovnou vyfotit
                </div>
              </div>
              <Upload size={22} className="text-gray-400 flex-shrink-0" />
            </div>
          </div>

          {/* split */}
          <div>
            <div className="text-xs font-bold tracking-[0.08em] uppercase text-gray-400 mb-2.5">
              Rozdělení
            </div>
            <div className="flex gap-2 mb-3.5 flex-wrap">
              {(
                [
                  { mode: 'equal' as const, label: 'Všichni rovným dílem' },
                  { mode: 'shares' as const, label: 'Podíly' },
                  { mode: 'amounts' as const, label: 'Přesné částky' },
                ] as const
              ).map(({ mode, label }) => {
                const disabled = mode === 'amounts' && isRefund
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    title={disabled ? 'U vratky zadejte podíly' : undefined}
                    onClick={() => setSplitMode(mode)}
                    className={`text-[13px] px-3.5 py-2 rounded-full border transition-colors ${
                      splitMode === mode
                        ? 'font-semibold text-white bg-primary border-primary'
                        : 'font-medium text-gray-500 border-gray-200 hover:border-gray-300 disabled:opacity-40'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {splitMode === 'equal' ? (
              renderEqualSummary('Podíly')
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
        <div className="flex items-center justify-end gap-4 px-7 py-4 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
          <div className="flex gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-sm font-semibold text-gray-600 px-4.5 py-2.5 rounded-xl hover:bg-gray-100 transition-colors"
            >
              Zrušit
            </button>
            <button
              type="button"
              disabled={!formValid || saving}
              onClick={handleSave}
              className="text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 px-5.5 py-2.5 rounded-xl shadow-lg shadow-primary/30 transition-colors"
            >
              {saving ? 'Ukládám…' : 'Uložit výdaj'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
