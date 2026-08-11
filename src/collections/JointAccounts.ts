import type { CollectionConfig } from 'payload'
import type { JointAccount } from '../payload-types'
import { adminRoleOnly, chataScopedAccess } from '../lib/access'
import { pickValidationMessage } from '../i18n/adminTranslations'

export const JointAccounts: CollectionConfig = {
  slug: 'joint-accounts',
  labels: {
    singular: { en: 'Joint Account', cs: 'Společný účet' },
    plural: { en: 'Joint Accounts', cs: 'Společné účty' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'chata', 'members'],
    group: { en: 'Expense Tracking', cs: 'Evidence výdajů' },
    description: {
      en: 'Shared bank accounts ("společný účet") of 2+ participants. Can be selected as the payer of an expense or sender of a prepayment; the amount is attributed equally to the members.',
      cs: 'Společné bankovní účty dvou a více účastníků. Lze je vybrat jako plátce výdaje nebo odesílatele zálohy; částka se rozpočítá rovným dílem mezi členy.',
    },
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Admin roles only; admins are limited to their assigned chatas
    create: adminRoleOnly,
    update: chataScopedAccess,
    delete: chataScopedAccess,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: {
          en: 'Display name of the joint account (e.g., "Alice + Bob")',
          cs: 'Zobrazovaný název společného účtu (např. „Alice + Bob“)',
        },
      },
    },
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      admin: {
        description: {
          en: 'The trip/chata this joint account belongs to',
          cs: 'Chata/výlet, kam tento společný účet patří',
        },
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
        description: {
          en: 'Participants sharing this account (at least 2)',
          cs: 'Účastníci sdílející tento účet (alespoň 2)',
        },
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
          return pickValidationMessage(
            req,
            'A joint account needs at least 2 members',
            'Společný účet potřebuje alespoň 2 členy',
          )
        }
        if (new Set(memberIds.map(String)).size !== memberIds.length) {
          return pickValidationMessage(
            req,
            'Each participant can be listed only once',
            'Každý účastník může být uveden jen jednou',
          )
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
            return pickValidationMessage(
              req,
              `A participant is already a member of joint account "${others.docs[0].name}" — each participant can belong to only one joint account per chata`,
              `Účastník už je členem společného účtu „${others.docs[0].name}“ – každý účastník může na jedné chatě patřit jen do jednoho společného účtu`,
            )
          }
        }
        return true
      },
    },
  ],
}
