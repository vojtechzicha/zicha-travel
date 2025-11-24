import type { GlobalConfig } from 'payload'

export const DomainMappings: GlobalConfig = {
  slug: 'domain-mappings',
  access: {
    read: () => true, // Public access for domain resolution
    update: ({ req: { user } }) => {
      // Only admins can update domain mappings
      return !!user && user.role === 'admin'
    },
  },
  fields: [
    {
      name: 'defaultChata',
      type: 'relationship',
      relationTo: 'chatas',
      admin: {
        description:
          'Default chata to use when domain does not match any configured domains',
      },
    },
  ],
}
