import type { CollectionConfig } from 'payload'
import { isSuperadmin } from '../lib/access'

export const Backgrounds: CollectionConfig = {
  slug: 'backgrounds',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'isDefault', 'type'],
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
        description: 'Display name for this background',
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
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'url',
      options: [
        { label: 'External URL', value: 'url' },
        { label: 'Uploaded Image', value: 'upload' },
      ],
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description: 'External image URL (e.g., Unsplash)',
        condition: (data) => data.type === 'url',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Upload a background image',
        condition: (data) => data.type === 'upload',
      },
    },
  ],
}
