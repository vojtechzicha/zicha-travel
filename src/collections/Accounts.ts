import type { CollectionConfig } from 'payload'
import { parseCookies } from 'payload'
import { verifySessionToken } from '@/lib/auth/session'

/**
 * Accounts are the global login identity for trip participants.
 *
 * Auth is handled entirely through the shared `payload-token` cookie (the same
 * one the admin `Users` collection uses). The custom strategy below decodes the
 * JWT and only claims the request when `collection === 'accounts'`, so a single
 * cookie can represent either an admin User or a participant Account.
 *
 * Login happens via magic link (see /api/auth/magic) or OAuth (Google /
 * Microsoft, see /api/auth/oauth/*). An account may have multiple verified
 * emails, any of which can be used for OAuth sign-in.
 */
export const Accounts: CollectionConfig = {
  slug: 'accounts',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'emails'],
    group: 'Auth',
  },
  auth: {
    // No passwords: identity comes from magic links and verified OAuth emails.
    disableLocalStrategy: true,
    strategies: [
      {
        name: 'accounts-cookie',
        authenticate: async ({ payload, headers }) => {
          const token = parseCookies(headers).get('payload-token')
          if (!token) return { user: null }

          const decoded = verifySessionToken(token)
          if (!decoded || decoded.collection !== 'accounts') return { user: null }

          try {
            const account = await payload.findByID({
              collection: 'accounts',
              id: decoded.id,
            })
            if (!account) return { user: null }
            return { user: { ...account, collection: 'accounts' as const } }
          } catch {
            return { user: null }
          }
        },
      },
    ],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => user?.collection === 'users',
    update: ({ req: { user } }) => user?.collection === 'users',
    delete: ({ req: { user } }) => user?.collection === 'users',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      admin: {
        description: 'Display name for this login account',
      },
    },
    {
      name: 'emails',
      type: 'array',
      admin: {
        description: 'Verified email addresses that can sign in via Google/Microsoft',
      },
      fields: [
        {
          name: 'email',
          type: 'email',
          required: true,
        },
      ],
    },
  ],
}
