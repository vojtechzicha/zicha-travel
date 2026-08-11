import type { CollectionConfig } from 'payload'
import type { Prepayment } from '../payload-types'
import { adminRoleOnly, chataScopedAccess } from '../lib/access'

export const Prepayments: CollectionConfig = {
  slug: 'prepayments',
  labels: {
    singular: { en: 'Prepayment', cs: 'Záloha' },
    plural: { en: 'Prepayments', cs: 'Zálohy' },
  },
  admin: {
    useAsTitle: 'note',
    defaultColumns: ['from', 'amount', 'type', 'chata'],
    group: { en: 'Expense Tracking', cs: 'Evidence výdajů' },
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Admin roles only; admins are limited to their assigned chatas
    create: adminRoleOnly,
    update: chataScopedAccess,
    delete: chataScopedAccess,
  },
  fields: [
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      admin: {
        description: {
          en: 'The trip/chata this prepayment belongs to',
          cs: 'Chata/výlet, kam tato záloha patří',
        },
      },
    },
    {
      name: 'from',
      type: 'relationship',
      // Polymorphic: prepayments can be sent from a joint account too; the
      // amount is attributed equally to the members in calculateStats.
      relationTo: ['participants', 'joint-accounts'],
      required: true,
      admin: {
        description: {
          en: 'Who sent the payment (or who received it if negative) — a participant or a joint account',
          cs: 'Kdo platbu poslal (nebo přijal, pokud je záporná) – účastník nebo společný účet',
        },
        condition: (data) => Boolean(data?.chata),
      },
      filterOptions: ({ siblingData }) => {
        // Only show participants/joint accounts from the selected chata
        const data = siblingData as Partial<Prepayment> | undefined
        if (data?.chata) {
          return {
            chata: {
              equals: data.chata,
            },
          }
        }
        return false
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      admin: {
        description: {
          en: 'Amount (positive = to banker, negative = from banker/refund)',
          cs: 'Částka (kladná = pokladníkovi, záporná = od pokladníka / vratka)',
        },
      },
    },
    {
      name: 'note',
      type: 'text',
      admin: {
        description: {
          en: 'Description (e.g., "Záloha", "Doplatek", "Distribuce")',
          cs: 'Popis (např. „Záloha“, „Doplatek“, „Distribuce“)',
        },
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        {
          label: { en: 'Advance', cs: 'Záloha' },
          value: 'advance',
        },
        {
          label: { en: 'Supplement', cs: 'Doplatek' },
          value: 'supplement',
        },
        {
          label: { en: 'Refund', cs: 'Vratka' },
          value: 'refund',
        },
        {
          label: { en: 'Distribution', cs: 'Distribuce' },
          value: 'distribution',
        },
      ],
      admin: {
        description: {
          en: 'Type of prepayment',
          cs: 'Typ zálohy',
        },
      },
      hooks: {
        beforeValidate: [
          ({ value, siblingData }) => {
            // Auto-detect type from amount and note if not explicitly set
            if (!value && siblingData) {
              const { amount, note } = siblingData

              // Negative amount = refund
              if (amount < 0) {
                return 'refund'
              }

              // Check note for keywords
              if (note) {
                const lowerNote = note.toLowerCase()
                if (lowerNote.includes('distribuce')) {
                  return 'distribution'
                }
                if (lowerNote.includes('doplatek')) {
                  return 'supplement'
                }
              }

              // Default positive to advance
              return 'advance'
            }
            return value
          },
        ],
      },
    },
    {
      name: 'createdAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
      hooks: {
        beforeValidate: [
          ({ value, operation }) => {
            if (operation === 'create' && !value) {
              return new Date()
            }
            return value
          },
        ],
      },
    },
  ],
}
