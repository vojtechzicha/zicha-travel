import type { CollectionConfig } from 'payload'
import type { Expense } from '../payload-types'

export const Expenses: CollectionConfig = {
  slug: 'expenses',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'amount', 'payer', 'chata'],
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Users can create/update expenses for chatas they manage
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
        description: 'The trip/chata this expense belongs to',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'Description of the expense',
      },
    },
    {
      name: 'amount',
      type: 'number',
      required: true,
      admin: {
        description: 'Total amount (use negative values for refunds)',
      },
    },
    {
      name: 'payer',
      type: 'relationship',
      // Polymorphic: a person or a joint account ("společný účet") can pay.
      // Joint-account payments are attributed equally to the members in
      // calculateStats; weights below stay participants-only.
      relationTo: ['participants', 'joint-accounts'],
      required: true,
      admin: {
        description: 'Who paid for this expense (a participant or a joint account)',
      },
      filterOptions: ({ siblingData }) => {
        // Only show participants/joint accounts from the selected chata
        const data = siblingData as Partial<Expense> | undefined
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
      name: 'splitType',
      type: 'select',
      required: true,
      defaultValue: 'equal',
      options: [
        {
          label: 'Equal Split (ALL)',
          value: 'equal',
        },
        {
          label: 'Weighted Split',
          value: 'weighted',
        },
      ],
      admin: {
        description: 'How to split this expense among participants',
      },
    },
    {
      name: 'weights',
      type: 'array',
      admin: {
        description: 'Weighted distribution - only used when Split Type is "Weighted"',
        condition: (data, siblingData) => siblingData?.splitType === 'weighted',
        components: {
          beforeInput: ['@/collections/Expenses/components/PrefillWeightsButton#PrefillWeightsButton'],
        },
      },
      fields: [
        {
          name: 'participant',
          type: 'relationship',
          relationTo: 'participants',
          required: true,
          admin: {
            description: 'Participant sharing this expense',
          },
          filterOptions: ({ data }) => {
            // siblingData is the weights array row - the chata lives on the
            // full document, which Payload passes as `data`
            const doc = data as Partial<Expense> | undefined
            if (doc?.chata) {
              return {
                chata: {
                  equals: typeof doc.chata === 'object' ? doc.chata.id : doc.chata,
                },
              }
            }
            return true
          },
        },
        {
          name: 'weight',
          type: 'number',
          required: true,
          min: 0,
          admin: {
            description: 'Weight multiplier for this participant (e.g., 1, 0.5, 2)',
          },
        },
      ],
      validate: (value, { siblingData }) => {
        // Only validate if splitType is weighted
        const data = siblingData as Partial<Expense> | undefined
        if (data?.splitType === 'weighted') {
          if (!value || value.length === 0) {
            return 'At least one participant weight is required for weighted splits'
          }
        }
        return true
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
    {
      name: 'note',
      type: 'textarea',
      admin: {
        description: 'Optional notes about this expense',
      },
    },
    {
      name: 'isPlanned',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Planned expense (not yet paid) - uncheck when actually paid',
      },
    },
  ],
}
