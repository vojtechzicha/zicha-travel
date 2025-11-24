import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [
    // Email added by default
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      options: [
        {
          label: 'Admin',
          value: 'admin',
        },
        {
          label: 'User',
          value: 'user',
        },
      ],
      admin: {
        description: 'Admins can manage all chatas, users can only manage assigned chatas',
      },
    },
    {
      name: 'assignedChatas',
      type: 'relationship',
      relationTo: 'chatas',
      hasMany: true,
      admin: {
        description: 'Chatas this user can manage (only applies to non-admin users)',
        condition: (data) => data.role !== 'admin',
      },
    },
  ],
}
