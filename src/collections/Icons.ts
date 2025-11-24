import type { CollectionConfig } from 'payload'

export const Icons: CollectionConfig = {
  slug: 'icons',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'isDefault'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user && user.role === 'admin',
    update: ({ req: { user } }) => !!user && user.role === 'admin',
    delete: ({ req: { user }, data }) => {
      if (!user || user.role !== 'admin') return false
      return !data?.isDefault // Prevent deletion of default
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Display name for this icon',
      },
    },
    {
      name: 'isDefault',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'System default - cannot be deleted',
        readOnly: true,
      },
    },
    {
      name: 'svg',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description: 'Upload an SVG icon file',
      },
    },
  ],
}
