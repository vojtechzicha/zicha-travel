import type { CollectionConfig } from 'payload'
import { isSuperadmin } from '../lib/access'

export const Icons: CollectionConfig = {
  slug: 'icons',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'isDefault'],
    group: 'Appearance',
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => isSuperadmin(user),
    update: ({ req: { user } }) => isSuperadmin(user),
    delete: ({ req: { user }, data }) => {
      if (!isSuperadmin(user)) return false
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
