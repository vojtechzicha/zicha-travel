import type { CollectionConfig } from 'payload'
import { chataScopedAccess } from '../lib/access'

// Candidate cottages of a chata in the planning phase ("Plánujeme" —
// docs/PRD-planovani.md). Public read; an option can be limited to some of
// the chata's date options (a place already booked for one weekend).
export const TripAccommodationOptions: CollectionConfig = {
  slug: 'trip-accommodation-options',
  labels: {
    singular: { en: 'Accommodation option', cs: 'Chalupa k hlasování' },
    plural: { en: 'Accommodation options', cs: 'Chalupy k hlasování' },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'chata', 'locationNote'],
    group: { en: 'Planning', cs: 'Plánování' },
    description: {
      en: 'Candidate places to stay, voted on while the chata is in the planning phase.',
      cs: 'Chalupy, o kterých se hlasuje, dokud je chata ve fázi plánování.',
    },
  },
  access: {
    read: () => true,
    create: chataScopedAccess,
    update: chataScopedAccess,
    delete: chataScopedAccess,
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
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: {
          en: 'Name of the place (e.g. "Kamenná chalupa")',
          cs: 'Název chalupy (např. „Kamenná chalupa“)',
        },
      },
    },
    {
      name: 'locationNote',
      type: 'text',
      label: { en: 'Location', cs: 'Kde to je' },
      admin: {
        description: {
          en: 'Shown next to the name (e.g. "Bezdědice, pod Bezdězem")',
          cs: 'Zobrazí se vedle názvu (např. „Bezdědice, pod Bezdězem“)',
        },
      },
    },
    {
      name: 'url',
      type: 'text',
      label: { en: 'Listing link', cs: 'Odkaz na nabídku' },
      admin: {
        description: {
          en: 'Link to the listing (e-chalupy, Booking…) so people can browse the details',
          cs: 'Odkaz na nabídku (e-chalupy, Booking…), kde si lidé prohlédnou detaily',
        },
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: {
          en: 'One or two factual sentences (capacity, what stands out)',
          cs: 'Jedna dvě věcné věty (kapacita, co stojí za zmínku)',
        },
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: {
          en: 'Photo shown on the card (optional)',
          cs: 'Fotka na kartě (nepovinná)',
        },
      },
    },
    {
      name: 'dateOptions',
      type: 'relationship',
      relationTo: 'trip-date-options',
      hasMany: true,
      label: { en: 'Available dates', cs: 'Volné termíny' },
      admin: {
        description: {
          en: 'Date options this place is available for. Empty = available for all of them.',
          cs: 'Termíny, ve kterých je chalupa volná. Prázdné = volná ve všech.',
        },
      },
      filterOptions: ({ data }) => {
        if (data?.chata) {
          return {
            chata: {
              equals: data.chata,
            },
          }
        }
        return false
      },
    },
  ],
}
