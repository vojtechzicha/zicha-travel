import type { CollectionConfig } from 'payload'

export const Participants: CollectionConfig = {
  slug: 'participants',
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
          },
        },
        {
          name: 'iban',
          type: 'text',
          admin: {
            description: 'Full IBAN for QR code generation - only needed for creditors',
          },
        },
      ],
    },
  ],
  // Note: Unique constraint on chata+name handled by application logic
  // Payload 3.x doesn't support compound unique indexes via config
}
