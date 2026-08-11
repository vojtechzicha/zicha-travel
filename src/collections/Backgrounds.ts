import type { CollectionConfig } from 'payload'
import { isSuperadmin } from '../lib/access'

export const Backgrounds: CollectionConfig = {
  slug: 'backgrounds',
  labels: {
    singular: { en: 'Background', cs: 'Pozadí' },
    plural: { en: 'Backgrounds', cs: 'Pozadí' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'isDefault', 'type'],
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
          en: 'Display name for this background',
          cs: 'Zobrazovaný název tohoto pozadí',
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
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'url',
      options: [
        { label: { en: 'External URL', cs: 'Externí URL' }, value: 'url' },
        { label: { en: 'Uploaded Image', cs: 'Nahraný obrázek' }, value: 'upload' },
      ],
    },
    {
      name: 'url',
      type: 'text',
      admin: {
        description: {
          en: 'External image URL (e.g., Unsplash)',
          cs: 'URL externího obrázku (např. Unsplash)',
        },
        condition: (data) => data.type === 'url',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: {
          en: 'Upload a background image',
          cs: 'Nahrajte obrázek pozadí',
        },
        condition: (data) => data.type === 'upload',
      },
    },
  ],
}
