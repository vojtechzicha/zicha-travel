import type { CollectionConfig } from 'payload'

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
      relationTo: 'participants',
      required: true,
      admin: {
        description: 'Who paid for this expense',
      },
      filterOptions: ({ siblingData }) => {
        // Only show participants from the selected chata
        if (siblingData?.chata) {
          return {
            chata: {
              equals: siblingData.chata,
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
          filterOptions: ({ siblingData }) => {
            // Get chata from parent document
            // Note: siblingData here is the weights array item, we need to go up one level
            const chataId = siblingData?.__parentDoc?.chata
            if (chataId) {
              return {
                chata: {
                  equals: chataId,
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
        if (siblingData?.splitType === 'weighted') {
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
  ],
}
