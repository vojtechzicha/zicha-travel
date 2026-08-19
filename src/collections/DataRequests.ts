import type { CollectionConfig } from 'payload'
import { adminRoleOnly, superadminOnly } from '../lib/access'

// "Žádosti o údaje" — a small log of data-subject requests and how they
// were handled (compliance blocker 6). The privacy policy promises an
// answer within a month; this collection is the evidence that promise is
// kept. Maintained by hand: one row per request received by email or in
// person. Never public — rows name real people.
export const DataRequests: CollectionConfig = {
  slug: 'data-requests',
  labels: {
    singular: { en: 'Data Request', cs: 'Žádost o údaje' },
    plural: { en: 'Data Requests', cs: 'Žádosti o údaje' },
  },
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['subject', 'type', 'status', 'receivedAt', 'resolvedAt'],
    group: { en: 'System', cs: 'Systém' },
    description: {
      en:
        'Log of GDPR data-subject requests (access, copy, rectification, erasure...). ' +
        'One row per request; the policy promises an answer within one month of receivedAt.',
      cs:
        'Evidence žádostí podle GDPR (přístup, kopie, oprava, výmaz…). Jeden řádek na ' +
        'žádost; zásady slibují odpověď do měsíce od data přijetí.',
    },
  },
  access: {
    read: adminRoleOnly,
    create: adminRoleOnly,
    update: adminRoleOnly,
    delete: superadminOnly,
  },
  fields: [
    {
      name: 'subject',
      type: 'text',
      required: true,
      label: { en: 'Who asked', cs: 'Kdo žádá' },
      admin: {
        description: {
          en: 'Name or email of the person making the request',
          cs: 'Jméno nebo e-mail žadatele',
        },
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      label: { en: 'Request type', cs: 'Typ žádosti' },
      options: [
        { label: { en: 'Access / copy (Art. 15)', cs: 'Přístup / kopie (čl. 15)' }, value: 'access' },
        { label: { en: 'Rectification (Art. 16)', cs: 'Oprava (čl. 16)' }, value: 'rectification' },
        { label: { en: 'Erasure (Art. 17)', cs: 'Výmaz (čl. 17)' }, value: 'erasure' },
        { label: { en: 'Restriction (Art. 18)', cs: 'Omezení (čl. 18)' }, value: 'restriction' },
        { label: { en: 'Portability (Art. 20)', cs: 'Přenositelnost (čl. 20)' }, value: 'portability' },
        { label: { en: 'Objection (Art. 21)', cs: 'Námitka (čl. 21)' }, value: 'objection' },
        { label: { en: 'Other', cs: 'Jiné' }, value: 'other' },
      ],
    },
    {
      name: 'receivedAt',
      type: 'date',
      required: true,
      label: { en: 'Received on', cs: 'Přijato dne' },
      admin: { date: { displayFormat: 'yyyy-MM-dd' } },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'received',
      label: { en: 'Status', cs: 'Stav' },
      options: [
        { label: { en: 'Received', cs: 'Přijato' }, value: 'received' },
        { label: { en: 'In progress', cs: 'Vyřizuje se' }, value: 'in-progress' },
        { label: { en: 'Done', cs: 'Vyřízeno' }, value: 'done' },
        { label: { en: 'Refused (with reason)', cs: 'Odmítnuto (s důvodem)' }, value: 'refused' },
      ],
    },
    {
      name: 'resolvedAt',
      type: 'date',
      label: { en: 'Resolved on', cs: 'Vyřízeno dne' },
      admin: { date: { displayFormat: 'yyyy-MM-dd' } },
    },
    {
      name: 'note',
      type: 'textarea',
      label: { en: 'What was done', cs: 'Co se udělalo' },
      admin: {
        description: {
          en: 'How the request was verified and handled (export sent, anonymized, refused and why...)',
          cs: 'Jak byla žádost ověřena a vyřízena (odeslán export, anonymizováno, odmítnuto a proč…)',
        },
      },
    },
  ],
}
