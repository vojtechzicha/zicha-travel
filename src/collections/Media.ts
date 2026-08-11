import type { CollectionConfig } from 'payload'
import { superadminOnly } from '../lib/access'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: { en: 'Media', cs: 'Médium' },
    plural: { en: 'Media', cs: 'Média' },
  },
  admin: {
    group: { en: 'System', cs: 'Systém' },
    description: {
      en: 'Files backing Backgrounds and Icons (not expense receipts)',
      cs: 'Soubory pro pozadí a ikony (ne účtenky výdajů)',
    },
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
