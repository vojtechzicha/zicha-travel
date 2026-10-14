import type { Payload } from 'payload'
import { refId } from '@/lib/access'
import { lineCost, tapRentalDays } from '@/lib/beer'
import {
  listShares,
  roundedShares,
  scaledShares,
  type ListKind,
  type ListOptOuts,
  type SplitItem,
} from '@/lib/listSplit'

// Closing "Nákup" or "Pivo" turns the list into ONE expense paid by the
// banker (src/lib/listSplit.ts has the split rules). The expense carries
// `sourceList`, so closing again after a reopen updates the same row: while
// it is still planned the estimate and the shares are recalculated; once the
// banker entered the real bill (no longer planned) the amount stays and only
// the shares are recalculated in proportion.

const TITLES: Record<ListKind, string> = {
  shopping: 'Společný nákup',
  beer: 'Sudové pivo',
}

/** Who opted out of what, for one list of a chata. */
export async function loadListOptOuts(
  payload: Payload,
  chataId: number | string,
  list: ListKind,
): Promise<ListOptOuts> {
  const { docs } = await payload.find({
    collection: 'list-opt-outs',
    where: { and: [{ chata: { equals: chataId } }, { list: { equals: list } }] },
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })
  const result: ListOptOuts = { list: [], items: {} }
  for (const row of docs) {
    const participant = Number(refId(row.participant))
    if (row.itemId == null) result.list.push(participant)
    else (result.items[String(row.itemId)] ??= []).push(participant)
  }
  return result
}

/** The list's priced lines: what each item costs for the split. */
export async function listSplitItems(
  payload: Payload,
  chataId: number | string,
  list: ListKind,
  tapDays: number,
): Promise<SplitItem[]> {
  if (list === 'shopping') {
    const { docs } = await payload.find({
      collection: 'shopping-items',
      where: { chata: { equals: chataId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    return docs.map((item) => ({
      id: item.id,
      cost:
        typeof item.rohlik?.price === 'number'
          ? item.rohlik.price * Math.max(1, item.quantity || 1)
          : null,
    }))
  }
  const { docs } = await payload.find({
    collection: 'keg-items',
    where: { chata: { equals: chataId } },
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })
  return docs.map((item) => ({
    id: item.id,
    cost: lineCost(
      {
        quantity: item.quantity,
        price: item.price ?? 0,
        unit: item.unit === 'day' ? 'day' : 'keg',
      },
      tapDays,
    ),
  }))
}

export type ListExpenseResult =
  | { status: 'created' | 'updated'; expenseId: number; amount: number }
  | { status: 'removed'; expenseId: number }
  | { status: 'skipped'; reason: 'no-banker' | 'empty' }

export async function syncListExpense(
  payload: Payload,
  chataId: number,
  list: ListKind,
): Promise<ListExpenseResult> {
  const chata = await payload.findByID({
    collection: 'chatas',
    id: chataId,
    depth: 0,
    overrideAccess: true,
    context: { triggerAfterRead: false },
  })
  if (!chata.banker) return { status: 'skipped', reason: 'no-banker' }
  const bankerId = Number(refId(chata.banker))

  const [{ docs: participants }, optOuts, items] = await Promise.all([
    payload.find({
      collection: 'participants',
      where: { chata: { equals: chataId } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    loadListOptOuts(payload, chataId, list),
    listSplitItems(payload, chataId, list, tapRentalDays(chata)),
  ])
  const split = listShares(
    participants.map((p) => p.id),
    items,
    optOuts,
  )

  const { docs: existing } = await payload.find({
    collection: 'expenses',
    where: { and: [{ chata: { equals: chataId } }, { sourceList: { equals: list } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const current = existing[0]
  const keepAmount = current != null && current.isPlanned !== true
  // nothing priced left: a planned row would linger with an old estimate, so
  // it goes; a paid one is a real bill and stays as it is
  if (Math.round(split.total) <= 0) {
    if (current && !keepAmount) {
      await payload.delete({ collection: 'expenses', id: current.id, overrideAccess: true })
      return { status: 'removed', expenseId: current.id }
    }
    return { status: 'skipped', reason: 'empty' }
  }
  const amount = keepAmount ? current.amount : Math.round(split.total)
  const weights = [
    ...(keepAmount ? scaledShares(split.shares, amount) : roundedShares(split.shares)),
  ].map(([participant, weight]) => ({ participant: Number(participant), weight }))

  const banker = participants.find((p) => p.id === bankerId)
  const bankerAccount = banker?.account != null ? refId(banker.account) : null
  const note =
    (list === 'shopping'
      ? 'Ze společného nákupu, odhad podle cen na Rohlíku. '
      : 'Ze sudového piva, odhad podle ceníku Max pivotéky (kohouty orientačně). ') +
    'Každá položka se dělí mezi ty, kdo se z ní neodhlásili. ' +
    (split.unpriced > 0 ? `Položky bez ceny (${split.unpriced}) v odhadu nejsou. ` : '') +
    'Až bude známá skutečná částka, oprav ji; podíly se přepočítají poměrně.'

  if (current) {
    await payload.update({
      collection: 'expenses',
      id: current.id,
      // a planned row follows the current banker; a paid one keeps who paid
      data: {
        amount,
        splitType: 'weighted',
        weights,
        ...(keepAmount ? {} : { note, payer: { relationTo: 'participants', value: bankerId } }),
      },
      depth: 0,
      overrideAccess: true,
    })
    return { status: 'updated', expenseId: current.id, amount }
  }
  const created = await payload.create({
    collection: 'expenses',
    data: {
      chata: chataId,
      title: TITLES[list],
      amount,
      payer: { relationTo: 'participants', value: bankerId },
      splitType: 'weighted',
      weights,
      isPlanned: true,
      approvalStatus: 'approved',
      sourceList: list,
      note,
      ...(bankerAccount ? { authoredBy: Number(bankerAccount) } : {}),
    },
    depth: 0,
    overrideAccess: true,
  })
  return { status: 'created', expenseId: created.id, amount }
}
