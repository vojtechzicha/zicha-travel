import type { Payload } from 'payload'
import {
  calculateStats,
  transformExpense,
  transformPrepayment,
  transformParticipant,
  transformJointAccount,
  normalizePayerRef,
  populateExpenseParticipants,
  type ChataStats,
} from './calculateStats'

/** Minimal shape needed to compute stats — a full Chata doc satisfies it. */
export interface StatsChataInput {
  id: number
  banker?: unknown
}

/**
 * Computes `_stats` for MANY chatas with a fixed number of database queries.
 *
 * The per-document afterRead hook used to run four `find`s sequentially, so a
 * homepage listing N chatas paid 4×N serial round-trips to a database that
 * lives in another region. Here the four collections are fetched once, in
 * parallel, for every requested chata and then grouped in memory — 4 queries
 * total regardless of N.
 *
 * Both the hook (`Chatas/hooks/afterRead.ts`) and the homepage go through this
 * function so the maths stays in one place.
 */
export async function computeChataStats(
  payload: Payload,
  chatas: StatsChataInput[]
): Promise<Map<number, ChataStats>> {
  const result = new Map<number, ChataStats>()
  const ids = chatas.map((c) => c.id)
  if (ids.length === 0) return result

  const where = { chata: { in: ids } }
  // depth 0 everywhere: relationships stay as bare IDs, which we map manually.
  // Populating them would recurse back into chatas and re-trigger this hook.
  const query = { where, depth: 0, limit: 0, pagination: false } as const

  const [participantsResult, expensesResult, prepaymentsResult, jointAccountsResult] =
    await Promise.all([
      payload.find({ collection: 'participants', ...query }),
      payload.find({ collection: 'expenses', ...query }),
      payload.find({ collection: 'prepayments', ...query }),
      payload.find({ collection: 'joint-accounts', ...query }),
    ])

  const groupByChata = <T extends { chata?: unknown }>(docs: T[]): Map<number, T[]> => {
    const map = new Map<number, T[]>()
    for (const doc of docs) {
      const raw = doc.chata
      const chataId = typeof raw === 'object' && raw !== null ? (raw as { id: number }).id : raw
      if (typeof chataId !== 'number') continue
      const bucket = map.get(chataId)
      if (bucket) bucket.push(doc)
      else map.set(chataId, [doc])
    }
    return map
  }

  const participantsBy = groupByChata(participantsResult.docs as any[])
  const expensesBy = groupByChata(expensesResult.docs as any[])
  const prepaymentsBy = groupByChata(prepaymentsResult.docs as any[])
  const jointAccountsBy = groupByChata(jointAccountsResult.docs as any[])

  for (const chata of chatas) {
    const chataParticipants = participantsBy.get(chata.id) ?? []

    const participantMap = new Map<string, string>()
    chataParticipants.forEach((p: any) => participantMap.set(String(p.id), p.name))

    const jointAccounts = (jointAccountsBy.get(chata.id) ?? []).map((ja: any) =>
      transformJointAccount(ja, participantMap)
    )
    const jointAccountMap = new Map(jointAccounts.map((ja) => [String(ja.id), ja]))

    let bankerName = ''
    if (typeof chata.banker === 'object' && chata.banker !== null) {
      bankerName = (chata.banker as { name?: string }).name || ''
    } else if (chata.banker !== null && chata.banker !== undefined) {
      bankerName = participantMap.get(String(chata.banker)) || ''
    }

    const participants = chataParticipants.map(transformParticipant)

    // payer/from are polymorphic (participant or joint account) — normalize both
    const expenses = (expensesBy.get(chata.id) ?? []).map((expense: any) => {
      const transformed = transformExpense(expense)
      transformed.payer = normalizePayerRef(transformed.payer, participantMap, jointAccountMap)
      return populateExpenseParticipants(transformed, participantMap)
    })

    const prepayments = (prepaymentsBy.get(chata.id) ?? []).map((prepayment: any) => {
      const transformed = transformPrepayment(prepayment)
      transformed.from = normalizePayerRef(transformed.from, participantMap, jointAccountMap)
      return transformed
    })

    result.set(
      chata.id,
      calculateStats(participants, expenses, prepayments, bankerName, jointAccounts)
    )
  }

  return result
}
