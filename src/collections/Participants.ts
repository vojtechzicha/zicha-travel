import type { CollectionConfig, Where } from 'payload'
import type { Participant } from '../payload-types'
import { refId, syncPaidByInvitations } from '../utils/paidByInvitations'

export const Participants: CollectionConfig = {
  slug: 'participants',
  endpoints: [
    {
      // Retroactive sync of the standing "paid by" invitation onto all
      // existing expenses of this participant's chata (see the
      // ApplyPaidByButton on the edit form)
      path: '/:id/apply-paid-by',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const id = req.routeParams?.id as string | undefined
        if (!id) {
          return Response.json({ error: 'Missing participant id' }, { status: 400 })
        }
        const participant = await req.payload.findByID({
          collection: 'participants',
          id,
          depth: 0,
        })
        const chataId = refId(participant.chata)
        const assigned = ((req.user.assignedChatas as unknown[]) || []).map((c) => refId(c as any))
        if (req.user.role !== 'admin' && !assigned.includes(chataId)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        const result = await syncPaidByInvitations(req.payload, participant)
        return Response.json(result)
      },
    },
  ],
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'chata', 'accountNumber'],
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Users can create/update participants for chatas they manage
    create: ({ req: { user } }) => {
      if (!user) return false
      return true // Will be filtered by chata access
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Users can only update participants in chatas they're assigned to
      return {
        chata: {
          // This will be checked against user's assigned chatas
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
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Participant\'s full name',
      },
    },
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      admin: {
        description: 'The trip/chata this participant belongs to',
      },
    },
    {
      name: 'hasPet',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Participant is travelling with a pet',
      },
    },
    {
      name: 'paidBy',
      type: 'relationship',
      relationTo: 'participants',
      admin: {
        description:
          'Platí za něj/ni – this participant\'s expense shares are permanently ' +
          'covered by another participant (e.g. a child paid by a parent). New ' +
          'expenses automatically get a standing invitation; use the button below ' +
          'to apply the SAVED value to existing expenses.',
        components: {
          afterInput: ['@/collections/Participants/components/ApplyPaidByButton#ApplyPaidByButton'],
        },
      },
      filterOptions: ({ data, id }) => {
        const doc = data as Partial<Participant> | undefined
        const conditions: Where[] = []
        if (doc?.chata) {
          conditions.push({
            chata: { equals: typeof doc.chata === 'object' ? doc.chata.id : doc.chata },
          })
        }
        if (id) {
          conditions.push({ id: { not_equals: id } })
        }
        return conditions.length > 0 ? { and: conditions } : true
      },
      validate: (value: unknown, { id }: { id?: unknown }) => {
        const ref = value as null | undefined | number | string | { id: number | string }
        const refValue = typeof ref === 'object' && ref !== null ? ref.id : ref
        if (refValue !== null && refValue !== undefined && id && String(refValue) === String(id)) {
          return 'A participant cannot be paid by themselves'
        }
        return true
      },
    },
    {
      type: 'collapsible',
      label: 'Banking Information',
      admin: {
        description: 'Required only for creditors who will receive money back',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'accountNumber',
          type: 'text',
          admin: {
            description: 'Account number in Czech format (e.g., "123456/0100") - only needed for creditors',
            components: {
              Field:
                '@/components/CzechBankAccountField#CzechBankAccountField',
            },
            custom: {
              siblingPath: 'iban',
              direction: 'toIban',
            },
          },
        },
        {
          name: 'iban',
          type: 'text',
          admin: {
            description: 'Full IBAN for QR code generation - only needed for creditors',
            components: {
              Field:
                '@/components/CzechBankAccountField#CzechBankAccountField',
            },
            custom: {
              siblingPath: 'accountNumber',
              direction: 'toAccount',
            },
          },
        },
      ],
    },
  ],
  // Note: Unique constraint on chata+name handled by application logic
  // Payload 3.x doesn't support compound unique indexes via config
}
