// Reading a chata for a connector tool: the slug API payload as the caller's
// browser gets it (privacy scrub, finance gating and pending/private
// visibility included), plus small resolvers that let the agent name people
// and chatas by name instead of id.

import { refId } from '@/lib/access'
import { fetchChataPayload, type Caller } from './loopback'
import { ToolError, expectOk } from './tool-kit'

export interface ChataPayload {
  chata: any
  participants: any[]
  expenses: any[]
  prepayments: any[]
  jointAccounts: any[]
  stats: any
  viewer: {
    authenticated: boolean
    userId: number | null
    role: string | null
    canViewAll: boolean
    linkedParticipantIds: number[]
  }
  locked: Array<{ id: number; maskedEmail: string }>
  pendingClaims: number[]
  viewerClaims: Array<{ id: number; participantId: number; status: string; createdAt: string }>
  planning: any
  shopping: any
  beer: any
  /** the chata as resolved for the tool call (added by loadChata) */
  ref: ChataRef
}

export interface ChataRef {
  id: number
  slug: string
  name: string
}

/** A chata by id, slug or (unique, case-insensitive) name. Chatas are public. */
export async function resolveChata(caller: Caller, ref: string | number): Promise<ChataRef> {
  const text = String(ref).trim()
  if (!text) throw new ToolError('Name a chata (id, slug or name). get_context lists yours.')
  const asId = /^\d+$/.test(text) ? Number(text) : null
  const result = await caller.payload.find({
    collection: 'chatas',
    where: asId != null
      ? { or: [{ id: { equals: asId } }, { slug: { equals: text } }] }
      : { or: [{ slug: { equals: text.toLowerCase() } }, { name: { like: text } }] },
    limit: 10,
    depth: 0,
    overrideAccess: true,
    context: { triggerAfterRead: false },
    select: { slug: true, name: true },
  })
  const docs = result.docs as Array<{ id: number; slug: string; name: string }>
  const exact =
    docs.find((d) => d.id === asId) ??
    docs.find((d) => d.slug === text.toLowerCase()) ??
    (docs.filter((d) => d.name.toLowerCase() === text.toLowerCase()).length === 1
      ? docs.find((d) => d.name.toLowerCase() === text.toLowerCase())
      : undefined) ??
    (docs.length === 1 ? docs[0] : undefined)
  if (!exact) {
    throw new ToolError(
      docs.length > 1
        ? `"${text}" matches several chatas (${docs.map((d) => d.slug).join(', ')}); use the slug.`
        : `No chata "${text}". get_context lists the chatas of this account.`,
    )
  }
  return { id: exact.id, slug: exact.slug, name: exact.name }
}

export async function loadChata(caller: Caller, ref: string | number): Promise<ChataPayload> {
  const chataRef = await resolveChata(caller, ref)
  const data = expectOk(
    await fetchChataPayload<Omit<ChataPayload, 'ref'>>(caller, chataRef.slug),
    'Reading the chata',
  )
  return { ...data, ref: chataRef }
}

/** id → participant name, for every participant of the chata. */
export function participantNames(data: ChataPayload): Map<string, string> {
  return new Map(data.participants.map((p) => [String(p.id), p.name as string]))
}

export function jointAccountNames(data: ChataPayload): Map<string, string> {
  return new Map(data.jointAccounts.map((ja) => [String(ja.id), ja.name as string]))
}

/** Name of a polymorphic payer / prepayment sender ({ relationTo, value }). */
export function payerLabel(data: ChataPayload, ref: any): { type: string; id: number | null; name: string | null } {
  if (ref == null) return { type: 'unknown', id: null, name: null }
  const relationTo = ref.relationTo ?? 'participants'
  const value = ref.value ?? ref
  const id = value == null ? null : Number(refId(value))
  const name =
    typeof value === 'object' && value?.name
      ? value.name
      : relationTo === 'joint-accounts'
        ? (jointAccountNames(data).get(String(id)) ?? null)
        : (participantNames(data).get(String(id)) ?? null)
  return { type: relationTo === 'joint-accounts' ? 'joint_account' : 'participant', id, name }
}

/**
 * A participant of the chata by id or (unique, case-insensitive) name.
 * Throws a ToolError that lists the candidates.
 */
export function resolveParticipant(data: ChataPayload, ref: string | number): number {
  const text = String(ref).trim()
  if (/^\d+$/.test(text)) {
    const id = Number(text)
    if (data.participants.some((p) => p.id === id)) return id
    throw new ToolError(`Participant ${id} is not in ${data.ref.name}.`)
  }
  const lower = text.toLowerCase()
  const exact = data.participants.filter((p) => String(p.name).toLowerCase() === lower)
  const loose = exact.length > 0 ? exact : data.participants.filter((p) => String(p.name).toLowerCase().includes(lower))
  if (loose.length === 1) return loose[0].id
  const all = data.participants.map((p) => `${p.name} (${p.id})`).join(', ')
  throw new ToolError(
    loose.length > 1
      ? `"${text}" matches several participants: ${loose.map((p) => `${p.name} (${p.id})`).join(', ')}.`
      : `No participant "${text}" in ${data.ref.name}. Participants: ${all}.`,
  )
}

export function resolveJointAccount(data: ChataPayload, ref: string | number): number {
  const text = String(ref).trim()
  const match = data.jointAccounts.filter((ja) =>
    /^\d+$/.test(text) ? ja.id === Number(text) : String(ja.name).toLowerCase() === text.toLowerCase(),
  )
  if (match.length === 1) return match[0].id
  const all = data.jointAccounts.map((ja) => `${ja.name} (${ja.id})`).join(', ') || 'none'
  throw new ToolError(`No joint account "${text}" in ${data.ref.name}. Joint accounts: ${all}.`)
}

/** The caller's own participants in this chata ("me", a parent's children). */
export function ownParticipants(data: ChataPayload): Array<{ id: number; name: string }> {
  const own = new Set(data.viewer.linkedParticipantIds.map(String))
  return data.participants
    .filter((p) => own.has(String(p.id)))
    .map((p) => ({ id: p.id, name: p.name }))
}

/** The banker participant, when the chata has one. */
export function bankerOf(data: ChataPayload): any | null {
  const id = data.chata.banker == null ? null : refId(data.chata.banker)
  return id == null ? null : (data.participants.find((p) => String(p.id) === id) ?? null)
}

export const isoDate = (value: unknown): string | null =>
  typeof value === 'string' && value ? value.slice(0, 10) : null

/** Plain text of a Lexical rich-text value (custom tabs, rich descriptions). */
export function richTextToPlain(value: unknown): string {
  const out: string[] = []
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.text === 'string') out.push(node.text)
    if (Array.isArray(node.children)) {
      node.children.forEach(walk)
      if (['paragraph', 'heading', 'listitem', 'quote'].includes(node.type)) out.push('\n')
    }
    if (node.type === 'upload') out.push('[image]\n')
  }
  walk((value as any)?.root ?? value)
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}
