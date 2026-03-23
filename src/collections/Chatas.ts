import type { CollectionConfig } from 'payload'
import { afterReadHook } from './Chatas/hooks/afterRead'

export const Chatas: CollectionConfig = {
  slug: 'chatas',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'location', 'slug'],
  },
  hooks: {
    afterRead: [afterReadHook],
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Admin and per-chata permissions for write operations
    create: ({ req: { user } }) => {
      if (!user) return false
      return user.role === 'admin'
    },
    update: ({ req: { user } }) => {
      if (!user) return false
      if (user.role === 'admin') return true
      // Users can only update chatas they're assigned to
      return {
        'assignedUsers.user': {
          equals: user.id,
        },
      }
    },
    delete: ({ req: { user } }) => {
      if (!user) return false
      return user.role === 'admin'
    },
  },
  fields: [
    // Basic Information
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'Full name of the chata/trip (e.g., "Chaloupka pod Medem")',
      },
    },
    {
      name: 'shortName',
      type: 'text',
      required: true,
      admin: {
        description: 'Short name used in QR codes and messages (e.g., "Chaloupka")',
      },
    },
    {
      name: 'location',
      type: 'text',
      required: true,
      admin: {
        description: 'Location description (e.g., "Beskydy")',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'URL-friendly identifier for this chata',
      },
      hooks: {
        beforeValidate: [
          ({ data, operation }) => {
            if (operation === 'create' && data?.name && !data?.slug) {
              return data.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
            }
            return data?.slug
          },
        ],
      },
    },
    {
      name: 'domains',
      type: 'array',
      admin: {
        description: 'Domain names that should automatically load this chata',
      },
      fields: [
        {
          name: 'domain',
          type: 'text',
          required: true,
          admin: {
            description: 'Domain hostname (e.g., "trips.example.com")',
          },
        },
      ],
    },

    // Banking Configuration
    {
      type: 'collapsible',
      label: 'Banking Configuration',
      fields: [
        {
          name: 'banker',
          type: 'relationship',
          relationTo: 'participants',
          required: false,
          admin: {
            description: 'Person managing the money for this trip',
          },
          filterOptions: ({ data }) => {
            // Only show participants from this chata
            if (data?.id) {
              return {
                chata: {
                  equals: data.id,
                },
              }
            }
            return true
          },
        },
        {
          name: 'bankerAccountNumber',
          type: 'text',
          required: true,
          admin: {
            description: 'Banker\'s account number in Czech format (e.g., "123456/0100")',
          },
        },
        {
          name: 'bankerIban',
          type: 'text',
          required: true,
          admin: {
            description: 'Banker\'s IBAN for QR code generation',
          },
        },
      ],
    },

    // Per-Chata User Permissions
    {
      name: 'assignedUsers',
      type: 'array',
      admin: {
        description: 'Users who can manage this chata',
      },
      fields: [
        {
          name: 'user',
          type: 'relationship',
          relationTo: 'users',
          required: true,
        },
      ],
    },

    // Appearance
    {
      type: 'collapsible',
      label: 'Appearance',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'background',
          type: 'relationship',
          relationTo: 'backgrounds',
          admin: {
            description: 'Background image (uses system default if not set)',
          },
        },
        {
          name: 'icon',
          type: 'relationship',
          relationTo: 'icons',
          admin: {
            description: 'Icon (uses cottage icon if not set)',
          },
        },
        {
          name: 'themeColor',
          type: 'text',
          defaultValue: '#d97706',
          admin: {
            description: 'Theme color (hex)',
            components: {
              Field: '@/components/ColorPickerField#ColorPickerField',
            },
          },
        },
      ],
    },

    // Trip Information
    {
      type: 'collapsible',
      label: 'Trip Information',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'informationEnabled',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Enable the information/details view for this trip',
          },
        },
        {
          name: 'tripDateFrom',
          type: 'date',
          admin: {
            date: {
              pickerAppearance: 'dayOnly',
            },
            condition: (data) => data.informationEnabled === true,
          },
        },
        {
          name: 'tripDateTo',
          type: 'date',
          admin: {
            date: {
              pickerAppearance: 'dayOnly',
            },
            condition: (data) => data.informationEnabled === true,
          },
        },
      ],
    },

    // Destination Information
    {
      type: 'collapsible',
      label: 'Destination',
      admin: {
        initCollapsed: true,
        condition: (data) => data.informationEnabled === true,
      },
      fields: [
        {
          name: 'destinationName',
          type: 'text',
          admin: {
            description: 'Name of the accommodation (e.g., "Chaloupka pod Medem")',
          },
        },
        {
          name: 'destinationLocation',
          type: 'text',
          admin: {
            description: 'Specific location (e.g., "Horní Lomná")',
          },
        },
        {
          name: 'destinationDescription',
          type: 'textarea',
          admin: {
            description: 'Description of the destination',
          },
        },
        {
          name: 'destinationLinks',
          type: 'array',
          admin: {
            description: 'Useful links about the destination',
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
            },
            {
              name: 'url',
              type: 'text',
              required: true,
            },
          ],
        },
        {
          name: 'photos',
          type: 'array',
          admin: {
            description: 'Photos of the destination',
          },
          fields: [
            {
              name: 'photo',
              type: 'upload',
              relationTo: 'media',
              required: true,
            },
          ],
        },
        {
          name: 'basicInfo',
          type: 'array',
          admin: {
            description: 'Basic information bullets',
          },
          fields: [
            {
              name: 'info',
              type: 'text',
              required: true,
            },
          ],
        },
      ],
    },

    // Transportation
    {
      type: 'collapsible',
      label: 'Transportation',
      admin: {
        initCollapsed: true,
        condition: (data) => data.informationEnabled === true,
      },
      fields: [
        {
          name: 'parking',
          type: 'text',
          admin: {
            description: 'Parking information',
          },
        },
        {
          name: 'carRoutes',
          type: 'array',
          admin: {
            description: 'Driving directions',
          },
          fields: [
            {
              name: 'from',
              type: 'text',
              required: true,
            },
            {
              name: 'duration',
              type: 'text',
              required: true,
              admin: {
                description: 'e.g., "3:30"',
              },
            },
            {
              name: 'distance',
              type: 'text',
              required: true,
              admin: {
                description: 'e.g., "300 km"',
              },
            },
            {
              name: 'route',
              type: 'textarea',
              required: true,
              admin: {
                description: 'Route description',
              },
            },
          ],
        },
        {
          name: 'publicTransportOptions',
          type: 'array',
          admin: {
            description: 'Public transport options',
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
              admin: {
                description: 'e.g., "Z Prahy"',
              },
            },
            {
              name: 'totalDuration',
              type: 'text',
              admin: {
                description: 'Total journey time',
              },
            },
            {
              name: 'notes',
              type: 'textarea',
              admin: {
                description: 'Additional notes',
              },
            },
            {
              name: 'connections',
              type: 'array',
              fields: [
                {
                  name: 'type',
                  type: 'select',
                  required: true,
                  options: [
                    { label: 'Vlak (Train)', value: 'vlak' },
                    { label: 'Autobus (Bus)', value: 'autobus' },
                  ],
                },
                {
                  name: 'number',
                  type: 'text',
                  required: true,
                  admin: {
                    description: 'Train/bus number',
                  },
                },
                {
                  name: 'from',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'to',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'departure',
                  type: 'text',
                  required: true,
                  admin: {
                    description: 'Format: HH:MM (e.g., "08:45")',
                  },
                },
                {
                  name: 'arrival',
                  type: 'text',
                  required: true,
                  admin: {
                    description: 'Format: HH:MM (e.g., "12:30")',
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    // Bedroom Organization
    {
      type: 'collapsible',
      label: 'Bedroom Organization',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'bedroomOrganizationEnabled',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Enable the bedroom organization view for this trip',
          },
        },
        {
          name: 'advancedBedroomMode',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Enable per-night occupancy tracking (requires trip dates)',
            condition: (data) =>
              data.bedroomOrganizationEnabled === true && data.informationEnabled === true,
          },
        },
        {
          name: 'rooms',
          type: 'array',
          admin: {
            description: 'Rooms available at this accommodation',
            condition: (data) => data.bedroomOrganizationEnabled === true,
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: {
                description: 'Room name (e.g., "Pokoj u krbu", "Podkroví")',
              },
            },
            {
              name: 'description',
              type: 'textarea',
              admin: {
                description: 'Optional description of the room',
              },
            },
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description: 'Photo of the room',
              },
            },
            {
              name: 'maxSleepingSpaces',
              type: 'number',
              required: true,
              min: 1,
              defaultValue: 2,
              admin: {
                description: 'Maximum number of people who can sleep in this room',
              },
            },
            {
              name: 'beds',
              type: 'array',
              admin: {
                description: 'Beds in this room',
              },
              fields: [
                {
                  name: 'name',
                  type: 'text',
                  required: true,
                  admin: {
                    description: 'Bed name/type (e.g., "Manželská postel", "Palanda - horní")',
                  },
                },
                {
                  name: 'occupants',
                  type: 'array',
                  admin: {
                    description: 'Who sleeps in this bed',
                  },
                  fields: [
                    {
                      name: 'participant',
                      type: 'relationship',
                      relationTo: 'participants',
                      required: true,
                      filterOptions: ({ data }) => {
                        if (data?.id) {
                          return {
                            chata: {
                              equals: data.id,
                            },
                          }
                        }
                        return true
                      },
                    },
                    {
                      name: 'nights',
                      type: 'json',
                      admin: {
                        description: 'Which nights (1-indexed). Empty = all nights. E.g. [1, 2, 3]',
                        condition: (data) => data.advancedBedroomMode === true,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    // Shared Cars Organization
    {
      type: 'collapsible',
      label: 'Shared Cars Organization',
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'sharedCarsEnabled',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Enable the shared cars organization view for this trip',
          },
        },
        {
          name: 'sharedCars',
          type: 'array',
          admin: {
            description: 'Cars/rides for this trip',
            condition: (data) => data.sharedCarsEnabled === true,
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: {
                description: 'Car/trip name (e.g., "Auto tam - Petr", "Cesta zpět")',
              },
            },
            {
              name: 'description',
              type: 'textarea',
              admin: {
                description: 'Additional details about this ride',
              },
            },
            {
              name: 'driver',
              type: 'relationship',
              relationTo: 'participants',
              required: true,
              admin: {
                description: 'Who is driving this car',
              },
              filterOptions: ({ data }) => {
                if (data?.id) {
                  return {
                    chata: {
                      equals: data.id,
                    },
                  }
                }
                return true
              },
            },
            {
              name: 'frontPassenger',
              type: 'relationship',
              relationTo: 'participants',
              admin: {
                description: 'Spolujezdec v předu',
              },
              filterOptions: ({ data }) => {
                if (data?.id) {
                  return {
                    chata: {
                      equals: data.id,
                    },
                  }
                }
                return true
              },
            },
            {
              name: 'passengers',
              type: 'array',
              admin: {
                description: 'Další cestující',
              },
              fields: [
                {
                  name: 'participant',
                  type: 'relationship',
                  relationTo: 'participants',
                  required: true,
                  filterOptions: ({ data }) => {
                    if (data?.id) {
                      return {
                        chata: {
                          equals: data.id,
                        },
                      }
                    }
                    return true
                  },
                },
              ],
            },
            {
              name: 'equipment',
              type: 'array',
              admin: {
                description: 'Vybavení/náklad v autě',
              },
              fields: [
                {
                  name: 'name',
                  type: 'text',
                  required: true,
                  admin: {
                    description: 'Název vybavení (např. "Pivo", "Kufry")',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
