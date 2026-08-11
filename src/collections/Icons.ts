import type { CollectionConfig } from 'payload'
import { isSuperadmin } from '../lib/access'

export const Icons: CollectionConfig = {
  slug: 'icons',
  labels: {
    singular: { en: 'Icon', cs: 'Ikona' },
    plural: { en: 'Icons', cs: 'Ikony' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'isDefault'],
    group: { en: 'Appearance', cs: 'Vzhled' },
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
        description: {
          en: 'Display name for this icon',
          cs: 'Zobrazovaný název této ikony',
        },
      },
    },
    {
      name: 'isDefault',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: {
          en: 'System default - cannot be deleted',
          cs: 'Systémové výchozí – nelze smazat',
        },
        readOnly: true,
      },
    },
    {
      name: 'svg',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description: {
          en: 'Upload an SVG icon file',
          cs: 'Nahrajte soubor ikony ve formátu SVG',
        },
      },
    },
  ],
}
