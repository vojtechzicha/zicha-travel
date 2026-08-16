// Data-subject rights machinery (compliance blocker 6): one person's
// complete export bundle, and anonymization that keeps the group's
// arithmetic intact. Driven from admin-panel buttons via the Participants
// collection endpoints — sized for a single part-time operator.

import type { Payload } from 'payload'
import { refId } from '@/lib/access'

const involvesParticipant = (value: unknown, participantId: string): boolean =>
  value != null && refId(value) === participantId

const payerMatches = (payer: unknown, participantId: string): boolean => {
  if (payer == null || typeof payer !== 'object') return involvesParticipant(payer, participantId)
  const poly = payer as { relationTo?: string; value?: unknown }
  if (poly.relationTo === 'participants') return involvesParticipant(poly.value, participantId)
  if (poly.relationTo === 'joint-accounts') return false
  return involvesParticipant(payer, participantId)
}

/**
 * Everything the system holds about ONE participant, without other
 * people's data: their own rows, their shares/invitations on expenses
 * (other participants' weights are not included), their prepayments,
 * joint-account membership, the linked account and its claim requests.
 */
export async function exportParticipantBundle(payload: Payload, participantId: number | string) {
  const pid = String(participantId)
  const participant = await payload.findByID({
    collection: 'participants',
    id: participantId,
    depth: 0,
  })
  const chataId = refId(participant.chata)
  const chata = await payload
    .findByID({
      collection: 'chatas',
      id: chataId,
      depth: 0,
      context: { triggerAfterRead: false },
    })
    .catch(() => null)

  const [expenses, prepayments, jointAccounts] = await Promise.all([
    payload.find({
      collection: 'expenses',
      where: { chata: { equals: chataId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'prepayments',
      where: { chata: { equals: chataId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'joint-accounts',
      where: { chata: { equals: chataId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const expenseRows = expenses.docs.flatMap((e) => {
    const weight = (e.weights ?? []).find((w) => involvesParticipant(w.participant, pid))
    const invitationsAsGuest = (e.invitations ?? []).filter((inv) =>
      involvesParticipant(inv.guest, pid),
    )
    const invitationsAsHost = (e.invitations ?? []).filter((inv) =>
      involvesParticipant(inv.host, pid),
    )
    const isPayer = payerMatches(e.payer, pid)
    if (!weight && invitationsAsGuest.length === 0 && invitationsAsHost.length === 0 && !isPayer) {
      return []
    }
    return [
      {
        id: e.id,
        title: e.title,
        amount: e.amount,
        splitType: e.splitType,
        isPlanned: e.isPlanned ?? false,
        isPayer,
        ownWeight: weight?.weight ?? null,
        invitedByHostId: invitationsAsGuest.map((inv) => Number(refId(inv.host))),
        hostsGuestIds: invitationsAsHost.map((inv) => Number(refId(inv.guest))),
      },
    ]
  })

  const ownJointAccounts = jointAccounts.docs.filter((ja) =>
    (ja.members ?? []).some((m) => involvesParticipant(m, pid)),
  )
  const ownJointAccountIds = new Set(ownJointAccounts.map((ja) => String(ja.id)))

  const prepaymentRows = prepayments.docs.flatMap((p) => {
    const from = p.from as { relationTo?: string; value?: unknown } | null
    const direct = from?.relationTo === 'participants' && involvesParticipant(from.value, pid)
    const viaJoint =
      from?.relationTo === 'joint-accounts' &&
      from.value != null &&
      ownJointAccountIds.has(refId(from.value))
    if (!direct && !viaJoint) return []
    return [
      {
        id: p.id,
        type: p.type,
        amount: p.amount,
        note: p.note ?? null,
        viaJointAccount: viaJoint,
      },
    ]
  })

  // Linked account, its authored expenses and claim requests
  let account: Record<string, unknown> | null = null
  let authoredExpenses: Array<Record<string, unknown>> = []
  let claimRequests: Array<Record<string, unknown>> = []
  const accountId = participant.account != null ? refId(participant.account) : null
  if (accountId != null) {
    const user = await payload
      .findByID({ collection: 'users', id: accountId, depth: 0, overrideAccess: true })
      .catch(() => null)
    if (user) {
      account = {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        vokativ: user.vokativ ?? null,
        role: user.role,
        lastLoginAt: user.lastLoginAt ?? null,
        createdAt: user.createdAt,
      }
      const authored = await payload.find({
        collection: 'expenses',
        where: { authoredBy: { equals: user.id } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
      authoredExpenses = authored.docs.map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        chata: e.chata != null ? Number(refId(e.chata)) : null,
      }))
    }
  }
  const claims = await payload.find({
    collection: 'claim-requests',
    where: {
      or: [
        { participant: { equals: participant.id } },
        ...(accountId != null ? [{ user: { equals: accountId } }] : []),
      ],
    },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  claimRequests = claims.docs.map((c) => ({
    id: c.id,
    status: c.status,
    createdAt: c.createdAt,
    decidedAt: c.decidedAt ?? null,
    rejectionReason: c.reason ?? null,
  }))

  return {
    exportedAt: new Date().toISOString(),
    participant: {
      id: participant.id,
      name: participant.name,
      akuzativ: participant.akuzativ ?? null,
      vokativ: participant.vokativ ?? null,
      hasPet: participant.hasPet ?? false,
      accountNumber: participant.accountNumber ?? null,
      iban: participant.iban ?? null,
      paidBy: participant.paidBy != null ? Number(refId(participant.paidBy)) : null,
      createdAt: participant.createdAt,
    },
    chata: chata ? { id: chata.id, name: chata.name, slug: chata.slug } : null,
    expenses: expenseRows,
    prepayments: prepaymentRows,
    jointAccounts: ownJointAccounts.map((ja) => ({ id: ja.id, name: ja.name })),
    account,
    authoredExpenses,
    claimRequests,
  }
}

export interface AnonymizeSummary {
  placeholderName: string
  assignmentsCleared: boolean
  accountDetached: boolean
}

/**
 * Erasure with the recorded limit (policy section 10): identity goes,
 * arithmetic stays. Name and declension forms become a placeholder, email
 * link/bank fields/pet flag/assignments are cleared, amounts and shares
 * remain so settled trips still add up.
 */
export async function anonymizeParticipant(
  payload: Payload,
  participantId: number | string,
): Promise<AnonymizeSummary> {
  const pid = String(participantId)
  const participant = await payload.findByID({
    collection: 'participants',
    id: participantId,
    depth: 0,
  })
  const placeholderName = `Anonymizovaný účastník ${participant.id}`
  const accountDetached = participant.account != null

  await payload.update({
    collection: 'participants',
    id: participant.id,
    data: {
      name: placeholderName,
      akuzativ: null,
      vokativ: null,
      accountNumber: null,
      iban: null,
      hasPet: false,
      paidBy: null,
      account: null,
    },
    depth: 0,
    overrideAccess: true,
  })

  // Assignments on the chata: bed occupancy, car seats, transport riders
  const chataId = refId(participant.chata)
  let assignmentsCleared = false
  const chata = await payload
    .findByID({
      collection: 'chatas',
      id: chataId,
      depth: 0,
      context: { triggerAfterRead: false },
    })
    .catch(() => null)
  if (chata) {
    const data: Record<string, unknown> = {}
    if (Array.isArray(chata.rooms)) {
      data.rooms = chata.rooms.map((room) => ({
        ...room,
        beds: (room.beds ?? []).map((bed) => ({
          ...bed,
          occupants: (bed.occupants ?? []).filter(
            (o) => !involvesParticipant(o.participant, pid),
          ),
        })),
      }))
    }
    if (Array.isArray(chata.sharedCars)) {
      data.sharedCars = chata.sharedCars.map((car) => ({
        ...car,
        driver: involvesParticipant(car.driver, pid) ? null : car.driver,
        passengers: (car.passengers ?? []).filter(
          (p) => !involvesParticipant(p.participant, pid),
        ),
      }))
    }
    if (Array.isArray(chata.publicTransportOptions)) {
      data.publicTransportOptions = chata.publicTransportOptions.map((option) => ({
        ...option,
        riders: (option.riders ?? []).filter((r) => !involvesParticipant(r.participant, pid)),
      }))
    }
    if (Object.keys(data).length > 0) {
      await payload.update({
        collection: 'chatas',
        id: chata.id,
        data,
        depth: 0,
        overrideAccess: true,
        context: { triggerAfterRead: false },
      })
      assignmentsCleared = true
    }
  }

  return { placeholderName, assignmentsCleared, accountDetached }
}
