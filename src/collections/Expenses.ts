import type { CollectionConfig } from 'payload'
import type { Expense } from '../payload-types'
import { buildAutoInvitations, findPaidByPairs } from '../utils/paidByInvitations'
import { adminRoleOnly, chataScopedAccess } from '../lib/access'

export const Expenses: CollectionConfig = {
  slug: 'expenses',
  hooks: {
    beforeChange: [
      // Standing "paid by" invitations: on create, participants whose
      // shares are permanently covered (Participant.paidBy, e.g. kids) get
      // an auto invitation row. Deleting the row on a single expense is a
      // per-expense opt-out; the retroactive sync lives on the participant
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const chataId =
          typeof data.chata === 'object' && data.chata !== null ? data.chata.id : data.chata
        if (!chataId) return data
        const pairs = await findPaidByPairs(req.payload, chataId)
        const added = buildAutoInvitations(data, pairs)
        if (added.length > 0) {
          data.invitations = [...(data.invitations || []), ...added]
        }
        return data
      },
    ],
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'amount', 'payer', 'chata'],
    group: 'Expense Tracking',
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
          afterInput: ['@/collections/Expenses/components/WeightsSumIndicator#WeightsSumIndicator'],
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
            description:
              'Weight multiplier for this participant (e.g., 1, 0.5, 2). If all weights ' +
              'add up to the total amount (±1 Kč), they are displayed as Kč amounts.',
            components: {
              afterInput: ['@/collections/Expenses/components/WeightShareHint#WeightShareHint'],
            },
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
      name: 'invitations',
      type: 'array',
      admin: {
        description:
          'The host pays the guest\'s share of this expense. A host can invite ' +
          'multiple guests; each guest can be invited only once per expense.',
      },
      fields: [
        {
          name: 'host',
          type: 'relationship',
          relationTo: 'participants',
          required: true,
          admin: {
            description: 'Who covers the share (the inviter)',
          },
          filterOptions: ({ data }) => {
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
          name: 'guest',
          type: 'relationship',
          relationTo: 'participants',
          required: true,
          admin: {
            description: 'Whose share is covered (the invited one)',
          },
          filterOptions: ({ data }) => {
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
          name: 'auto',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Standing arrangement (e.g. a parent paying for a child) - managed ' +
              'automatically from the participant\'s "Paid By" field and hidden on ' +
              'the expense card. Leave unchecked for one-off invitations, which are shown.',
          },
        },
      ],
      validate: (value) => {
        const rows = (value || []) as Array<{ host?: unknown; guest?: unknown }>
        const refId = (ref: unknown): string | null => {
          if (ref === null || ref === undefined) return null
          if (typeof ref === 'object') return String((ref as { id: unknown }).id)
          return String(ref)
        }
        const seenGuests = new Set<string>()
        for (const row of rows) {
          const host = refId(row.host)
          const guest = refId(row.guest)
          if (host && guest && host === guest) {
            return 'A participant cannot invite themselves'
          }
          if (guest) {
            if (seenGuests.has(guest)) {
              return 'Each guest can be invited only once per expense'
            }
            seenGuests.add(guest)
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
      name: 'attachments',
      type: 'upload',
      relationTo: 'expense-attachments',
      hasMany: true,
      admin: {
        description:
          'Účtenky a další přílohy (fotky, PDF) - on mobile the file picker offers taking a photo directly',
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
