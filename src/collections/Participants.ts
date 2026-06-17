import type { CollectionConfig } from 'payload'
import crypto from 'crypto'

export const Participants: CollectionConfig = {
  slug: 'participants',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'chata', 'accountNumber'],
  },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        // Generate a magic-link invite token on creation so the organizer
        // always has a shareable login link for the participant.
        if (operation === 'create' && !data.inviteToken) {
          data.inviteToken = crypto.randomBytes(24).toString('hex')
        }
        return data
      },
    ],
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Users can create/update participants for chatas they manage
    create: ({ req: { user } }) => {
      if (!user || user.collection !== 'users') return false
      return true // Will be filtered by chata access
    },
    update: ({ req: { user } }) => {
      if (!user || user.collection !== 'users') return false
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
      if (!user || user.collection !== 'users') return false
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
      type: 'collapsible',
      label: 'Login & Invite',
      admin: {
        description: 'Magic link and linked login account for this participant',
        initCollapsed: true,
      },
      fields: [
        {
          name: 'inviteToken',
          type: 'text',
          admin: {
            description: 'Secret token used to build the magic login link',
            readOnly: true,
          },
        },
        {
          name: 'magicLink',
          type: 'ui',
          admin: {
            components: {
              Field: '@/collections/Participants/components/MagicLinkField#MagicLinkField',
            },
          },
        },
        {
          name: 'account',
          type: 'relationship',
          relationTo: 'accounts',
          admin: {
            description:
              'Login account linked to this participant (set automatically when they first log in)',
          },
        },
      ],
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
