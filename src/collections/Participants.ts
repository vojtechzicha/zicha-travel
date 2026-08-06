import crypto from 'crypto'
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
        condition: (data) => Boolean(data?.chata),
        components: {
          afterInput: ['@/collections/Participants/components/ApplyPaidByButton#ApplyPaidByButton'],
        },
      },
      filterOptions: ({ data, id }) => {
        const doc = data as Partial<Participant> | undefined
        if (!doc?.chata) return false
        const conditions: Where[] = [
          {
            chata: { equals: typeof doc.chata === 'object' ? doc.chata.id : doc.chata },
          },
        ]
        if (id) {
          conditions.push({ id: { not_equals: id } })
        }
        return { and: conditions }
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
      // Frontend user account of this person — a participant belongs to at
      // most ONE user, but one user may own several participants (even in
      // the same chata, e.g. a parent and their children). Signed-in users
      // see only their own participants; admins/superadmins keep the full
      // selector. A participant is hidden from anonymous visitors only once
      // the account is ACTIVE (has logged in at least once).
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
            // Empty name/vokativ prefill from the selected account's display name
            '@/collections/Participants/components/AccountNamePrefill#AccountNamePrefill',
            '@/collections/Participants/components/CreateAccountButton#CreateAccountButton',
          ],
        },
      },
    },
  ],
  // Note: Unique constraint on chata+name handled by application logic
  // Payload 3.x doesn't support compound unique indexes via config
}
