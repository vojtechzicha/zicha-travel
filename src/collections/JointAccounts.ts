import type { CollectionConfig } from 'payload'
import type { JointAccount } from '../payload-types'

export const JointAccounts: CollectionConfig = {
  slug: 'joint-accounts',
  labels: {
    singular: 'Joint Account',
    plural: 'Joint Accounts',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'chata', 'members'],
    description:
      'Shared bank accounts ("společný účet") of 2+ participants. Can be selected as the payer of an expense or sender of a prepayment; the amount is attributed equally to the members.',
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    create: ({ req: { user } }) => {
      if (!user) return false
      return true
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return {
        chata: {
          in: user.assignedChatas || [],
        },
      }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      return {
        chata: {
          in: user.assignedChatas || [],
        },
      }
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Display name of the joint account (e.g., "Alice + Bob")',
      },
    },
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      admin: {
        description: 'The trip/chata this joint account belongs to',
      },
    },
    {
      name: 'members',
      type: 'relationship',
      relationTo: 'participants',
      hasMany: true,
      required: true,
      minRows: 2,
      admin: {
        description: 'Participants sharing this account (at least 2)',
        condition: (data) => Boolean(data?.chata),
      },
      filterOptions: ({ data }) => {
        const doc = data as Partial<JointAccount> | undefined
        if (doc?.chata) {
          return {
            chata: {
              equals: typeof doc.chata === 'object' ? doc.chata.id : doc.chata,
            },
          }
        }
        return false
      },
      validate: async (value, { data, req }) => {
        const memberIds = (value as (number | string)[] | null | undefined) || []
        if (memberIds.length < 2) {
          return 'A joint account needs at least 2 members'
        }
        if (new Set(memberIds.map(String)).size !== memberIds.length) {
          return 'Each participant can be listed only once'
        }
        // A participant may belong to at most one joint account per chata
        const doc = data as Partial<JointAccount> | undefined
        const chataId = typeof doc?.chata === 'object' ? doc?.chata?.id : doc?.chata
        if (chataId && req?.payload) {
          const others = await req.payload.find({
            collection: 'joint-accounts',
            where: {
              and: [
                { chata: { equals: chataId } },
                { members: { in: memberIds } },
                ...(doc?.id ? [{ id: { not_equals: doc.id } }] : []),
              ],
            },
            limit: 1,
            depth: 0,
          })
          if (others.docs.length > 0) {
            return `A participant is already a member of joint account "${others.docs[0].name}" — each participant can belong to only one joint account per chata`
          }
        }
        return true
      },
    },
  ],
}
