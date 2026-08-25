import { APIError, type CollectionConfig } from 'payload'
import { canManageChata, chataScopedAccess, refId } from '../lib/access'

/**
 * Czech admin label from the window dates: "16.–18. 10. 2026", or
 * "30. 10.–1. 11. 2026" across a month boundary. Only a default — admins
 * may overwrite the label field.
 */
export function dateOptionLabel(dateFrom: string, dateTo: string): string {
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  const sameMonth =
    from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth()
  const tail = `${to.getUTCDate()}. ${to.getUTCMonth() + 1}. ${to.getUTCFullYear()}`
  if (sameMonth) return `${from.getUTCDate()}.–${tail}`
  return `${from.getUTCDate()}. ${from.getUTCMonth() + 1}.–${tail}`
}

// Candidate date windows of a chata in the planning phase ("Plánujeme" —
// docs/PRD-planovani.md). Public read like the rest of the chata data; the
// planning page shows them to anonymous visitors.
export const TripDateOptions: CollectionConfig = {
  slug: 'trip-date-options',
  labels: {
    singular: { en: 'Date option', cs: 'Termín k hlasování' },
    plural: { en: 'Date options', cs: 'Termíny k hlasování' },
  },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'chata', 'dateFrom', 'dateTo'],
    group: { en: 'Planning', cs: 'Plánování' },
    description: {
      en: 'Candidate date windows people vote on while the chata is in the planning phase.',
      cs: 'Termíny, o kterých se hlasuje, dokud je chata ve fázi plánování.',
    },
  },
  access: {
    read: () => true,
    create: chataScopedAccess,
    update: chataScopedAccess,
    delete: chataScopedAccess,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, req }) => {
        // The access Where scopes only STORED docs — the incoming chata
        // must be manageable too, or a scoped admin could create (or move)
        // an option into another chata
        const chataRef = data?.chata ?? originalDoc?.chata
        if (req.user && chataRef != null && !canManageChata(req.user, refId(chataRef))) {
          throw new APIError('Forbidden', 403)
        }
        // Auto-label from the dates so the list view and the vote rows are
        // readable without opening each row
        if (data && !data.label?.trim() && data.dateFrom && data.dateTo) {
          data.label = dateOptionLabel(data.dateFrom, data.dateTo)
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'chata',
      type: 'relationship',
      relationTo: 'chatas',
      required: true,
      index: true,
    },
    {
      name: 'label',
      type: 'text',
      admin: {
        description: {
          en: 'Shown everywhere this window is named. Left empty, it is filled from the dates ("16.–18. 10. 2026").',
          cs: 'Zobrazuje se všude, kde se termín jmenuje. Prázdné se vyplní z datumů („16.–18. 10. 2026“).',
        },
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'dateFrom',
          type: 'date',
          required: true,
          label: { en: 'From', cs: 'Od' },
          admin: {
            date: { pickerAppearance: 'dayOnly' },
          },
        },
        {
          name: 'dateTo',
          type: 'date',
          required: true,
          label: { en: 'To', cs: 'Do' },
          admin: {
            date: { pickerAppearance: 'dayOnly' },
          },
        },
      ],
    },
    {
      name: 'note',
      type: 'text',
      admin: {
        description: {
          en: 'Optional note shown under the window (e.g. "víkend pá–ne")',
          cs: 'Nepovinná poznámka pod termínem (např. „víkend pá–ne“)',
        },
      },
    },
  ],
}
