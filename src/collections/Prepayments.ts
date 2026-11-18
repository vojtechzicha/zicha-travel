import { APIError, type Access, type CollectionConfig, type PayloadRequest, type Where } from 'payload'
import type { Prepayment } from '../payload-types'
import { canManageChata, isAdminRole, isSuperadmin, refId } from '../lib/access'
import { normalizePayer } from '../lib/expenseAuthoring'
import { canManagePrepayments, prepaymentProblem } from '../lib/prepayments'
import { assertRefsBelongToChata } from '../utils/chataRefIntegrity'
import { bankerChataIds } from './listItemRules'

// Who records payments between people and the banker (src/lib/prepayments.ts):
// superadmins, admins of the chata, and the chata's banker, who sees the
// money arrive and records it from the Finance view or through Claude, never
// the admin panel. Everybody reads (the balances are public).

/** Does this account own the banker participant of the chata? */
async function isBankerOf(req: PayloadRequest, chataId: string): Promise<boolean> {
  if (!req.user) return false
  return (await bankerChataIds(req.payload, req.user.id)).map(String).includes(chataId)
}

// Update/delete: superadmin everything, admins their assigned chatas, the
// banker the chatas they keep the money of. The beforeChange hook re-checks
// the target chata (a row never moves somewhere its writer has no say).
const prepaymentWriteAccess: Access = async ({ req }) => {
  const user = req.user
  if (!user) return false
  if (isSuperadmin(user)) return true
  const chatas: unknown[] = []
  if (user.role === 'admin') chatas.push(...(user.assignedChatas ?? []))
  chatas.push(...(await bankerChataIds(req.payload, user.id)))
  if (chatas.length === 0) return false
  return { chata: { in: chatas.map(refId) } } as Where
}

const PROBLEM_MESSAGES = {
  type: 'Neznámý typ platby',
  amount: 'Částka musí být nenulová a nejvýš 1 000 000 Kč',
  sign: 'Záloha a doplatek jdou pokladníkovi (kladná částka), vratka od pokladníka (záporná)',
} as const

export const Prepayments: CollectionConfig = {
  slug: 'prepayments',
  labels: {
    singular: { en: 'Prepayment', cs: 'Záloha' },
    plural: { en: 'Prepayments', cs: 'Zálohy' },
  },
  hooks: {
    beforeChange: [
      // Reference integrity: a prepayment never spans chatas. The sender
      // must belong to the prepayment's own chata whoever writes it — the
      // admin filterOptions only constrain the UI.
      async ({ data, req, originalDoc }) => {
        if (!data) return data
        const original = originalDoc as Prepayment | undefined
        const eff = (key: string): unknown =>
          (data as Record<string, unknown>)[key] !== undefined
            ? (data as Record<string, unknown>)[key]
            : (original as unknown as Record<string, unknown> | undefined)?.[key]
        const chataId = refId(eff('chata'))
        if (!chataId || chataId === 'undefined' || chataId === 'null') return data

        // Who: every signed-in writer must have a say over the target chata
        // AND, on update, over the chata the row came from. Server-side
        // writes (no req.user) pass. Create access is "signed in" only, so
        // this is the check that matters for create.
        const user = req.user
        if (user) {
          const chatas = new Set([chataId])
          if (original?.chata != null) chatas.add(refId(original.chata))
          for (const id of chatas) {
            const allowed = canManagePrepayments({
              managesChata: canManageChata(user, id),
              isBanker: await isBankerOf(req, id),
            })
            if (!allowed) {
              throw new APIError('Platby téhle chaty zapisuje jen pokladník nebo správce chaty', 403)
            }
          }
          // The admin panel keeps its free hand (legacy rows of every
          // shape); the banker's path keeps the sign matching the type
          // whenever the amount or the type changes. An untouched pair
          // passes, so a legacy row's note or date can still be fixed.
          const pairUnchanged =
            original != null &&
            eff('amount') === original.amount &&
            eff('type') === original.type
          if (!isAdminRole(user) && !pairUnchanged) {
            const problem = prepaymentProblem({ type: eff('type'), amount: eff('amount') })
            if (problem) throw new APIError(PROBLEM_MESSAGES[problem], 400)
          }
        }

        const from = normalizePayer(eff('from'))
        await assertRefsBelongToChata({
          req,
          chataId,
          participantRefs: from?.relationTo === 'participants' ? [from.value] : [],
          jointAccountRefs: from?.relationTo === 'joint-accounts' ? [from.value] : [],
          participantMessage: 'Záloha nemůže odkazovat na účastníka jiné chaty',
          jointAccountMessage: 'Záloha nemůže odkazovat na společný účet jiné chaty',
        })
        return data
      },
    ],
  },
  admin: {
    useAsTitle: 'note',
    defaultColumns: ['from', 'amount', 'type', 'chata'],
    group: { en: 'Expense Tracking', cs: 'Evidence výdajů' },
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Signed in; the beforeChange hook decides (banker or chata admin)
    create: ({ req: { user } }) => Boolean(user),
    update: prepaymentWriteAccess,
    delete: prepaymentWriteAccess,
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
