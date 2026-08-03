import type { CollectionConfig } from 'payload'
import { superadminOnly } from '../lib/access'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'System',
    description: 'Files backing Backgrounds and Icons (not expense receipts)',
  },
  access: {
    read: () => true,
    // Backs the superadmin-managed Backgrounds/Icons collections
    create: superadminOnly,
    update: superadminOnly,
    delete: superadminOnly,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
