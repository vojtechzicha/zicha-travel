import { APIError, type CollectionConfig, type Endpoint, type PayloadRequest } from 'payload'
import { canManageChata, refId } from '../lib/access'
import { TAP_CODE, beerProduct } from '../lib/beer'
import { pickValidationMessage } from '../i18n/adminTranslations'
import { buildKegOrderEmail, kegOrderFingerprint } from '../lib/kegOrderEmail'
import { sendAppEmail } from '../lib/email'
import { bankerAccountId } from '../utils/rohlikConnection'
import { manualItemsRecipients } from '../utils/shoppingEmail'
import {
  applyListAuthorship,
  assertListOpen,
  closeListEndpoint,
  dropItemOptOuts,
  guardDeleteWhenClosed,
  listEditAccess,
  listItemChataId,
} from './listItemRules'

const chataIdOf = (value: unknown): number | null => {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function readBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    return ((await req.json?.()) ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

// POST /api/keg-items/order-summary { chata }: the banker (or a chata
// admin) emails the order summary to the banker, who forwards it to the
// shop or reads it out on the phone. Marks every item with the quantity the
// summary carried, so the tab can show what was added since.
const orderSummary: Endpoint = {
  path: '/order-summary',
  method: 'post',
  handler: async (req) => {
    const chataId = chataIdOf((await readBody(req)).chata)
    if (chataId == null) return Response.json({ error: 'invalid-chata' }, { status: 400 })
    if (!req.user) return Response.json({ error: 'forbidden' }, { status: 403 })
    const bankerAccount = await bankerAccountId(req.payload, chataId)
    if (bankerAccount !== String(req.user.id) && !canManageChata(req.user, chataId)) {
      return Response.json({ error: 'forbidden' }, { status: 403 })
    }

    const chata = await req.payload.findByID({
      collection: 'chatas',
      id: chataId,
      depth: 0,
      overrideAccess: true,
      context: { triggerAfterRead: false },
    })
    // a hidden list (switched off, or the trip still in planning) emails nothing
    if (chata.beerListEnabled !== true || chata.planningEnabled === true) {
      return Response.json({ error: 'disabled' }, { status: 409 })
    }
    const [{ docs: items }, { docs: participants }] = await Promise.all([
      req.payload.find({
        collection: 'keg-items',
        where: { chata: { equals: chataId } },
        sort: 'createdAt',
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      }),
      req.payload.find({
        collection: 'participants',
        where: { chata: { equals: chataId } },
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      }),
    ])
    if (items.length === 0) return Response.json({ error: 'empty' }, { status: 409 })

    const email = buildKegOrderEmail(chata, items, participants)

    const banker =
      bankerAccount != null
        ? await req.payload
            .findByID({ collection: 'users', id: bankerAccount, depth: 0, overrideAccess: true })
            .catch(() => null)
        : null
    const recipients = await manualItemsRecipients(req.payload, chataId, banker)
    let emailed = false
    for (const to of recipients) {
      try {
        await sendAppEmail(req.payload, { to, ...email })
        emailed = true
      } catch (err) {
        req.payload.logger.error({ err }, 'Failed to send the beer order summary')
      }
    }
    if (!emailed) return Response.json({ error: 'email-failed' }, { status: 502 })

    const sentAt = new Date().toISOString()
    // the chata keeps what this summary carried, so a later delete shows too
    await req.payload.update({
      collection: 'chatas',
      id: chataId,
      data: { beerSummarySentAt: sentAt, beerSummarySignature: kegOrderFingerprint(email) },
      depth: 0,
      overrideAccess: true,
      context: { triggerAfterRead: false },
    })
    for (const item of items) {
      await req.payload.update({
        collection: 'keg-items',
        id: item.id,
        data: { summarySentAt: sentAt, summaryQuantity: item.quantity },
        depth: 0,
        overrideAccess: true,
      })
    }
    return Response.json({ emailed })
  },
}

// "Pivo" — the chata's shared keg order (src/lib/beer.ts). Signed-in
// participants pick kegs from Benecentrum's price list and the bar;
// the banker orders it all from the shop. Same people rules as "Nákup"
// (listItemRules.ts). Public read like the rest of the chata data;
// `authoredBy` stays an id (maxDepth 0), never a populated user.
export const KegItems: CollectionConfig = {
  slug: 'keg-items',
  labels: {
    singular: { en: 'Beer keg', cs: 'Sud piva' },
    plural: { en: 'Beer order', cs: 'Objednávka piva' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'liters', 'quantity', 'chata', 'participant'],
    description: {
      en: 'Kegs and the bar participants want for the trip. The banker orders them from Benecentrum.',
      cs: 'Sudy a výčep, které chtějí účastníci na výlet. Pokladník je objedná v Benecentru.',
    },
  },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: listEditAccess,
    delete: listEditAccess,
  },
  endpoints: [orderSummary, closeListEndpoint('beerClosedAt')],
  hooks: {
    beforeDelete: [guardDeleteWhenClosed('keg-items', 'beerClosedAt')],
    afterDelete: [dropItemOptOuts('beer')],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        const chataId = listItemChataId(data, operation, originalDoc)
        await assertListOpen(req, chataId, 'beerClosedAt')

        // The product decides what the shop is asked for, so a body only
        // names a code: name, size and price always come from the catalog,
        // whoever writes (scripts included)
        const code = data.code ?? originalDoc?.code
        const product = beerProduct(code)
        if (!product) throw new APIError('Tohle v ceníku není', 400)
        data.code = product.code
        data.name = product.name
        data.liters = product.liters
        data.price = product.price
        data.unit = product.unit
        data.kind = product.kind

        // the bar is one item counting taps (barPlan picks the bars), so
        // more taps go onto it rather than into a second one. assertListOpen
        // holds the list's lock, so two adds can't both get through
        if (operation === 'create' && product.code === TAP_CODE) {
          const existing = await req.payload.count({
            req,
            collection: 'keg-items',
            where: { and: [{ chata: { equals: chataId } }, { code: { equals: TAP_CODE } }] },
            overrideAccess: true,
          })
          if (existing.totalDocs > 0) {
            throw new APIError('Výčep už v objednávce je, kohouty se přidávají u něj', 409)
          }
        }

        await applyListAuthorship({
          data,
          operation,
          originalDoc,
          req,
          chataId,
          // only the order-summary endpoint stamps these
          serverFields: ['summarySentAt', 'summaryQuantity'],
          notParticipantMessage: 'Do objednávky piva přidávají jen účastníci této chaty',
        })
        return data
      },
    ],
  },
  fields: [
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'code',
      type: 'text',
      required: true,
      label: { en: 'Product code', cs: 'Kód produktu' },
      admin: {
        description: {
          en: 'Catalog code (src/lib/kegCatalog.ts), or VYCEP-KOHOUT for the bar (one per order; the quantity is the number of taps).',
          cs: 'Kód z katalogu (src/lib/kegCatalog.ts), nebo VYCEP-KOHOUT pro výčep (jeden na objednávku, počet je počet kohoutů).',
        },
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'quantity',
          type: 'number',
          required: true,
          min: 1,
          max: 99,
          defaultValue: 1,
          // whole kegs and taps: a fraction would price differently on the
          // receipt than in the merged order
          validate: (value: number | null | undefined, { req }: { req: PayloadRequest }) =>
            value == null || Number.isInteger(value)
              ? true
              : pickValidationMessage(
                  req,
                  'The quantity must be a whole number',
                  'Počet musí být celé číslo',
                ),
          label: { en: 'Quantity (kegs, or taps for the bar)', cs: 'Počet (sudů, u výčepu kohoutů)' },
          admin: { width: '30%' },
        },
        {
          name: 'note',
          type: 'text',
          maxLength: 200,
          label: { en: 'Note', cs: 'Poznámka' },
          admin: { width: '70%' },
        },
      ],
    },
    {
      name: 'participant',
      type: 'relationship',
      relationTo: 'participants',
      label: { en: 'Wanted by', cs: 'Kdo to chce' },
      filterOptions: ({ data }) => (data?.chata ? { chata: { equals: refId(data.chata) } } : false),
    },
    // copied from the catalog by the hook above, never from a request body
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          label: { en: 'Name', cs: 'Název' },
          admin: { readOnly: true, width: '40%' },
        },
        {
          name: 'liters',
          type: 'number',
          label: { en: 'Litres', cs: 'Litrů' },
          admin: { readOnly: true, width: '15%' },
        },
        {
          name: 'price',
          type: 'number',
          label: { en: 'Price (CZK)', cs: 'Cena (Kč)' },
          admin: { readOnly: true, width: '15%' },
        },
        {
          name: 'unit',
          type: 'select',
          options: [
            { label: { en: 'keg', cs: 'sud' }, value: 'keg' },
            { label: { en: 'bar and day', cs: 'výčep a den' }, value: 'day' },
          ],
          label: { en: 'Per', cs: 'Za' },
          admin: { readOnly: true, width: '15%' },
        },
        {
          name: 'kind',
          type: 'text',
          label: { en: 'Kind', cs: 'Druh' },
          admin: { readOnly: true, width: '15%' },
        },
      ],
    },
    {
      name: 'authoredBy',
      type: 'relationship',
      relationTo: 'users',
      maxDepth: 0,
      label: { en: 'Added by', cs: 'Přidal(a)' },
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'summarySentAt',
      type: 'date',
      label: { en: 'In the order summary since', cs: 'V souhrnu objednávky od' },
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'summaryQuantity',
      type: 'number',
      label: { en: 'Quantity in the summary', cs: 'Počet v souhrnu' },
      admin: { position: 'sidebar', readOnly: true },
    },
  ],
}
