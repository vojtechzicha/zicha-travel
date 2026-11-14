import { z } from 'zod'
import { KEG_CATALOG, KEG_CATALOG_PRINTED } from '@/lib/kegCatalog'
import { BEER_SHOP, TAP_CODE, barPlan, beerTotals, pricePerLiter } from '@/lib/beer'
import { callApi, type Caller } from '../loopback'
import { ToolError, audit, defineTool, expectOk } from '../tool-kit'
import { loadChata, participantNames, resolveParticipant, type ChataPayload } from '../chata'

// "Nákup" (shared shopping list + Rohlík) and "Pivo" (keg order from
// Benecentrum) through the same endpoints as the two tabs. Who may add for
// whom, the author/banker/admin edit rules, closed lists and the catalog-only
// keg fields are all enforced by the collections' hooks.

const ref = z.union([z.string(), z.number()])
const idRef = z.union([z.number(), z.string().regex(/^\d+$/)]).transform(Number)
const listName = z.enum(['shopping', 'beer']).describe('shopping = Nákup, beer = Pivo.')

const optOutNames = (data: ChataPayload, view: any, itemId: number) => {
  const names = participantNames(data)
  const ids: number[] = view?.items?.[String(itemId)] ?? []
  return ids.map((id) => names.get(String(id)) ?? String(id))
}

function shoppingView(data: ChataPayload) {
  const s = data.shopping
  if (!s) return null
  const names = participantNames(data)
  return {
    closed_at: s.closedAt,
    can_add: s.canAdd,
    your_participants: s.ownParticipants,
    shopper: {
      name: s.shopper.name,
      rohlik_connected: s.shopper.connected,
      you_are_shopper: s.shopper.isMe,
      you_can_manage: s.shopper.canManage,
    },
    sitting_out_whole_list: (s.optOuts?.list ?? []).map((id: number) => names.get(String(id)) ?? id),
    items: s.items.map((item: any) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      note: item.note,
      for: item.participantName,
      mine: item.mine,
      can_edit: item.canEdit,
      rohlik: item.rohlik
        ? {
            product_id: item.rohlik.productId,
            name: item.rohlik.name,
            price: item.rohlik.price,
            package: item.rohlik.amount,
            in_stock: item.rohlik.inStock,
            url: item.rohlik.url,
          }
        : null,
      sent_to_cart_at: item.sentToCartAt,
      not_splitting: optOutNames(data, s.optOuts, item.id),
    })),
  }
}

function beerView(data: ChataPayload) {
  const b = data.beer
  if (!b) return null
  const names = participantNames(data)
  const rental = { days: b.tapDays, weekend: b.tapWeekend }
  const taps = b.items
    .filter((i: any) => i.code === TAP_CODE)
    .reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)
  return {
    shop: BEER_SHOP,
    closed_at: b.closedAt,
    can_add: b.canAdd,
    your_participants: b.ownParticipants,
    orderer: { name: b.orderer.name, you_are_orderer: b.orderer.isMe, you_can_manage: b.orderer.canManage },
    summary_sent_at: b.summarySentAt,
    changed_since_summary: b.summaryChanged,
    bar: {
      taps,
      rental_days: b.tapDays,
      weekend_price: b.tapWeekend,
      plan: taps > 0 ? barPlan(taps, rental) : null,
    },
    totals: beerTotals(b.items, rental),
    sitting_out_whole_list: (b.optOuts?.list ?? []).map((id: number) => names.get(String(id)) ?? id),
    items: b.items.map((item: any) => ({
      id: item.id,
      code: item.code,
      name: item.name,
      liters: item.liters,
      price: item.price,
      unit: item.unit,
      kind: item.kind,
      quantity: item.quantity,
      note: item.note,
      for: item.participantName,
      mine: item.mine,
      can_edit: item.canEdit,
      can_change_taps: item.canChangeTaps,
      in_last_summary: item.summaryQuantity,
      not_splitting: optOutNames(data, b.optOuts, item.id),
    })),
  }
}

async function shoppingItemChata(caller: Caller, collection: 'shopping-items' | 'keg-items', id: number) {
  const doc = expectOk(
    await callApi<any>(caller, 'GET', `${collection}/${id}`, { query: { depth: 0 } }),
    `Reading item ${id}`,
  )
  return doc
}

const forParticipant = (data: ChataPayload, value: string | number | null | undefined) =>
  value == null ? undefined : resolveParticipant(data, value)

