import type { CollectionConfig } from 'payload'
import { superadminOnly } from '../lib/access'

// "Propojení s Rohlíkem" — the banker's Rohlík account, connected once via
// OAuth (src/lib/rohlik/oauth.ts) so the shopping list ("Nákup") can search
// products and fill their Rohlík cart. One row per user account; tokens are
// AES-GCM encrypted (src/lib/rohlik/crypto.ts) and never leave the server:
// field-level read is closed to everybody, the API writes use overrideAccess
// (src/utils/rohlikConnection.ts). Deleting a user drops their row
// (src/utils/userCleanup.ts).
const nobody = () => false

export const RohlikConnections: CollectionConfig = {
  slug: 'rohlik-connections',
  labels: {
    singular: { en: 'Rohlík connection', cs: 'Propojení s Rohlíkem' },
    plural: { en: 'Rohlík connections', cs: 'Propojení s Rohlíkem' },
  },
  admin: {
    defaultColumns: ['user', 'connectedAt', 'expiresAt'],
    group: { en: 'System', cs: 'Systém' },
    description: {
      en:
        'Rohlík accounts connected by bankers for the shopping list. Created by the connect ' +
        'flow on the chata page; tokens are encrypted and not shown. Delete a row to disconnect.',
      cs:
        'Účty na Rohlíku, které bankéři propojili kvůli nákupnímu seznamu. Vznikají propojením ' +
        'na stránce chaty, tokeny jsou šifrované a nezobrazují se. Smazáním řádku propojení zrušíte.',
    },
  },
  access: {
    read: superadminOnly,
    create: nobody,
    update: nobody,
    delete: superadminOnly,
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      unique: true,
      index: true,
      maxDepth: 0,
      label: { en: 'Account', cs: 'Účet' },
    },
    {
      name: 'clientId',
      type: 'text',
      label: { en: 'OAuth client', cs: 'OAuth klient' },
      admin: { readOnly: true },
    },
    {
      name: 'redirectUri',
      type: 'text',
      admin: { hidden: true },
    },
    {
      name: 'accessToken',
      type: 'text',
      access: { read: nobody, update: nobody, create: nobody },
      admin: { hidden: true },
    },
    {
      name: 'refreshToken',
      type: 'text',
      access: { read: nobody, update: nobody, create: nobody },
      admin: { hidden: true },
    },
    {
      name: 'expiresAt',
      type: 'date',
      label: { en: 'Access token expires', cs: 'Platnost přístupového tokenu' },
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'connectedAt',
      type: 'date',
      label: { en: 'Connected on', cs: 'Propojeno dne' },
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
