import type { CollectionConfig } from 'payload'
import { refId } from '../lib/access'
import { isRohlikProductImage } from '../lib/rohlik/mcp'
import { verifiedRohlikProduct } from '../utils/rohlikConnection'
import { rohlikEndpoints } from './ShoppingItems/rohlikEndpoints'
import {
  applyListAuthorship,
  assertListOpen,
  closeListEndpoint,
  dropItemOptOuts,
  guardDeleteWhenClosed,
  listEditAccess,
  listItemChataId,
} from './listItemRules'

const NO_PRODUCT = {
  productId: null,
  name: null,
  price: null,
  amount: null,
  imageUrl: null,
  url: null,
  inStock: null,
  checkedAt: null,
}

const isHttpsUrl = (value: unknown): boolean =>
  typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value.trim())

// "Nákup" — the chata's shared shopping list (src/lib/shopping.ts). Signed-in
// participants add what the group should have; the banker orders it all on
// Rohlík (rohlikEndpoints). Public read like the rest of the chata data;
// `authoredBy` stays an id (maxDepth 0), never a populated user.
export const ShoppingItems: CollectionConfig = {
  slug: 'shopping-items',
  labels: {
    singular: { en: 'Shopping item', cs: 'Položka nákupu' },
    plural: { en: 'Shopping list', cs: 'Nákupní seznam' },
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'quantity', 'chata', 'participant', 'sentToCartAt'],
    description: {
      en: 'What participants want bought for the trip. The banker orders it on Rohlík.',
      cs: 'Co chtějí účastníci na výlet nakoupit. Pokladník to objedná na Rohlíku.',
    },
  },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: listEditAccess,
    delete: listEditAccess,
  },
  endpoints: [...rohlikEndpoints, closeListEndpoint('shoppingClosedAt')],
  hooks: {
    beforeDelete: [guardDeleteWhenClosed('shopping-items', 'shoppingClosedAt')],
    afterDelete: [dropItemOptOuts('shopping')],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        const user = req.user
        const chataId = listItemChataId(data, operation, originalDoc)
        await assertListOpen(req, chataId, 'shoppingClosedAt')

        // Rohlík fields come from the search endpoint; only https links go
        // into the page (they render as <a href>/<img src>)
        const rohlik = data.rohlik as Record<string, unknown> | undefined
        if (rohlik) {
          if (rohlik.url != null && rohlik.url !== '' && !isHttpsUrl(rohlik.url)) rohlik.url = null
          if (rohlik.imageUrl != null && rohlik.imageUrl !== '' && !isHttpsUrl(rohlik.imageUrl)) {
            rohlik.imageUrl = null
          }
        }

        // Local API scripts and the send endpoint run without a user
        if (!user) return data

        // The product an item points at decides what lands in the banker's
        // cart, so a REST body never sets it: a new product id is looked up
        // on Rohlík (banker's connection) and its own name, price and size
        // replace whatever came in; the same id keeps the stored values. An
        // id that can't be verified turns the item into free text, which
        // never goes into the cart.
        if (data.rohlik !== undefined) {
          const incoming = data.rohlik as Record<string, unknown> | null
          const productId =
            incoming?.productId != null && String(incoming.productId).trim() !== ''
              ? String(incoming.productId).trim()
              : null
          const stored = originalDoc?.rohlik as Record<string, unknown> | undefined
          if (!productId) {
            data.rohlik = { ...NO_PRODUCT }
          } else if (operation === 'update' && stored?.productId === productId) {
            data.rohlik = { ...NO_PRODUCT, ...stored }
          } else {
            const product = await verifiedRohlikProduct(req.payload, chataId, productId)
            data.rohlik = product
              ? {
                  ...product,
                  imageUrl: isRohlikProductImage(incoming?.imageUrl) ? incoming.imageUrl : null,
                }
              : { ...NO_PRODUCT }
          }
        }
        // a product item is named after the product, whatever the body says
        const product = (data.rohlik ?? originalDoc?.rohlik) as
          | { productId?: unknown; name?: unknown }
          | undefined
        if (product?.productId && typeof product.name === 'string' && product.name.trim() !== '') {
          data.title = product.name
        }

        await applyListAuthorship({
          data,
          operation,
          originalDoc,
          req,
          chataId,
          // only the send endpoint marks items as sent to the cart
          serverFields: ['sentToCartAt', 'sentQuantity'],
          notParticipantMessage: 'Do nákupu přidávají jen účastníci této chaty',
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
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 120,
      label: { en: 'What', cs: 'Co' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'quantity',
          type: 'number',
          required: true,
          min: 1,
          max: 999,
          defaultValue: 1,
          label: { en: 'Quantity', cs: 'Počet' },
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
    {
      name: 'rohlik',
      type: 'group',
      label: { en: 'Rohlík product', cs: 'Produkt na Rohlíku' },
      admin: {
        description: {
          en: 'Filled in when the item was picked from the Rohlík search. Empty for a free-text item.',
          cs: 'Vyplní se, když byla položka vybrána z vyhledávání na Rohlíku. U volného textu zůstává prázdné.',
        },
      },
      fields: [
        { name: 'productId', type: 'text', label: { en: 'Product ID', cs: 'ID produktu' } },
        { name: 'name', type: 'text', label: { en: 'Name', cs: 'Název' } },
        { name: 'price', type: 'number', label: { en: 'Price (CZK)', cs: 'Cena (Kč)' } },
        { name: 'amount', type: 'text', label: { en: 'Package', cs: 'Balení' } },
        { name: 'imageUrl', type: 'text', label: { en: 'Image URL', cs: 'URL obrázku' } },
        { name: 'url', type: 'text', label: { en: 'Product page', cs: 'Stránka produktu' } },
        // kept current by src/utils/rohlikPriceRefresh.ts (before each send
        // and daily); false = sold out or no longer listed
        { name: 'inStock', type: 'checkbox', label: { en: 'In stock', cs: 'Skladem' } },
        {
          name: 'checkedAt',
          type: 'date',
          label: { en: 'Price checked', cs: 'Cena ověřena' },
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
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
      name: 'sentToCartAt',
      type: 'date',
      label: { en: 'Sent to the Rohlík cart', cs: 'Posláno do košíku na Rohlíku' },
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'sentQuantity',
      type: 'number',
      label: { en: 'Quantity sent', cs: 'Odeslané množství' },
      admin: { position: 'sidebar', readOnly: true },
    },
  ],
}