export const listTools = [
  defineTool({
    name: 'get_shopping_list',
    title: 'Shopping list (Nákup)',
    description:
      'The shared shopping list of a chata: items (free text or a Rohlík product with price), ' +
      'who each is for, who does not want to split which item, whether the list is closed ' +
      '(ordered), and whether the banker has Rohlík connected. Every item is split equally ' +
      'among everybody except those who opted out; closing the list writes one planned ' +
      'expense for the banker.',
    access: 'read',
    input: { chata: ref.describe('The chata: id, slug or name.') },
    handler: async ({ chata }, caller) => {
      const data = await loadChata(caller, chata)
      const view = shoppingView(data)
      if (!view) throw new ToolError(`${data.ref.name} has no shopping list (off, or still planning).`)
      return { chata: { id: data.ref.id, slug: data.ref.slug, name: data.ref.name }, ...view }
    },
  }),

  defineTool({
    name: 'search_rohlik_products',
    title: 'Search Rohlík',
    description:
      'Searches Rohlík.cz products through the banker\'s connected Rohlík account, as the ' +
      'search box in Nákup does. Pass a product_id from here to add_shopping_item; the server ' +
      'checks it with Rohlík and stores Rohlík\'s own name and price.',
    access: 'read',
    openWorld: true,
    input: {
      chata: ref.describe('The chata: id, slug or name.'),
      query: z.string().trim().min(2).max(100),
    },
    handler: async ({ chata, query }, caller) => {
      const data = await loadChata(caller, chata)
      const result = expectOk(
        await callApi<any>(caller, 'GET', 'shopping-items/rohlik/search', {
          query: { chata: data.ref.id, q: query },
        }),
        'Searching Rohlík',
      )
      return { products: result?.products ?? [] }
    },
  }),

  defineTool({
    name: 'add_shopping_item',
    title: 'Add to the shopping list',
    description:
      'Adds an item to Nákup, for one of your participants (or anyone, as banker or chata ' +
      'admin). With rohlik_product_id (from search_rohlik_products) it becomes that product.',
    access: 'write',
    input: {
      chata: ref,
      title: z.string().trim().min(1).max(200),
      quantity: z.number().int().min(1).max(99).optional(),
      note: z.string().max(500).optional(),
      for: ref.optional().describe('Participant it is for (id or name); default nobody in particular.'),
      rohlik_product_id: z.string().max(40).optional(),
    },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      const body = {
        chata: data.ref.id,
        title: args.title,
        quantity: args.quantity ?? 1,
        ...(args.note ? { note: args.note } : {}),
        ...(args.for != null ? { participant: forParticipant(data, args.for) } : {}),
        ...(args.rohlik_product_id ? { rohlik: { productId: args.rohlik_product_id } } : {}),
      }
      const created = expectOk(await callApi<any>(caller, 'POST', 'shopping-items', { body }), 'Adding the item')
      await audit(caller, {
        tool: 'add_shopping_item',
        action: 'create',
        chata: data.ref.id,
        collection: 'shopping-items',
        documentId: created?.doc?.id,
        request: body,
        after: created?.doc,
      })
      return { created: created?.doc }
    },
  }),

  defineTool({
    name: 'update_shopping_item',
    title: 'Change a shopping item',
    description: 'Changes the title, quantity, note or recipient of a Nákup item you may edit.',
    access: 'write',
    input: {
      item_id: idRef,
      title: z.string().trim().min(1).max(200).optional(),
      quantity: z.number().int().min(1).max(99).optional(),
      note: z.string().max(500).nullable().optional(),
      for: ref.nullable().optional(),
    },
    handler: async (args, caller) => {
      const before = await shoppingItemChata(caller, 'shopping-items', args.item_id)
      const data = await loadChata(caller, before.chata)
      const patch: Record<string, unknown> = {}
      if (args.title !== undefined) patch.title = args.title
      if (args.quantity !== undefined) patch.quantity = args.quantity
      if (args.note !== undefined) patch.note = args.note
      if (args.for !== undefined) patch.participant = args.for === null ? null : forParticipant(data, args.for)
      if (Object.keys(patch).length === 0) throw new ToolError('Nothing to change.')
      const result = expectOk(
        await callApi<any>(caller, 'PATCH', `shopping-items/${args.item_id}`, { body: patch }),
        'Updating the item',
      )
      await audit(caller, {
        tool: 'update_shopping_item',
        action: 'update',
        chata: data.ref.id,
        collection: 'shopping-items',
        documentId: args.item_id,
        request: patch,
        before,
        after: result?.doc,
      })
      return { updated: result?.doc }
    },
  }),

  defineTool({
    name: 'delete_shopping_item',
    title: 'Remove a shopping item',
    description: 'Removes a Nákup item you may edit.',
    access: 'delete',
    input: { item_id: idRef },
    handler: async ({ item_id }, caller) => {
      const before = await shoppingItemChata(caller, 'shopping-items', item_id)
      expectOk(await callApi(caller, 'DELETE', `shopping-items/${item_id}`), 'Removing the item')
      await audit(caller, {
        tool: 'delete_shopping_item',
        action: 'delete',
        chata: Number(before.chata),
        collection: 'shopping-items',
        documentId: item_id,
        before,
      })
      return { deleted: before }
    },
  }),

  defineTool({
    name: 'send_shopping_to_rohlik',
    title: 'Fill the banker\'s Rohlík cart',
    description:
      'Banker only, and only with Rohlík connected: puts every pending Rohlík item into the ' +
      'banker\'s own Rohlík cart (prices re-checked first; sold-out items are skipped) and ' +
      'emails the banker a checklist of what must be added by hand. Nothing is ordered or ' +
      'paid: the banker finishes the order on rohlik.cz.',
    access: 'write',
    openWorld: true,
    input: { chata: ref },
    handler: async ({ chata }, caller) => {
      const data = await loadChata(caller, chata)
      const result = expectOk(
        await callApi<any>(caller, 'POST', 'shopping-items/rohlik/send', { body: { chata: data.ref.id } }),
        'Sending to Rohlík',
      )
      await audit(caller, {
        tool: 'send_shopping_to_rohlik',
        action: 'send',
        chata: data.ref.id,
        collection: 'shopping-items',
        after: result,
      })
      return result
    },
  }),

  defineTool({
    name: 'get_beer_order',
    title: 'Beer order (Pivo)',
    description:
      'The shared keg order of a chata (shop: Benecentrum Benešov): ordered kegs and bar taps, ' +
      'who each is for, totals in Kč and litres, the bar plan and its rough rental price, who ' +
      'opts out, whether the order summary was emailed and changed since. With ' +
      'include_catalog the full price list (codes for add_beer_item).',
    access: 'read',
    input: {
      chata: ref,
      include_catalog: z.boolean().optional(),
    },
    handler: async ({ chata, include_catalog }, caller) => {
      const data = await loadChata(caller, chata)
      const view = beerView(data)
      if (!view) throw new ToolError(`${data.ref.name} has no beer order (off, or still planning).`)
      return {
        chata: { id: data.ref.id, slug: data.ref.slug, name: data.ref.name },
        ...view,
        catalog: include_catalog
          ? {
              printed: KEG_CATALOG_PRINTED,
              bar_code: TAP_CODE,
              bar_note: 'One bar item per order; its quantity is the number of taps (change_bar_taps).',
              kegs: KEG_CATALOG.map((k) => ({
                code: k.code,
                name: k.name,
                liters: k.liters,
                price: k.price,
                price_per_liter: pricePerLiter(k),
                kind: k.kind,
                in_stock: k.inStock,
              })),
            }
          : undefined,
      }
    },
  }),

  defineTool({
    name: 'add_beer_item',
    title: 'Add a keg or the bar',
    description:
      'Adds a keg (code from get_beer_order include_catalog) or the bar (code VYCEP-KOHOUT, ' +
      'quantity = taps; only one bar item per order, more taps go onto it with change_bar_taps). ' +
      'Name, size and price always come from the catalog.',
    access: 'write',
    input: {
      chata: ref,
      code: z.string().min(1).max(60),
      quantity: z.number().int().min(1).max(99).optional(),
      note: z.string().max(500).optional(),
      for: ref.optional().describe('Participant it is for (id or name).'),
    },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      const body = {
        chata: data.ref.id,
        code: args.code,
        quantity: args.quantity ?? 1,
        ...(args.note ? { note: args.note } : {}),
        ...(args.for != null ? { participant: forParticipant(data, args.for) } : {}),
      }
      const created = expectOk(await callApi<any>(caller, 'POST', 'keg-items', { body }), 'Adding the keg')
      await audit(caller, {
        tool: 'add_beer_item',
        action: 'create',
        chata: data.ref.id,
        collection: 'keg-items',
        documentId: created?.doc?.id,
        request: body,
        after: created?.doc,
      })
      return { created: created?.doc }
    },
  }),

  defineTool({
    name: 'update_beer_item',
    title: 'Change a keg',
    description: 'Changes the quantity, note or recipient of a Pivo item you may edit.',
    access: 'write',
    input: {
      item_id: idRef,
      quantity: z.number().int().min(1).max(99).optional(),
      note: z.string().max(500).nullable().optional(),
      for: ref.nullable().optional(),
    },
    handler: async (args, caller) => {
      const before = await shoppingItemChata(caller, 'keg-items', args.item_id)
      const data = await loadChata(caller, before.chata)
      const patch: Record<string, unknown> = {}
      if (args.quantity !== undefined) patch.quantity = args.quantity
      if (args.note !== undefined) patch.note = args.note
      if (args.for !== undefined) patch.participant = args.for === null ? null : forParticipant(data, args.for)
      if (Object.keys(patch).length === 0) throw new ToolError('Nothing to change.')
      const result = expectOk(
        await callApi<any>(caller, 'PATCH', `keg-items/${args.item_id}`, { body: patch }),
        'Updating the keg',
      )
      await audit(caller, {
        tool: 'update_beer_item',
        action: 'update',
        chata: data.ref.id,
        collection: 'keg-items',
        documentId: args.item_id,
        request: patch,
        before,
        after: result?.doc,
      })
      return { updated: result?.doc }
    },
  }),

  defineTool({
    name: 'delete_beer_item',
    title: 'Remove a keg',
    description: 'Removes a Pivo item you may edit (the bar only by its author, the banker or an admin).',
    access: 'delete',
    input: { item_id: idRef },
    handler: async ({ item_id }, caller) => {
      const before = await shoppingItemChata(caller, 'keg-items', item_id)
      expectOk(await callApi(caller, 'DELETE', `keg-items/${item_id}`), 'Removing the keg')
      await audit(caller, {
        tool: 'delete_beer_item',
        action: 'delete',
        chata: Number(before.chata),
        collection: 'keg-items',
        documentId: item_id,
        before,
      })
      return { deleted: before }
    },
  }),

  defineTool({
    name: 'change_bar_taps',
    title: 'Add or remove a bar tap',
    description:
      'Any participant of the chata may add (+1) or remove (-1) one tap on the order\'s bar ' +
      'item, as the +/- buttons do. Repeat for more.',
    access: 'write',
    input: { item_id: idRef, delta: z.union([z.literal(1), z.literal(-1)]) },
    handler: async ({ item_id, delta }, caller) => {
      const result = expectOk(
        await callApi<any>(caller, 'POST', 'keg-items/taps', { body: { item: item_id, delta } }),
        'Changing the taps',
      )
      await audit(caller, {
        tool: 'change_bar_taps',
        action: delta > 0 ? 'tap+1' : 'tap-1',
        collection: 'keg-items',
        documentId: item_id,
        after: result,
      })
      return result
    },
  }),

  defineTool({
    name: 'email_beer_order_summary',
    title: 'Email the keg order summary',
    description:
      'Banker or chata admin: emails the order summary to the banker (or the admins) to ' +
      'forward to the shop or read out on the phone. Nothing is sent to the shop itself.',
    access: 'write',
    input: { chata: ref },
    handler: async ({ chata }, caller) => {
      const data = await loadChata(caller, chata)
      const result = expectOk(
        await callApi<any>(caller, 'POST', 'keg-items/order-summary', { body: { chata: data.ref.id } }),
        'Emailing the summary',
      )
      await audit(caller, { tool: 'email_beer_order_summary', action: 'email', chata: data.ref.id, after: result })
      return result
    },
  }),

  defineTool({
    name: 'close_list',
    title: 'Close or reopen a list',
    description:
      'Banker or chata admin: closes Nákup or Pivo after ordering ("Objednáno"), or reopens it. ' +
      'A closed list stays readable but nobody can change it, and closing writes (or updates) ' +
      'one planned expense paid by the banker, split by who wanted what.',
    access: 'write',
    input: { chata: ref, list: listName, closed: z.boolean() },
    handler: async ({ chata, list, closed }, caller) => {
      const data = await loadChata(caller, chata)
      const result = expectOk(
        await callApi<any>(caller, 'POST', `${list === 'shopping' ? 'shopping-items' : 'keg-items'}/close`, {
          body: { chata: data.ref.id, closed },
        }),
        closed ? 'Closing the list' : 'Reopening the list',
      )
      await audit(caller, {
        tool: 'close_list',
        action: closed ? 'close' : 'reopen',
        chata: data.ref.id,
        collection: list,
        after: result,
      })
      return result
    },
  }),

  defineTool({
    name: 'set_list_opt_out',
    title: 'Opt out of an item or a list',
    description:
      '"Nechci": a participant does not split one item (item_id) or a whole list (no item_id, ' +
      'items added later included). `out: false` takes it back. For your own participants, or ' +
      'anyone as banker or chata admin; never on a closed list.',
    access: 'write',
    input: {
      chata: ref,
      list: listName,
      participant: ref,
      item_id: idRef.optional(),
      out: z.boolean(),
    },
    handler: async (args, caller) => {
      const data = await loadChata(caller, args.chata)
      const body = {
        chata: data.ref.id,
        list: args.list,
        item: args.item_id ?? null,
        participant: resolveParticipant(data, args.participant),
        out: args.out,
      }
      const result = expectOk(await callApi<any>(caller, 'POST', 'list-opt-outs/set', { body }), 'Setting the opt-out')
      await audit(caller, {
        tool: 'set_list_opt_out',
        action: args.out ? 'opt-out' : 'opt-in',
        chata: data.ref.id,
        collection: 'list-opt-outs',
        request: body,
      })
      return result ?? { ok: true }
    },
  }),
]
