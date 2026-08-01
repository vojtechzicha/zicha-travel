// Helpers for the polymorphic payer/from reference (participant or joint
// account "společný účet") as delivered by the slug API (depth 1: populated
// docs wrapped in { relationTo, value }).

export interface PayerDisplay {
  kind: 'participant' | 'jointAccount'
  id: number | null
  name: string
  /** Participant IDs the payment is attributed to ([id] for a participant) */
  memberIds: number[]
}

export function getPayerDisplay(ref: unknown): PayerDisplay {
  if (typeof ref === 'number') {
    return { kind: 'participant', id: ref, name: '', memberIds: [ref] }
  }
  if (typeof ref !== 'object' || ref === null) {
    return { kind: 'participant', id: null, name: '', memberIds: [] }
  }
  if ('relationTo' in ref) {
    const { relationTo, value } = ref as { relationTo: string; value: unknown }
    const doc = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
    const id = doc ? (doc.id as number) : typeof value === 'number' ? value : null
    const name = doc ? ((doc.name as string) ?? '') : ''
    if (relationTo === 'joint-accounts') {
      const members = (doc?.members as unknown[] | undefined) ?? []
      const memberIds = members
        .map((m) => (typeof m === 'object' && m !== null ? (m as { id: number }).id : (m as number)))
        .filter((m): m is number => typeof m === 'number')
      return { kind: 'jointAccount', id, name, memberIds }
    }
    return { kind: 'participant', id, name, memberIds: id !== null ? [id] : [] }
  }
  // Legacy populated participant doc ({ id, name })
  const doc = ref as { id?: number; name?: string }
  const id = typeof doc.id === 'number' ? doc.id : null
  return { kind: 'participant', id, name: doc.name ?? '', memberIds: id !== null ? [id] : [] }
}

/** Is the participant the payer, or a member of the paying joint account? */
export function isPayerOrMember(ref: unknown, participantId: number): boolean {
  return getPayerDisplay(ref).memberIds.includes(participantId)
}

/**
 * The part of a joint-account payment attributed to one member (equal
 * split). For a personal payment this is the full amount.
 */
export function attributedShare(ref: unknown, amount: number): number {
  const payer = getPayerDisplay(ref)
  if (payer.kind === 'jointAccount' && payer.memberIds.length > 0) {
    return amount / payer.memberIds.length
  }
  return amount
}
