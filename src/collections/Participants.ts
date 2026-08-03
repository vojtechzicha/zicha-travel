import crypto from 'crypto'
import { APIError } from 'payload'
import type { CollectionConfig, Where } from 'payload'
import type { Participant } from '../payload-types'
import { refId, syncPaidByInvitations } from '../utils/paidByInvitations'
import { adminRoleOnly, canManageChata, chataScopedAccess } from '../lib/access'

const isOAuthEnabled = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)

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
        if (!canManageChata(req.user, chataId)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        const result = await syncPaidByInvitations(req.payload, participant)
        return Response.json(result)
      },
    },
    {
      // Create a frontend user account for this participant (or link an
      // existing one found by email). No invitation/notification is sent —
      // the person only gets an email when they later request a login link.
      path: '/:id/create-account',
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
        if (!canManageChata(req.user, chataId)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        let email: unknown
        try {
          const body = await req.json?.()
          email = body?.email
        } catch {
          email = undefined
        }
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          return Response.json({ error: 'A valid email is required' }, { status: 400 })
        }
        const normalizedEmail = email.trim().toLowerCase()

        const existing = await req.payload.find({
          collection: 'users',
          where: { email: { equals: normalizedEmail } },
          limit: 1,
          depth: 0,
        })

        let userId: number
        let created = false
        if (existing.docs.length > 0) {
          userId = existing.docs[0].id
        } else {
          const newUser = await req.payload.create({
            collection: 'users',
            data: {
              email: normalizedEmail,
              role: 'user' as const,
              // The local (password) strategy only exists where OAuth is not
              // configured — give it an unguessable throwaway password there
              ...(isOAuthEnabled
                ? {}
                : { password: crypto.randomBytes(24).toString('hex') }),
            },
          })
          userId = newUser.id
          created = true
        }

        // One account per participant per chata — refuse linking a user who
        // already has a different participant in this chata
        const conflict = await req.payload.find({
          collection: 'participants',
          where: {
            and: [
              { chata: { equals: Number(chataId) } },
              { account: { equals: userId } },
              { id: { not_equals: participant.id } },
            ],
          },
          limit: 1,
          depth: 0,
        })
        if (conflict.docs.length > 0) {
          return Response.json(
            {
              error: `User ${normalizedEmail} is already linked to participant "${conflict.docs[0].name}" in this chata`,
            },
            { status: 409 },
          )
        }

        await req.payload.update({
          collection: 'participants',
          id: participant.id,
          data: { account: userId },
        })

        return Response.json({ userId, email: normalizedEmail, created, linked: true })
      },
    },
  ],
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'chata', 'accountNumber'],
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
      name: 'copyFrom',
      type: 'ui',
      admin: {
        components: {
          Field:
            '@/collections/Participants/components/CopyFromParticipantButton#CopyFromParticipantButton',
        },
        // Prefill helper for repeating participants — only relevant on create
        condition: (data) => !data?.id,
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Participant\'s full name',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'akuzativ',
          type: 'text',
          label: 'Akuzativ (4. pád)',
          admin: {
            description:
              'Name in the accusative case, e.g. "Katku" — used in phrases like ' +
              '"Vojta zve Katku". Falls back to the plain name when empty.',
          },
        },
        {
          name: 'vokativ',
          type: 'text',
          label: 'Vokativ (5. pád)',
          admin: {
            description:
              'Name in the vocative case, e.g. "Katko" — stored for future ' +
              'greetings, not displayed anywhere yet.',
          },
        },
      ],
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
          'This participant\'s expense shares are permanently covered by another ' +
          'participant (e.g. a child paid by a parent). New expenses automatically ' +
          'get a standing invitation; use the button below to apply the SAVED ' +
          'value to existing expenses.',
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
    {
      // Frontend user account of this person. Signed-in users see only
      // their own finances; admins/superadmins keep the full participant
      // selector (defaulting to their linked participant). Participants
      // WITH an account are hidden from anonymous visitors' Finance view.
      name: 'account',
      type: 'relationship',
      relationTo: 'users',
      admin: {
        description:
          'User account linked to this participant ("účet"). Use the button below to ' +
          'create a new account from an email — nothing is emailed until the person ' +
          'requests a login link themselves.',
        components: {
          afterInput: [
            '@/collections/Participants/components/CreateAccountButton#CreateAccountButton',
          ],
        },
      },
    },
  ],
  hooks: {
    beforeValidate: [
      // One account per chata: the same user must not be linked to two
      // participants of one chata (application-level, like the name
      // uniqueness — no compound unique index support in Payload 3.x)
      async ({ data, req, originalDoc }) => {
        const accountRef = data?.account ?? originalDoc?.account
        const chataRef = data?.chata ?? originalDoc?.chata
        if (!accountRef || !chataRef) return data
        const conflict = await req.payload.find({
          collection: 'participants',
          where: {
            and: [
              { chata: { equals: refId(chataRef) } },
              { account: { equals: refId(accountRef) } },
              ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
            ],
          },
          limit: 1,
          depth: 0,
        })
        if (conflict.docs.length > 0) {
          throw new APIError(
            `This user account is already linked to participant "${conflict.docs[0].name}" in the same chata`,
            400,
          )
        }
        return data
      },
    ],
  },
  // Note: Unique constraint on chata+name handled by application logic
  // Payload 3.x doesn't support compound unique indexes via config
}
