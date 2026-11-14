import type { CollectionConfig } from 'payload'
import { superadminOnly } from '../lib/access'

// "Propojení s Claude" (docs/MCP.md): storage of the OAuth authorization
// server behind the remote MCP endpoint /api/mcp. Four server-owned
// collections, written only by src/lib/mcp (overrideAccess) — nobody,
// superadmins included, creates or edits rows through Payload's API:
//
// - mcp-clients: dynamically registered OAuth clients (RFC 7591). Claude
//   registers one per connector; the secret is stored as a SHA-256 hash.
// - mcp-grants: one row per connected app and account ("Claude in
//   claude.ai for jana@…"). Revoking it ends every token at once.
// - mcp-tokens: authorization codes, access and refresh tokens, stored only
//   as SHA-256 hashes. The retention job prunes expired rows.
// - mcp-audit: every write a connector made, with the record before and
//   after (list_recent_changes). Kept 12 months (retention job).
//
// Deleting a user deletes their rows of all four kinds
// (src/utils/userCleanup.ts) — grants.user is NOT NULL.
const nobody = () => false

const system = { en: 'System', cs: 'Systém' }

export const McpClients: CollectionConfig = {
  slug: 'mcp-clients',
  labels: {
    singular: { en: 'Claude connector client', cs: 'Klient konektoru Claude' },
    plural: { en: 'Claude connector clients', cs: 'Klienti konektoru Claude' },
  },
  admin: {
    hidden: true,
    group: system,
  },
  access: { read: superadminOnly, create: nobody, update: nobody, delete: superadminOnly },
  fields: [
    { name: 'clientName', type: 'text', required: true },
    { name: 'redirectUris', type: 'json', required: true },
    { name: 'tokenEndpointAuthMethod', type: 'text', required: true },
    { name: 'grantTypes', type: 'json', required: true },
    {
      name: 'clientSecretHash',
      type: 'text',
      access: { read: nobody, update: nobody, create: nobody },
      admin: { hidden: true },
    },
  ],
}

export const McpGrants: CollectionConfig = {
  slug: 'mcp-grants',
  labels: {
    singular: { en: 'Claude connection', cs: 'Propojení s Claude' },
    plural: { en: 'Claude connections', cs: 'Propojení s Claude' },
  },
  admin: {
    group: system,
    defaultColumns: ['clientName', 'user', 'scopes', 'lastUsedAt', 'revokedAt'],
    useAsTitle: 'clientName',
    description: {
      en:
        'Apps (Claude) that people connected to their own account through the connector at ' +
        '/api/mcp. Each person manages theirs on /claude. Deleting a row disconnects the app ' +
        'at once.',
      cs:
        'Aplikace (Claude), které si lidé propojili se svým účtem přes konektor /api/mcp. ' +
        'Každý je spravuje na stránce /claude. Smazáním řádku aplikaci okamžitě odpojíte.',
    },
  },
  access: { read: superadminOnly, create: nobody, update: nobody, delete: superadminOnly },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      maxDepth: 0,
      label: { en: 'Account', cs: 'Účet' },
    },
    {
      name: 'client',
      type: 'relationship',
      relationTo: 'mcp-clients',
      maxDepth: 0,
      admin: { hidden: true },
    },
    { name: 'clientName', type: 'text', required: true, label: { en: 'App', cs: 'Aplikace' } },
    { name: 'scopes', type: 'json', required: true, label: { en: 'Scopes', cs: 'Oprávnění' } },
    {
      name: 'lastUsedAt',
      type: 'date',
      label: { en: 'Last used', cs: 'Naposledy použito' },
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'revokedAt',
      type: 'date',
      index: true,
      label: { en: 'Revoked', cs: 'Odpojeno' },
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}

export const McpTokens: CollectionConfig = {
  slug: 'mcp-tokens',
  labels: {
    singular: { en: 'Claude connector token', cs: 'Token konektoru Claude' },
    plural: { en: 'Claude connector tokens', cs: 'Tokeny konektoru Claude' },
  },
  admin: { hidden: true, group: system },
  access: { read: superadminOnly, create: nobody, update: nobody, delete: superadminOnly },
  fields: [
    {
      name: 'tokenHash',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      access: { read: nobody, update: nobody, create: nobody },
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Authorization code', value: 'code' },
        { label: 'Access token', value: 'access' },
        { label: 'Refresh token', value: 'refresh' },
      ],
    },
    { name: 'client', type: 'relationship', relationTo: 'mcp-clients', required: true, maxDepth: 0 },
    // codes carry the approving account; tokens carry their grant
    { name: 'user', type: 'relationship', relationTo: 'users', maxDepth: 0, index: true },
    { name: 'grant', type: 'relationship', relationTo: 'mcp-grants', maxDepth: 0, index: true },
    { name: 'clientName', type: 'text' },
    { name: 'scopes', type: 'json', required: true },
    { name: 'resource', type: 'text' },
    { name: 'redirectUri', type: 'text' },
    { name: 'codeChallenge', type: 'text' },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    { name: 'usedAt', type: 'date' },
  ],
}

export const McpAudit: CollectionConfig = {
  slug: 'mcp-audit',
  labels: {
    singular: { en: 'Claude connector change', cs: 'Změna přes konektor Claude' },
    plural: { en: 'Claude connector changes', cs: 'Změny přes konektor Claude' },
  },
  admin: {
    group: system,
    defaultColumns: ['tool', 'action', 'targetCollection', 'documentId', 'user', 'createdAt'],
    description: {
      en:
        'Every write a connected Claude made, with the record before and after. Kept 12 months.',
      cs: 'Každá změna, kterou udělal připojený Claude, se záznamem před a po. Uchovává se 12 měsíců.',
    },
  },
  access: { read: superadminOnly, create: nobody, update: nobody, delete: superadminOnly },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      maxDepth: 0,
      label: { en: 'Account', cs: 'Účet' },
    },
    { name: 'grant', type: 'relationship', relationTo: 'mcp-grants', maxDepth: 0 },
    { name: 'clientName', type: 'text', label: { en: 'App', cs: 'Aplikace' } },
    { name: 'tool', type: 'text', required: true, label: { en: 'Tool', cs: 'Nástroj' } },
    { name: 'action', type: 'text', required: true, label: { en: 'Action', cs: 'Akce' } },
    { name: 'chata', type: 'number', index: true },
    { name: 'targetCollection', type: 'text', label: { en: 'Collection', cs: 'Kolekce' } },
    { name: 'documentId', type: 'text', label: { en: 'Record', cs: 'Záznam' } },
    { name: 'request', type: 'json', label: { en: 'Request', cs: 'Požadavek' } },
    { name: 'before', type: 'json', label: { en: 'Before', cs: 'Před' } },
    { name: 'after', type: 'json', label: { en: 'After', cs: 'Po' } },
  ],
}
