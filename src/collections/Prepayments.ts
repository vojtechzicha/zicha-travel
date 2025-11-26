import type { CollectionConfig } from 'payload'
import type { Prepayment } from '../payload-types'

export const Prepayments: CollectionConfig = {
  slug: 'prepayments',
  admin: {
    useAsTitle: 'note',
    defaultColumns: ['from', 'amount', 'type', 'chata'],
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Users can create/update prepayments for chatas they manage
    create: ({ req: { user } }) => {
      if (!user) return false
      return true
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return {
        chata: {
          in: user.assignedChatas || [],
        },
      }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return {
        chata: {
          in: user.assignedChatas || [],
        },
      }
    },
  },
  fields: [
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      admin: {
        description: 'The trip/chata this prepayment belongs to',
      },
    },
    {
      name: 'from',
      type: 'relationship',
      relationTo: 'participants',
      required: true,
      admin: {
        description: 'Who sent the payment (or who received it if negative)',
      },
      filterOptions: ({ siblingData }) => {
        // Only show participants from the selected chata
        const data = siblingData as Partial<Prepayment> | undefined
        if (data?.chata) {
          return {
            chata: {
              equals: data.chata,
            },
          }
        }
        return true
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      admin: {
        description: 'Amount (positive = to banker, negative = from banker/refund)',
      },
    },
    {
      name: 'note',
      type: 'text',
      admin: {
        description: 'Description (e.g., "Záloha", "Doplatek", "Distribuce")',
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        {
          label: 'Advance (Záloha)',
          value: 'advance',
        },
        {
          label: 'Supplement (Doplatek)',
          value: 'supplement',
        },
        {
          label: 'Refund',
          value: 'refund',
        },
        {
          label: 'Distribution',
          value: 'distribution',
        },
      ],
      admin: {
        description: 'Type of prepayment',
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
