import type { CollectionConfig, PayloadRequest } from 'payload'
import type { Chata } from '../payload-types'
import { afterReadHook } from './Chatas/hooks/afterRead'
import { canManageChata, ownChataAccess, superadminOnly } from '../lib/access'
import { pickValidationMessage } from '../i18n/adminTranslations'

export const Chatas: CollectionConfig = {
  slug: 'chatas',
  labels: {
    singular: { en: 'Chata', cs: 'Chata' },
    plural: { en: 'Chatas', cs: 'Chaty' },
  },
  endpoints: [
    {
      // Bulk prefill: clone selected participants from previous chatas into
      // this one — copies name, declension forms and banking info; skips
      // names already present in this chata (see PrefillParticipantsButton
      // on the edit form)
      path: '/:id/prefill-participants',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const id = req.routeParams?.id as string | undefined
        if (!id) {
          return Response.json({ error: 'Missing chata id' }, { status: 400 })
        }
        if (!canManageChata(req.user, id)) {
          return Response.json({ error: 'Forbidden' }, { status: 403 })
        }
        let participantIds: unknown
        try {
          const body = await req.json?.()
          participantIds = body?.participantIds
        } catch {
          participantIds = undefined
        }
        if (!Array.isArray(participantIds) || participantIds.length === 0) {
          return Response.json(
            { error: 'participantIds must be a non-empty array' },
            { status: 400 }
          )
        }
        const sources = await req.payload.find({
          collection: 'participants',
          where: { id: { in: participantIds } },
          limit: 1000,
          depth: 0,
        })
        const existing = await req.payload.find({
          collection: 'participants',
          where: { chata: { equals: id } },
          limit: 1000,
          depth: 0,
        })
        // The chata+name unique constraint is application-level only —
        // dedupe against existing participants AND within the selection
        const taken = new Set(existing.docs.map((p) => p.name.trim().toLowerCase()))
        let created = 0
        const skipped: string[] = []
        for (const source of sources.docs) {
          const key = source.name.trim().toLowerCase()
          if (taken.has(key)) {
            skipped.push(source.name)
            continue
          }
          taken.add(key)
          await req.payload.create({
            collection: 'participants',
            data: {
              name: source.name,
              akuzativ: source.akuzativ ?? undefined,
              vokativ: source.vokativ ?? undefined,
              accountNumber: source.accountNumber ?? undefined,
              iban: source.iban ?? undefined,
              chata: Number(id),
            },
          })
          created++
        }
        return Response.json({ created, skipped })
      },
    },
  ],
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'location', 'slug'],
    group: { en: 'Chata', cs: 'Chata' },
  },
  hooks: {
    afterRead: [afterReadHook],
  },
  access: {
    // Public read access for API consumption
    read: () => true,
    // Superadmins create/delete chatas; admins update the ones assigned
    // to them (Users.assignedChatas)
    create: superadminOnly,
    update: ownChataAccess,
    delete: superadminOnly,
  },
  fields: [
    {
      // Retention clock (controller decision 8): marking the trip settled is
      // an EXPLICIT admin action, never guessed from balances. 12 months
      // after this date the retention job clears the participants' bank
      // details and deletes the receipts (docs/legal/compliance-gaps.md,
      // blocker 5). Clearing the date stops the clock.
      name: 'settledAt',
      type: 'date',
      label: { en: 'Settled on', cs: 'Vyúčtováno dne' },
      admin: {
        position: 'sidebar',
        description: {
          en:
            'Set this when the trip is fully settled. 12 months later the retention job ' +
            'deletes participants’ bank details and receipts of this chata. Leave empty ' +
            'while money is still moving.',
          cs:
            'Nastavte, až je výlet úplně vyrovnaný. Za 12 měsíců retenční úloha smaže ' +
            'bankovní údaje účastníků a účtenky této chaty. Dokud se peníze hýbou, nechte prázdné.',
        },
        date: { displayFormat: 'yyyy-MM-dd' },
      },
    },
    // Basic Information
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: {
          en: 'Full name of the chata/trip (e.g., "Chaloupka pod Medem")',
          cs: 'Celý název chaty/výletu (např. „Chaloupka pod Medem“)',
        },
      },
    },
    {
      name: 'shortName',
      type: 'text',
      required: true,
      admin: {
        description: {
          en: 'Short name used in QR codes and messages (e.g., "Chaloupka")',
          cs: 'Krátký název používaný v QR kódech a zprávách (např. „Chaloupka“)',
        },
      },
    },
    {
      name: 'location',
      type: 'text',
      required: true,
      admin: {
        description: {
          en: 'Location description (e.g., "Beskydy")',
          cs: 'Popis lokality (např. „Beskydy“)',
        },
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: {
          en: 'URL-friendly identifier for this chata',
          cs: 'Identifikátor této chaty pro použití v URL',
        },
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
        description: {
          en: 'Domain names that should automatically load this chata',
          cs: 'Domény, které automaticky načtou tuto chatu',
        },
      },
      fields: [
        {
          name: 'domain',
          type: 'text',
          required: true,
          admin: {
            description: {
              en: 'Domain hostname (e.g., "trips.example.com")',
              cs: 'Doménové jméno (např. „trips.example.com“)',
            },
          },
        },
      ],
    },

    // Participants prefill (bulk clone from previous chatas)
    {
      name: 'prefillParticipants',
      type: 'ui',
      admin: {
        components: {
          Field:
            '@/collections/Chatas/components/PrefillParticipantsButton#PrefillParticipantsButton',
        },
        // Creating related participants needs a saved chata id
        condition: (data) => Boolean(data?.id),
      },
    },

    // Banker ("pokladník"). Their own participant record carries the account
    // everyone pays into — the chata keeps no copy of it
    {
      type: 'collapsible',
      label: { en: 'Banker', cs: 'Pokladník' },
      fields: [
        {
          name: 'banker',
          type: 'relationship',
          relationTo: 'participants',
          required: false,
          admin: {
            description: {
              en:
                'Person managing the money for this trip. On a new chata the list is ' +
                'empty — save the chata, add participants (e.g. via "Prefill ' +
                'participants" above), then pick the banker. Everyone pays into the ' +
                "banker's own account, so their banking info is edited on the " +
                'participant, not here.',
              cs:
                'Osoba spravující peníze tohoto výletu. U nové chaty je seznam ' +
                'prázdný – chatu uložte, přidejte účastníky (např. tlačítkem ' +
                '„Předvyplnit účastníky“ výše) a pak pokladníka vyberte. Všichni ' +
                'platí na vlastní účet pokladníka, jeho bankovní údaje se tedy ' +
                'upravují u účastníka, ne tady.',
            },
            components: {
              afterInput: [
                '@/collections/Chatas/components/BankerAccountSummary#BankerAccountSummary',
              ],
            },
          },
          filterOptions: ({ data }) => {
            // Only show participants from this chata; an unsaved chata has
            // no participants yet — show none instead of every chata's
            if (data?.id) {
              return {
                chata: {
                  equals: data.id,
                },
              }
            }
            return false
          },
        },
      ],
    },

    // Appearance
    {
      type: 'collapsible',
      label: { en: 'Appearance', cs: 'Vzhled' },
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'background',
          type: 'relationship',
          relationTo: 'backgrounds',
          admin: {
            description: {
              en: 'Background image (uses system default if not set)',
              cs: 'Obrázek na pozadí (bez nastavení se použije systémové výchozí)',
            },
          },
        },
        {
          name: 'icon',
          type: 'relationship',
          relationTo: 'icons',
          admin: {
            description: {
              en: 'Icon (uses cottage icon if not set)',
              cs: 'Ikona (bez nastavení se použije ikona chaty)',
            },
          },
        },
        {
          name: 'themeColor',
          type: 'text',
          defaultValue: '#d97706',
          admin: {
            description: {
              en: 'Theme color (hex)',
              cs: 'Barva motivu (hex)',
            },
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
      label: { en: 'Trip Information', cs: 'Informace o výletu' },
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'informationEnabled',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: {
          en: 'Enable the information/details view for this trip',
          cs: 'Zapnout informační sekci pro tento výlet',
        },
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
        {
          name: 'tripDatesTentative',
          type: 'checkbox',
          defaultValue: false,
          label: { en: 'Dates not fixed yet', cs: 'Termín zatím orientační' },
          admin: {
            description: {
              en: 'The dates above are only the window the trip will fall into. The frontend then shows the window and the planned number of nights instead of a fixed arrival and departure.',
              cs: 'Datumy výše vymezují jen období, do kterého výlet spadne. Web pak místo pevného příjezdu a odjezdu ukazuje toto období a plánovaný počet nocí.',
            },
            condition: (data) => data.informationEnabled === true,
          },
        },
        {
          name: 'tripPlannedNights',
          type: 'number',
          min: 1,
          label: { en: 'Planned nights', cs: 'Plánovaný počet nocí' },
          validate: (
            value: number | null | undefined,
            { req, siblingData }: { req: PayloadRequest; siblingData: unknown },
          ) => {
            const data = siblingData as Partial<Chata> | undefined
            if (data?.tripDatesTentative !== true) return true
            if (!value || value < 1) {
              return pickValidationMessage(
                req,
                'A tentative trip needs the planned number of nights',
                'Orientační termín potřebuje plánovaný počet nocí',
              )
            }
            if (data.tripDateFrom && data.tripDateTo) {
              const windowNights = Math.round(
                (new Date(data.tripDateTo).getTime() - new Date(data.tripDateFrom).getTime()) /
                  86_400_000,
              )
              if (windowNights > 0 && value > windowNights) {
                return pickValidationMessage(
                  req,
                  `The planned nights don't fit the window (at most ${windowNights})`,
                  `Plánované noci se do uvedeného období nevejdou (nejvýš ${windowNights})`,
                )
              }
            }
            return true
          },
          admin: {
            description: {
              en: 'How many nights the stay will take within the window.',
              cs: 'Na kolik nocí se v rámci uvedeného období pojede.',
            },
            condition: (data) =>
              data.informationEnabled === true && data.tripDatesTentative === true,
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'checkInTime',
              type: 'text',
              admin: {
                description: {
                  en: 'Check-in time (e.g., "od 15:00")',
                  cs: 'Čas příjezdu / check-in (např. „od 15:00“)',
                },
                condition: (data) => data.informationEnabled === true,
              },
            },
            {
              name: 'checkOutTime',
              type: 'text',
              admin: {
                description: {
                  en: 'Check-out time (e.g., "do 10:00")',
                  cs: 'Čas odjezdu / check-out (např. „do 10:00“)',
                },
                condition: (data) => data.informationEnabled === true,
              },
            },
          ],
        },
      ],
    },

    // Destination Information
    {
      type: 'collapsible',
      label: { en: 'Destination', cs: 'Cíl cesty' },
      admin: {
        initCollapsed: true,
        condition: (data) => data.informationEnabled === true,
      },
      fields: [
        {
          name: 'destinationName',
          type: 'text',
          admin: {
            description: {
              en: 'Name of the accommodation (e.g., "Chaloupka pod Medem")',
              cs: 'Název ubytování (např. „Chaloupka pod Medem“)',
            },
          },
        },
        {
          name: 'destinationLocation',
          type: 'text',
          admin: {
            description: {
              en: 'Specific location (e.g., "Horní Lomná")',
              cs: 'Konkrétní místo (např. „Horní Lomná“)',
            },
          },
        },
        {
          name: 'destinationDescription',
          type: 'textarea',
          admin: {
            description: {
              en: 'Description of the destination',
              cs: 'Popis cíle cesty',
            },
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'destinationLat',
              type: 'number',
              min: -90,
              max: 90,
              admin: {
                description: {
                  en: 'Latitude — enables the weather forecast and the navigation button',
                  cs: 'Zeměpisná šířka — zapne předpověď počasí a tlačítko Navigovat',
                },
              },
            },
            {
              name: 'destinationLng',
              type: 'number',
              min: -180,
              max: 180,
              admin: {
                description: {
                  en: 'Longitude',
                  cs: 'Zeměpisná délka',
                },
              },
            },
          ],
        },
        {
          name: 'destinationLinks',
          type: 'array',
          admin: {
            description: {
              en: 'Useful links about the destination',
              cs: 'Užitečné odkazy o cíli cesty',
            },
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
            description: {
              en: 'Photos of the destination',
              cs: 'Fotky cíle cesty',
            },
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
            description: {
              en: 'Basic information bullets',
              cs: 'Základní informace v bodech',
            },
          },
          fields: [
            {
              name: 'info',
              type: 'text',
              required: true,
            },
          ],
        },
        {
          name: 'amenities',
          type: 'array',
          labels: {
            singular: { en: 'Amenity', cs: 'Vybavení' },
            plural: { en: 'Amenities', cs: 'Vybavení chaty' },
          },
          admin: {
            description: {
              en: 'What the place has (or is missing) — shown as ✓/✗ chips ("Na chatě je")',
              cs: 'Co na chatě je (nebo chybí) — zobrazí se jako ✓/✗ štítky („Na chatě je“)',
            },
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: {
                description: {
                  en: 'e.g., "Sauna", "Wi-Fi", "Povlečení"',
                  cs: 'např. „Sauna“, „Wi-Fi“, „Povlečení“',
                },
              },
            },
            {
              name: 'available',
              type: 'checkbox',
              defaultValue: true,
              label: { en: 'Available on site', cs: 'Na chatě je' },
            },
          ],
        },
      ],
    },

    // Trip guide — packing list, day-by-day program, surroundings, contacts
    {
      type: 'collapsible',
      label: { en: 'Trip Guide', cs: 'Průvodce výletem' },
      admin: {
        initCollapsed: true,
        condition: (data) => data.informationEnabled === true,
      },
      fields: [
        {
          name: 'packingItems',
          type: 'array',
          labels: {
            singular: { en: 'Packing item', cs: 'Věc s sebou' },
            plural: { en: 'Packing list', cs: 'Co s sebou' },
          },
          admin: {
            description: {
              en: 'What to bring ("Co s sebou") — one bullet per item',
              cs: '„Co s sebou“ — jedna odrážka na položku',
            },
          },
          fields: [
            {
              name: 'item',
              type: 'text',
              required: true,
            },
          ],
        },
        {
          name: 'program',
          type: 'array',
          labels: {
            singular: { en: 'Program day', cs: 'Den programu' },
            plural: { en: 'Program', cs: 'Program' },
          },
          admin: {
            description: {
              en: 'Day-by-day plan; during the trip the current day is highlighted as "Today"',
              cs: 'Plán po dnech; během výletu se aktuální den zvýrazní jako „Dnes“',
            },
          },
          fields: [
            {
              name: 'date',
              type: 'date',
              required: true,
              admin: {
                date: {
                  pickerAppearance: 'dayOnly',
                },
              },
            },
            {
              name: 'description',
              type: 'text',
              required: true,
              admin: {
                description: {
                  en: 'e.g., "Túra na Praděd (celý den, 18 km)"',
                  cs: 'např. „Túra na Praděd (celý den, 18 km)“',
                },
              },
            },
          ],
        },
        {
          name: 'surroundings',
          type: 'array',
          labels: {
            singular: { en: 'Nearby place', cs: 'Místo v okolí' },
            plural: { en: 'Surroundings', cs: 'Okolí' },
          },
          admin: {
            description: {
              en: 'Shops, pubs and trip tips around the place ("Okolí")',
              cs: 'Obchody, hospody a tipy na výlety v okolí („Okolí“)',
            },
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: {
                description: {
                  en: 'e.g., "Potraviny Hruška — poslední obchod"',
                  cs: 'např. „Potraviny Hruška — poslední obchod“',
                },
              },
            },
            {
              name: 'note',
              type: 'text',
              admin: {
                description: {
                  en: 'Distance/opening hours (e.g., "400 m · po–so 7–17")',
                  cs: 'Vzdálenost/otvírací doba (např. „400 m · po–so 7–17“)',
                },
              },
            },
            {
              name: 'category',
              type: 'select',
              defaultValue: 'place',
              options: [
                { label: { en: 'Nearby place', cs: 'Místo v okolí' }, value: 'place' },
                { label: { en: 'Trip tip', cs: 'Výlet' }, value: 'trip' },
              ],
            },
          ],
        },
        {
          name: 'contactRules',
          type: 'array',
          labels: {
            singular: { en: 'Contact / rule', cs: 'Kontakt / pravidlo' },
            plural: { en: 'Contacts & rules', cs: 'Kontakt a pravidla' },
          },
          admin: {
            description: {
              en: 'Label + value rows ("Majitel — p. Novák · 605 112 233", "Noční klid — po 22:00")',
              cs: 'Řádky štítek + hodnota („Majitel — p. Novák · 605 112 233“, „Noční klid — po 22:00“)',
            },
          },
          fields: [
            {
              name: 'label',
              type: 'text',
              required: true,
            },
            {
              name: 'value',
              type: 'text',
              required: true,
            },
          ],
        },
        {
          name: 'privateInfo',
          type: 'array',
          labels: {
            singular: { en: 'Private detail', cs: 'Neveřejný údaj' },
            plural: { en: 'Keys & Wi-Fi (private)', cs: 'Klíče a Wi-Fi (neveřejné)' },
          },
          // Wi-Fi passwords and key-box codes must never reach the public
          // read API. Field-level access hides the whole array from
          // anonymous REST reads; the slug API additionally strips VALUES
          // (labels stay) so the page can tease what's behind the login.
          access: {
            read: ({ req }) => Boolean(req.user),
          },
          admin: {
            description: {
              en: 'Wi-Fi password, where the keys are, door codes. Signed-in participants see the values; anonymous visitors only see that they exist.',
              cs: 'Heslo Wi-Fi, kde jsou klíče, kódy od dveří. Přihlášení účastníci hodnoty uvidí, nepřihlášení jen to, že existují.',
            },
          },
          fields: [
            {
              name: 'label',
              type: 'text',
              required: true,
              admin: {
                description: {
                  en: 'e.g., "Wi-Fi". Labels are public, keep the secret in the value.',
                  cs: 'např. „Wi-Fi“. Štítek je veřejný, tajnou část pište do hodnoty.',
                },
              },
            },
            {
              name: 'value',
              type: 'text',
              required: true,
              admin: {
                description: {
                  en: 'e.g., "chata2024 (router in the hallway)"',
                  cs: 'např. „chata2024 (router je v předsíni)“',
                },
              },
            },
          ],
        },
        {
          name: 'sharedAlbumUrl',
          type: 'text',
          admin: {
            description: {
              en: 'Link to the shared photo album. Offered before and during the trip so people add photos as they go, and featured again in the recap.',
              cs: 'Odkaz na sdílené album fotek. Nabízí se před výletem i během něj, aby lidé fotky přidávali průběžně, a znovu v ohlédnutí po výletu.',
            },
          },
        },
      ],
    },

    // Transportation
    {
      type: 'collapsible',
      label: { en: 'Transportation', cs: 'Doprava' },
      admin: {
        initCollapsed: true,
        condition: (data) => data.informationEnabled === true,
      },
      fields: [
        {
          name: 'parking',
          type: 'text',
          admin: {
            description: {
              en: 'Parking information',
              cs: 'Informace o parkování',
            },
          },
        },
        {
          name: 'carRoutes',
          type: 'array',
          admin: {
            description: {
              en: 'Driving directions',
              cs: 'Trasy autem',
            },
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
                description: {
                  en: 'e.g., "3:30"',
                  cs: 'např. „3:30“',
                },
              },
            },
            {
              name: 'distance',
              type: 'text',
              required: true,
              admin: {
                description: {
                  en: 'e.g., "300 km"',
                  cs: 'např. „300 km“',
                },
              },
            },
            {
              name: 'route',
              type: 'textarea',
              required: true,
              admin: {
                description: {
                  en: 'Route description',
                  cs: 'Popis trasy',
                },
              },
            },
          ],
        },
        {
          name: 'publicTransportOptions',
          type: 'array',
          admin: {
            description: {
              en: 'Public transport options',
              cs: 'Spojení veřejnou dopravou',
            },
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              required: true,
              admin: {
                description: {
                  en: 'e.g., "Z Prahy"',
                  cs: 'např. „Z Prahy“',
                },
              },
            },
            {
              name: 'direction',
              type: 'select',
              defaultValue: 'tam',
              options: [
                { label: { en: 'To the chata', cs: 'Tam' }, value: 'tam' },
                { label: { en: 'Back home', cs: 'Zpět' }, value: 'zpet' },
              ],
              admin: {
                description: {
                  en: 'Day used by the "add to calendar" link: tam → arrival day, zpět → departure day',
                  cs: 'Den použitý odkazem „přidat do kalendáře“: tam → den příjezdu, zpět → den odjezdu',
                },
              },
            },
            {
              name: 'riders',
              type: 'array',
              labels: {
                singular: { en: 'Rider', cs: 'Cestující' },
                plural: { en: 'Who takes this connection', cs: 'Kdo jede tímhle spojem' },
              },
              admin: {
                description: {
                  en: 'Participants travelling on this connection. Shown next to the cars in Organization and as a note on the route in Information.',
                  cs: 'Účastníci, kteří jedou tímhle spojem. Ukážou se vedle aut v Organizaci a jako poznámka u spoje v Informacích.',
                },
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
                    return false
                  },
                },
              ],
            },
            {
              name: 'totalDuration',
              type: 'text',
              admin: {
                description: {
                  en: 'Total journey time',
                  cs: 'Celková doba cesty',
                },
              },
            },
            {
              name: 'notes',
              type: 'textarea',
              admin: {
                description: {
                  en: 'Additional notes',
                  cs: 'Další poznámky',
                },
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
                    { label: { en: 'Train', cs: 'Vlak' }, value: 'vlak' },
                    { label: { en: 'Bus', cs: 'Autobus' }, value: 'autobus' },
                  ],
                },
                {
                  name: 'number',
                  type: 'text',
                  required: true,
                  admin: {
                    description: {
                      en: 'Train/bus number',
                      cs: 'Číslo vlaku/autobusu',
                    },
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
                    description: {
                      en: 'Format: HH:MM (e.g., "08:45")',
                      cs: 'Formát: HH:MM (např. „08:45“)',
                    },
                  },
                },
                {
                  name: 'arrival',
                  type: 'text',
                  required: true,
                  admin: {
                    description: {
                      en: 'Format: HH:MM (e.g., "12:30")',
                      cs: 'Formát: HH:MM (např. „12:30“)',
                    },
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
      label: { en: 'Bedroom Organization', cs: 'Rozdělení pokojů' },
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'bedroomOrganizationEnabled',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: {
            en: 'Enable the bedroom organization view for this trip',
            cs: 'Zapnout sekci rozdělení pokojů pro tento výlet',
          },
          },
        },
        {
          name: 'advancedBedroomMode',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: {
            en: 'Enable per-night occupancy tracking (requires trip dates)',
            cs: 'Zapnout evidenci obsazenosti po jednotlivých nocích (vyžaduje termín výletu)',
          },
            condition: (data) =>
              data.bedroomOrganizationEnabled === true && data.informationEnabled === true,
          },
        },
        {
          name: 'rooms',
          type: 'array',
          admin: {
            description: {
              en: 'Rooms available at this accommodation',
              cs: 'Pokoje dostupné v tomto ubytování',
            },
            condition: (data) => data.bedroomOrganizationEnabled === true,
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: {
                description: {
                  en: 'Room name (e.g., "Pokoj u krbu", "Podkroví")',
                  cs: 'Název pokoje (např. „Pokoj u krbu“, „Podkroví“)',
                },
              },
            },
            {
              name: 'description',
              type: 'textarea',
              admin: {
                description: {
                  en: 'Optional description of the room',
                  cs: 'Volitelný popis pokoje',
                },
              },
            },
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description: {
                  en: 'Photo of the room',
                  cs: 'Fotka pokoje',
                },
              },
            },
            {
              name: 'maxSleepingSpaces',
              type: 'number',
              required: true,
              min: 1,
              defaultValue: 2,
              admin: {
                description: {
                  en: 'Maximum number of people who can sleep in this room',
                  cs: 'Maximální počet lidí, kteří mohou v pokoji spát',
                },
              },
            },
            {
              name: 'beds',
              type: 'array',
              admin: {
                description: {
                  en: 'Beds in this room',
                  cs: 'Postele v tomto pokoji',
                },
              },
              fields: [
                {
                  name: 'name',
                  type: 'text',
                  required: true,
                  admin: {
                    description: {
                      en: 'Bed name/type (e.g., "Manželská postel", "Palanda - horní")',
                      cs: 'Název/typ postele (např. „Manželská postel“, „Palanda – horní“)',
                    },
                  },
                },
                {
                  name: 'occupants',
                  type: 'array',
                  admin: {
                    description: {
                      en: 'Who sleeps in this bed',
                      cs: 'Kdo v této posteli spí',
                    },
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
                        return false
                      },
                    },
                    {
                      name: 'nights',
                      type: 'json',
                      admin: {
                        description: {
                          en: 'Which nights (1-indexed). Empty = all nights. E.g. [1, 2, 3]',
                          cs: 'Které noci (číslováno od 1). Prázdné = všechny noci. Např. [1, 2, 3]',
                        },
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
      label: { en: 'Shared Cars Organization', cs: 'Sdílená auta' },
      admin: {
        initCollapsed: true,
      },
      fields: [
        {
          name: 'sharedCarsEnabled',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: {
            en: 'Enable the shared cars organization view for this trip',
            cs: 'Zapnout sekci sdílených aut pro tento výlet',
          },
          },
        },
        {
          name: 'sharedCars',
          type: 'array',
          admin: {
            description: {
              en: 'Cars/rides for this trip',
              cs: 'Auta/jízdy na tomto výletu',
            },
            condition: (data) => data.sharedCarsEnabled === true,
          },
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              admin: {
                description: {
                  en: 'Car/trip name (e.g., "Auto tam - Petr", "Cesta zpět")',
                  cs: 'Název auta/jízdy (např. „Auto tam – Petr“, „Cesta zpět“)',
                },
              },
            },
            {
              name: 'description',
              type: 'textarea',
              admin: {
                description: {
                  en: 'Additional details about this ride (e.g., "Odjezd st 8:15 z Prahy-Chodova")',
                  cs: 'Další podrobnosti o této jízdě (např. „Odjezd st 8:15 z Prahy-Chodova“)',
                },
              },
            },
            {
              name: 'seats',
              type: 'number',
              min: 1,
              max: 9,
              admin: {
                description: {
                  en: 'Total seats including the driver — enables the "4/5" occupancy badge and free-seat hints',
                  cs: 'Počet míst včetně řidiče — zapne štítek obsazenosti („4/5“) a údaj o volných sedačkách',
                },
              },
            },
            {
              name: 'driver',
              type: 'relationship',
              relationTo: 'participants',
              required: true,
              admin: {
                description: {
                  en: 'Who is driving this car',
                  cs: 'Kdo toto auto řídí',
                },
              },
              filterOptions: ({ data }) => {
                if (data?.id) {
                  return {
                    chata: {
                      equals: data.id,
                    },
                  }
                }
                return false
              },
            },
            {
              name: 'frontPassenger',
              type: 'relationship',
              relationTo: 'participants',
              admin: {
                description: {
                  en: 'Front-seat passenger',
                  cs: 'Spolujezdec vpředu',
                },
              },
              filterOptions: ({ data }) => {
                if (data?.id) {
                  return {
                    chata: {
                      equals: data.id,
                    },
                  }
                }
                return false
              },
            },
            {
              name: 'passengers',
              type: 'array',
              admin: {
                description: {
                  en: 'Other passengers',
                  cs: 'Další cestující',
                },
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
                    return false
                  },
                },
              ],
            },
            {
              name: 'equipment',
              type: 'array',
              admin: {
                description: {
                  en: 'Equipment/cargo in the car',
                  cs: 'Vybavení/náklad v autě',
                },
              },
              fields: [
                {
                  name: 'name',
                  type: 'text',
                  required: true,
                  admin: {
                    description: {
                      en: 'Equipment name (e.g., "Pivo", "Kufry")',
                      cs: 'Název vybavení (např. „Pivo“, „Kufry“)',
                    },
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
