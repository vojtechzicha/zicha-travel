import type { CollectionConfig } from 'payload'
import { parseCookies } from 'payload'
import jwt from 'jsonwebtoken'

const isOAuthEnabled = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET)

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    ...(isOAuthEnabled ? { disableLocalStrategy: { enableFields: true } } : {}),
    strategies: isOAuthEnabled
      ? [
          {
            name: 'microsoft-oauth',
            authenticate: async ({ payload, headers }) => {
              const cookies = parseCookies(headers)
              const token = cookies.get('payload-token')
              if (!token) return { user: null }

              try {
                const decoded = jwt.verify(token, process.env.PAYLOAD_SECRET!) as {
                  id: string
                  collection: string
                  email: string
                }
                if (decoded.collection !== 'users') return { user: null }

                const user = await payload.findByID({
                  collection: 'users',
                  id: decoded.id,
                })
                if (!user) return { user: null }

                return { user: { ...user, collection: 'users' as const } }
              } catch {
                return { user: null }
              }
            },
          },
        ]
      : [],
  },
  fields: [
    // Email added by default
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'user',
      options: [
        {
          label: 'Admin',
          value: 'admin',
        },
        {
          label: 'User',
          value: 'user',
        },
      ],
      admin: {
        description: 'Admins can manage all chatas, users can only manage assigned chatas',
      },
    },
    {
      name: 'assignedChatas',
      type: 'relationship',
      relationTo: 'chatas',
      hasMany: true,
      admin: {
        description: 'Chatas this user can manage (only applies to non-admin users)',
        condition: (data) => data.role !== 'admin',
      },
    },
  ],
}
