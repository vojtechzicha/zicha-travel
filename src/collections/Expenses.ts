import { APIError, type Access, type CollectionConfig, type Where } from 'payload'
import type { Expense } from '../payload-types'
import { buildAutoInvitations, findPaidByPairs } from '../utils/paidByInvitations'
import { isAdminRole, isSuperadmin, refId } from '../lib/access'
import {
  isAllowedPayer,
  linkedParticipantIds,
  normalizePayer,
  samePayer,
} from '../lib/expenseAuthoring'

// Write access: superadmin everything, admin their assigned chatas, and a
// frontend account (role "user") only the expenses it authored itself
// (Expense.authoredBy — see docs in lib/expenseAuthoring).
const expenseWriteAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperadmin(user)) return true
  if (user.role === 'admin') {
    const where: Where = {
      chata: {
        in: user.assignedChatas || [],
      },
    }
    return where
  }
  const where: Where = {
    authoredBy: {
      equals: user.id,
    },
  }
  return where
}

export const Expenses: CollectionConfig = {
  slug: 'expenses',
  hooks: {
    beforeChange: [
      // Frontend authoring guard + authorship stamp. Admin-panel roles only
      // get the stamp; frontend accounts (role "user") are additionally
      // restricted: the expense must live in a chata where they own a
      // participant, the payer must be one of their own participants (or a
      // joint account with one of them as member), and the chata of an
      // existing expense can never be moved.
      async ({ data, operation, req, originalDoc }) => {
        const user = req.user
        if (operation === 'create') {
          // Local API scripts have no user — leave authoredBy unset there
          if (user) data.authoredBy = user.id
        } else if (data && 'authoredBy' in data && user && !isAdminRole(user)) {
          // authorship is server-assigned; frontend accounts cannot change it
          data.authoredBy = originalDoc?.authoredBy ?? user.id
        }
        if (!user || isAdminRole(user)) return data

        const original = originalDoc as Expense | undefined
        const chataId = refId(operation === 'create' ? data.chata : (original?.chata ?? data.chata))
        if (operation === 'update' && data?.chata != null && original?.chata != null) {
          if (refId(data.chata) !== refId(original.chata)) {
            throw new APIError('Výdaj nelze přesunout do jiné chaty', 403)
          }
        }
        if (!chataId || chataId === 'undefined' || chataId === 'null') {
          throw new APIError('Výdaj musí patřit k chatě', 400)
        }

        const participantsResult = await req.payload.find({
          collection: 'participants',
          where: { chata: { equals: chataId } },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
        })
        const ownIds = linkedParticipantIds(user.id, participantsResult.docs)
        if (ownIds.length === 0) {
          throw new APIError('Na této chatě nemáte propojeného účastníka', 403)
        }

        const payer = normalizePayer(data?.payer ?? original?.payer)
        if (!payer) {
          throw new APIError('Výdaj musí mít plátce', 400)
        }
        // On update, an unchanged payer stays valid even if an admin had
        // assigned somebody else — only a NEW payer choice is checked.
        const payerUnchanged =
          operation === 'update' && samePayer(payer, normalizePayer(original?.payer))
        if (payerUnchanged) return data
        if (payer.relationTo === 'joint-accounts') {
          const jointAccountsResult = await req.payload.find({
            collection: 'joint-accounts',
            where: { chata: { equals: chataId } },
            limit: 1000,
            depth: 0,
            overrideAccess: true,
          })
          if (!isAllowedPayer(payer, ownIds, jointAccountsResult.docs)) {
            throw new APIError(
              'Platit můžete jen za společný účet, jehož jste členem',
              403,
            )
          }
        } else if (!isAllowedPayer(payer, ownIds, [])) {
          throw new APIError('Platit můžete jen za svého účastníka', 403)
        }

        return data
      },
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
    // Admin roles, plus signed-in frontend accounts (role "user") — those
    // are further restricted by the authoring hook above (own chata, own
    // payer) and may update/delete only what they authored
    create: ({ req: { user } }) => isAdminRole(user) || user?.role === 'user',
    update: expenseWriteAccess,
    delete: expenseWriteAccess,
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
        condition: (data) => Boolean(data?.chata),
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
        return false
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
        condition: (data, siblingData) => Boolean(data?.chata) && siblingData?.splitType === 'weighted',
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
            return false
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
        condition: (data) => Boolean(data?.chata),
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
            return false
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
            return false
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
      // The signed-in account that created this expense. Set automatically
      // by the beforeChange hook; drives the frontend "Přidali jste vy"
      // footer with edit/delete. maxDepth 0 keeps it a bare ID on the
      // public read APIs (never populates the user document/email).
      name: 'authoredBy',
      type: 'relationship',
      relationTo: 'users',
      maxDepth: 0,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Account that created this expense (set automatically). Frontend users may edit/delete only their own expenses.',
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
