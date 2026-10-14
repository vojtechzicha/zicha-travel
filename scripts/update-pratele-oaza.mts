#!/usr/bin/env tsx
// Turns the /pratele chata from the planning poll into the booked trip at
// Chata Oáza (13.–15. 11. 2026, optional extension to 17. 11.).
// Facts come from the e-chalupy listing o10009. Participants, banker, votes
// and the album are left untouched; existing participants are only placed
// into beds (rooms below).
//
//   cd <repo> && pnpm exec tsx scripts/update-pratele-oaza.mts            # local DB from .env
//   cd <repo> && pnpm exec tsx scripts/update-pratele-oaza.mts --prod     # DATABASE_URI must point at prod
//
// Refuses a non-local DATABASE_URI without --prod.

import { config as loadEnv } from 'dotenv'
import path from 'node:path'

loadEnv({ path: '.env.local' })
loadEnv()

const REPO = process.cwd()
const allowProd = process.argv.includes('--prod')
const dbHost = new URL(process.env.DATABASE_URI ?? '').hostname
if (!['localhost', '127.0.0.1'].includes(dbHost) && !allowProd) {
  console.error(`Refusing to write to ${dbHost} without --prod`)
  process.exit(1)
}

const SLUG = 'pratele'
const day = (iso: string) => `${iso}T12:00:00.000Z` // dayOnly picker stores noon UTC

// Participants of /pratele (chata 10)
const P = {
  vojta: 46,
  martin: 48,
  daniela: 49,
  denisa: 50,
  david: 53,
  michal: 54,
  leos: 58,
  chose: 60,
}

// Photos from the e-chalupy listing, stored as `media` rows (file name is the
// idempotency key, so re-runs reuse them). Room photos follow the listing's
// own numbering ("Pokoj č. 1" = Ložnice 1).
const LISTING = 'https://www.e-chalupy.cz/foto/'
const PHOTOS = {
  room1: {
    file: 'oaza-loznice-1.jpg',
    src: 'pokoj-c-1-c1cc-2d26-1211829.jpg',
    alt: 'Ložnice 1 s velkou manželskou postelí',
  },
  room2: { file: 'oaza-loznice-2.jpg', src: 'pokoj-c-2-aafb-2d2a-1211831.jpg', alt: 'Ložnice 2' },
  room3: { file: 'oaza-loznice-3.jpg', src: 'pokoj-c-3-6acb-2d2d-1211833.jpg', alt: 'Ložnice 3' },
  apartment: {
    file: 'oaza-apartman.jpg',
    src: 'novy-plne-zarizeny-apartman-pro-dve-osoby-c865-2d3a-1211839.jpg',
    alt: 'Apartmán pro dva nad wellness domkem',
  },
  living: {
    file: 'oaza-obyvak.jpg',
    src: 'prostorna-jidelna-s-kuchyni-a-obyvacim-pokojem-4710-2d1f-1211825.jpg',
    alt: 'Obývák s jídelnou a kuchyní',
  },
  outside: {
    file: 'oaza-chata.jpg',
    src: 'chata-na-polosamote-u-lesa-8aa4-2cfd-1211804.jpg',
    alt: 'Chata na samotě u lesa',
  },
  tub: {
    file: 'oaza-sud.jpg',
    src: 'koupaci-sud-s-vyhledem-f464-2d1c-1211821.jpg',
    alt: 'Vířivý sud s výhledem',
  },
  terrace: {
    file: 'oaza-terasa.jpg',
    src: 'zadni-kryta-terasa-pro-velkou-skupinu-osob-f0d4-2d12-1211813.jpg',
    alt: 'Krytá terasa pro celou partu',
  },
  wellness: {
    file: 'oaza-wellness.jpg',
    src: 'wellness-se-sprchou-virivkou-a-finskou-saunou-2a5e-2d49-1211848.jpg',
    alt: 'Wellness domek s vířivkou a finskou saunou',
  },
  sauna: { file: 'oaza-sauna.jpg', src: 'finska-sauna-c9d6-2d42-1211844.jpg', alt: 'Finská sauna' },
  infrasauna: {
    file: 'oaza-infrasauna.jpg',
    src: 'infrasauna-ve-sklepe-chaty-4e0e-2d32-1211835.jpg',
    alt: 'Infrasauna ve sklepě chaty',
  },
  fire: {
    file: 'oaza-ohniste.jpg',
    src: 'ohniste-pro-romanticke-vecery-97cf-2d0b-1211810.jpg',
    alt: 'Ohniště',
  },
  view: {
    file: 'oaza-rozhledna.jpg',
    src: 'pohled-z-nedaleke-rozhledny-na-udoli-kolem-chaty-a906-2d4a-1211849.jpg',
    alt: 'Výhled z rozhledny na údolí kolem chaty',
  },
  landscape: {
    file: 'oaza-krajina.jpg',
    src: 'okolni-krajina-6f50-2d1c-1211822.jpg',
    alt: 'Krajina kolem chaty',
  },
} as const
type MediaIds = Record<keyof typeof PHOTOS, number>

// Minimal Lexical JSON builders for the custom tab content
const text = (value: string, format = 0) => ({
  type: 'text',
  text: value,
  format,
  detail: 0,
  mode: 'normal',
  style: '',
  version: 1,
})
const block = { format: '', indent: 0, version: 1, direction: 'ltr' as const }
const p = (...children: object[]) => ({
  type: 'paragraph',
  ...block,
  textFormat: 0,
  textStyle: '',
  children,
})
const h3 = (value: string) => ({ type: 'heading', tag: 'h3', ...block, children: [text(value)] })
const listOf =
  (listType: 'bullet' | 'number') =>
  (...items: object[][]) => ({
    type: 'list',
    listType,
    tag: listType === 'bullet' ? 'ul' : 'ol',
    start: 1,
    ...block,
    children: items.map((children, i) => ({ type: 'listitem', value: i + 1, ...block, children })),
  })
const ul = listOf('bullet')
const ol = listOf('number')
const link = (url: string, label: string) => ({
  type: 'link',
  ...block,
  version: 3,
  fields: { linkType: 'custom', newTab: true, url },
  children: [text(label)],
})
const image = (id: number) => ({
  type: 'upload',
  version: 3,
  format: '',
  fields: null,
  relationTo: 'media',
  value: id,
})
const richText = (...children: object[]) => ({ root: { type: 'root', ...block, children } })

const BOLD = 1

// Saturday loop planned on Mapy.com: chata → Stará hospoda Nespeky → Malešín →
// Hostinec U Ondřichů → chata, 13.1 km, ↑189 m
const ROUTE_URL = 'https://mapy.com/s/gukesomobo'

// Finance: what the trip costs so far, all planned (not paid yet) and paid
// by Vojta, who booked the cottage and settles with the owner. Prices from
// the e-chalupy listing (off-season). Upserted by title, so re-runs update
// rather than duplicate; an expense somebody marked paid keeps its state.
// Public transport between Praha Háje and the cottage, from IDOS for the
// exact dates (stop Řehenice, Babice, 940 m from the cottage). Four rows so
// people can sign up per connection; `mustRide` lists who has to be on a
// row (only Vojta, back on Tuesday), and the merge in main() keeps everybody
// assigned later. The schema knows only trains
// and buses, so the metro legs are typed as buses ("Metro C") for now.
const WALK = 'Ze zastávky Řehenice, Babice je to na chatu 940 m pěšky, asi 15 minut.'
const BACK_NOTE =
  'Z chaty vyraz kolem 10:15, na zastávku Řehenice, Babice je to 940 m. ' +
  'Autobus 339 jede na Budějovickou, odtud metro C na Háje.'
const TRANSPORT = [
  {
    title: 'Tam v pátek ve 14:35 z Hájí',
    travelDate: day('2026-11-13'),
    direction: 'tam',
    totalDuration: '1 h včetně chůze',
    notes: `Na chatě budeš kolem 15:50, check-in je od 16:00. ${WALK}`,
    connections: [
      {
        type: 'autobus',
        number: '154',
        from: 'Háje',
        to: 'U Tří svatých',
        departure: '14:35',
        arrival: '14:55',
      },
      {
        type: 'autobus',
        number: '337',
        from: 'U Tří svatých',
        to: 'Řehenice, Babice',
        departure: '14:59',
        arrival: '15:34',
      },
    ],
  },
  {
    title: 'Tam v pátek v 17:08 z Hájí',
    travelDate: day('2026-11-13'),
    direction: 'tam',
    totalDuration: '1 h 15 min včetně chůze',
    notes: `Na Budějovické máš na přestup 3 minuty. ${WALK} Půjdeš za tmy, vezmi si čelovku.`,
    connections: [
      {
        type: 'autobus',
        number: 'Metro C',
        from: 'Háje',
        to: 'Budějovická',
        departure: '17:08',
        arrival: '17:17',
      },
      {
        type: 'autobus',
        number: '339',
        from: 'Budějovická',
        to: 'Řehenice, Babice',
        departure: '17:20',
        arrival: '18:07',
      },
    ],
  },
  {
    title: 'Zpět v neděli v 10:35',
    travelDate: day('2026-11-15'),
    direction: 'zpet',
    totalDuration: '1 h 25 min včetně chůze',
    notes: BACK_NOTE,
    connections: [
      {
        type: 'autobus',
        number: '339',
        from: 'Řehenice, Babice',
        to: 'Budějovická',
        departure: '10:35',
        arrival: '11:33',
      },
      {
        type: 'autobus',
        number: 'Metro C',
        from: 'Budějovická',
        to: 'Háje',
        departure: '11:36',
        arrival: '11:45',
      },
    ],
  },
  {
    title: 'Zpět v úterý v 10:35',
    travelDate: day('2026-11-17'),
    direction: 'zpet',
    totalDuration: '1 h 25 min včetně chůze',
    notes: `${BACK_NOTE} V úterý je svátek a jede se jako v neděli. Den předem si spoj radši ověř.`,
    mustRide: [P.vojta],
    connections: [
      {
        type: 'autobus',
        number: '339',
        from: 'Řehenice, Babice',
        to: 'Budějovická',
        departure: '10:35',
        arrival: '11:33',
      },
      {
        type: 'autobus',
        number: 'Metro C',
        from: 'Budějovická',
        to: 'Háje',
        departure: '11:36',
        arrival: '11:45',
      },
    ],
  },
]

// The owner's offer (Radim Prokop): weekend 14 000 + 2 × 4 500 for the
// extension = 23 000, rounded down to 22 000; the 1 000 discount sits on the
// extension (8 000), the weekend is the standard price. 50 % deposit within
// 7 days of booking, the rest a week before arrival. Plus energy and the
// municipal fee of 15 Kč per adult and night.
const EXPENSES = [
  {
    title: 'Chata Oáza: záloha za víkend',
    amount: 7000,
    split: 'all',
    date: '2026-10-20T10:00:00.000Z',
    note:
      'Polovina ceny za víkend (14 000 Kč za celou chatu, pátek až neděle). ' +
      'Záloha se platí do 7 dnů od rezervace.',
  },
  {
    title: 'Chata Oáza: doplatek za víkend',
    amount: 7000,
    split: 'all',
    date: '2026-11-06T10:00:00.000Z',
    note: 'Druhá polovina ceny za víkend, splatná týden před příjezdem.',
  },
  {
    title: 'Chata Oáza: záloha za prodloužení',
    amount: 4000,
    split: 'extension',
    date: '2026-10-20T10:00:00.000Z',
    note:
      'Polovina ceny za dvě noci navíc, z neděle 15. 11. do úterý 17. 11. Majitel dal za ' +
      'celý pobyt 22 000 Kč místo 23 000 Kč, sleva je započtená tady. Dělí se mezi ty, ' +
      'kdo zůstanou; kdo se přidá, připíšeme ho do rozdělení.',
  },
  {
    title: 'Chata Oáza: doplatek za prodloužení',
    amount: 4000,
    split: 'extension',
    date: '2026-11-06T10:00:00.000Z',
    note: 'Druhá polovina ceny za prodloužení, splatná týden před příjezdem.',
  },
  {
    title: 'Apartmán na víkend',
    amount: 2000,
    split: 'apartment',
    date: '2026-11-06T10:00:00.000Z',
    note:
      'Apartmán pro dva nad wellness domkem na pátek a sobotu, 1 000 Kč za noc podle ceníku ' +
      'majitele. Platí ho ty, kdo v něm o víkendu spí.',
  },
  {
    title: 'Apartmán na prodloužení',
    amount: 2000,
    split: 'extension',
    date: '2026-11-06T10:00:00.000Z',
    note: 'Apartmán zůstává náš i na neděli a pondělí, 1 000 Kč za noc. Dělí se mezi ty, kdo zůstanou do úterý.',
  },
  {
    title: 'Poplatek obci za víkend',
    amount: 270,
    split: 'all',
    date: '2026-11-13T16:00:00.000Z',
    note: '15 Kč za dospělého a noc: 9 lidí, 2 noci.',
  },
  {
    title: 'Poplatek obci za prodloužení',
    amount: 30,
    split: 'extension',
    date: '2026-11-17T10:00:00.000Z',
    note: '15 Kč za dospělého a noc za neděli a pondělí. Upravíme podle toho, kdo zůstane.',
  },
  {
    title: 'Kauce',
    amount: 5000,
    split: 'all',
    date: '2026-11-13T16:00:00.000Z',
    note: 'Vratná kauce, skládá se při předání klíčů.',
  },
  {
    title: 'Vrácení kauce',
    amount: -5000,
    split: 'all',
    date: '2026-11-17T10:00:00.000Z',
    note: 'Majitel kauci vrátí po kontrole chaty při odjezdu.',
  },
  {
    title: 'Energie za wellness (odhad)',
    amount: 700,
    split: 'all',
    date: '2026-11-17T10:00:00.000Z',
    note:
      'Elektřinu za saunu a vířivku ve wellness domku platíme podle spotřeby, 7 Kč/kWh. ' +
      'Odhad na víkend: asi 100 kWh (sauna dva večery, vířivka udržovaná v teple). ' +
      'Po odečtu při odjezdu částku opravíme.',
  },
] as const

// expenses an earlier version created, replaced by the deposit/balance pairs
const RETIRED_EXPENSES = ['Chata Oáza: víkend', 'Chata Oáza: prodloužení do úterý']

const buildData = (m: MediaIds) => ({
  location: 'Vavřetice, Benešovsko',
  banker: P.vojta,
  shoppingListEnabled: true,
  beerListEnabled: true,
  // cars come from the participants themselves ("Nabídnout auto"); none at the start
  sharedCarsEnabled: true,

  planningEnabled: false,

  informationEnabled: true,
  tripDateFrom: day('2026-11-13'),
  tripDateTo: day('2026-11-15'),
  tripDatesTentative: false,
  tripPlannedNights: null,
  checkInTime: 'od 16:00',
  checkOutTime: 'do 10:00',

  destinationName: 'Chata Oáza',
  destinationLocation: 'Vavřetice ev. č. 29, 251 67 Řehenice',
  destinationDescription:
    'Chata stojí na samotě přímo u lesa. Celý oplocený areál je jen pro nás, cizí hosté tu nebudou. ' +
    'V chatě jsou tři ložnice, obývák s krbovými kamny a infrasauna, venku terasa s plynovým grilem, ' +
    'ohniště a vířivý sud, který jede celý rok. V samostatném wellness domku je finská sauna a další vířivka. ' +
    'Na zahradě se dá hrát pétanque, KUBB a badminton, uvnitř jsou deskovky a Xbox.',
  destinationLat: 49.8879594,
  destinationLng: 14.6283697,
  destinationLinks: [
    {
      title: 'Chata Oáza na e-chalupy.cz',
      url: 'https://www.e-chalupy.cz/ubytovani-vavretice-chata-oaza-pronajem-o10009',
    },
    { title: 'Web chaty', url: 'https://www.chataoaza.cz' },
  ],
  photos: [
    { photo: 76 },
    ...(
      [
        'outside',
        'tub',
        'terrace',
        'living',
        'wellness',
        'apartment',
        'sauna',
        'infrasauna',
        'fire',
        'view',
        'landscape',
      ] as const
    ).map((key) => ({ photo: m[key] })),
  ],

  basicInfo: [
    {
      info:
        'Spíme v chatě se třemi ložnicemi a obývákem. Místa je pro 11 lidí (8 postelí a 3 přistýlky). ' +
        'K tomu máme apartmán pro dva nad wellness domkem.',
    },
    {
      info: 'Příjezd v pátek od 16:00, odjezd v neděli do 10:00. Pozdější odjezd jde domluvit s majitelem.',
    },
    {
      info: 'Kdo může, zůstane až do úterý 17. 11. (státní svátek). Prodloužení je s majitelem potvrzené.',
    },
    {
      info: 'Společný nákup objedná Vojta na Rohlíku s doručením přímo na chatu v pátek večer, až budeme všichni. Co chceš, přidej v záložce Nákup.',
    },
    { info: 'Při předání klíčů se skládá vratná kauce.' },
    { info: 'Povlečení, ručníky, tablety do myčky a základní drogerie jsou v ceně.' },
    { info: 'Pejsci můžou s námi.' },
  ],

  amenities: [
    { name: 'Finská sauna', available: true },
    { name: 'Infrasauna', available: true },
    { name: 'Vířivý sud venku', available: true },
    { name: 'Vířivka ve wellness domku', available: true },
    { name: 'Krbová kamna', available: true },
    { name: 'Plynový gril', available: true },
    { name: 'Ohniště', available: true },
    { name: 'Wi-Fi', available: true },
    { name: 'Smart TV', available: true },
    { name: 'Myčka', available: true },
    { name: 'Pračka', available: true },
    { name: 'Kávovar', available: true },
    { name: 'Povlečení a ručníky', available: true },
    { name: 'Deskovky', available: true },
    { name: 'Venkovní bazén (jen v létě)', available: false },
  ],

  packingItems: [
    { item: 'Plavky do vířivky' },
    { item: 'Župan a pantofle do sauny' },
    { item: 'Boty a oblečení na sobotní výlet' },
    { item: 'Teplé oblečení na večer u ohně' },
    { item: 'Přezůvky' },
    { item: 'Něco k jídlu na páteční odpoledne, nákup z Rohlíku dorazí večer' },
    { item: 'Notebook, kdo zůstává do úterý' },
    { item: 'Pelíšek a misky pro pejska' },
  ],

  program: [
    {
      date: day('2026-11-13'),
      description:
        'Příjezd od 16:00. Večer, až budeme všichni, přiveze Rohlík společný nákup. Pak sauna a vířivka',
    },
    {
      date: day('2026-11-14'),
      description: 'Okruh k Sázavě (13 km) s obědem v Nespekách, víc v záložce Sobotní výlet',
    },
    {
      date: day('2026-11-15'),
      description:
        'Úklid a odjezd do 10:00. Kdo může, zůstává do úterý, víc v záložce Pokračujeme do úterý',
    },
    {
      date: day('2026-11-16'),
      description: 'Kdo zůstal, pracuje z chaty. Večer sauna a vířivka',
    },
    {
      date: day('2026-11-17'),
      description: 'Státní svátek. Úklid a odjezd do 10:00, autobus z Řehenic v 10:35',
    },
  ],

  surroundings: [
    { name: 'Les', note: 'hned za plotem', category: 'place' },
    { name: 'Autobusová zastávka Řehenice, Babice', note: '940 m pěšky', category: 'place' },
    { name: 'Pošta a bankomat', note: '2 km', category: 'place' },
    { name: 'Restaurace', note: '4 km', category: 'place' },
    { name: 'Obchod', note: '5 km', category: 'place' },
    { name: 'Vlak', note: '8 km', category: 'place' },
    { name: 'Pizzerie a kavárna v Kamenici', category: 'place' },
    {
      name: 'Kozlovna a Pod ledem, Velké Popovice',
      note: 'česká kuchyně a pivo',
      category: 'place',
    },
    { name: 'Rozhledna v Ládví u Kamenice', note: '2 km', category: 'trip' },
    { name: 'Na kole k Sázavě', note: '6 km, asi 30 min', category: 'trip' },
    {
      name: 'Velkopopovický pivovar',
      note: 'prohlídka a oběd v Kozlovně, 10 km',
      category: 'trip',
    },
    { name: 'Vojenské muzeum Lešany', note: '9 km', category: 'trip' },
    { name: 'Zámek Konopiště', note: '17 km', category: 'trip' },
  ],

  contactRules: [
    { label: 'Kauce', value: 'skládá se při předání klíčů, vrací se po kontrole chaty' },
    { label: 'Kouření', value: 'v chatě se nekouří' },
  ],

  parking: 'Na pozemku je místo pro 4 auta. Posledních asi 150 m vede zpevněná štěrková cesta.',
  carRoutes: [
    {
      from: 'Z Prahy',
      duration: '0:40',
      distance: '36 km',
      // checked on mapy.com and OSRM: D1 exit 15 is signed "107: Velké
      // Popovice, Strančice"; the Vavřetice turn is ~3.8 km down road 603
      route:
        'Po D1 směr Brno a na exitu 15 Všechromy sjeď na silnici 107 směr Velké Popovice. ' +
        'Přes Velké Popovice pokračuj do Kamenice, tam odboč doleva na silnici 603 směr Benešov. ' +
        'Asi 4 km za Kamenicí, už za Mokřany, odboč doleva do Vavřetic. ' +
        'K chatě je to pak 600 m, posledních 150 m po štěrkové cestě.',
    },
  ],

  // signed-in viewers only ("Klíče a Wi-Fi"): a private person's phone
  // doesn't belong on the public page. Wi-Fi and keys come later.
  privateInfo: [{ label: 'Majitel chaty', value: 'Radim Prokop, 725 384 866' }],

  bedroomOrganizationEnabled: true,
  advancedBedroomMode: false,
  // Participant ids are the same on prod and in a migrate-from-prod copy.
  // Vojta, David and Martin share a room; Daniela and Denisa (and Daniela's
  // dog) have the apartment above the wellness house, extra 1 000 Kč a night;
  // their own; the living-room sofa stays free.
  rooms: [
    {
      name: 'Ložnice 1',
      image: m.room1,
      maxSleepingSpaces: 3,
      beds: [
        {
          name: 'Velká manželská postel',
          occupants: [{ participant: P.vojta }, { participant: P.david }],
        },
        { name: 'Přistýlka', occupants: [{ participant: P.martin }] },
      ],
    },
    {
      name: 'Ložnice 2',
      image: m.room2,
      maxSleepingSpaces: 4,
      beds: [
        {
          name: 'Velká manželská postel',
          occupants: [{ participant: P.michal }, { participant: P.leos }],
        },
        { name: 'Přistýlka pro dva', occupants: [{ participant: P.chose }] },
      ],
    },
    {
      name: 'Ložnice 3',
      image: m.room3,
      maxSleepingSpaces: 2,
      beds: [{ name: 'Manželská postel' }],
    },
    {
      name: 'Obývací pokoj',
      image: m.living,
      maxSleepingSpaces: 2,
      beds: [{ name: 'Rozkládací gauč' }],
    },
    {
      name: 'Apartmán',
      image: m.apartment,
      maxSleepingSpaces: 2,
      beds: [
        {
          name: 'Velká sklápěcí manželská postel',
          occupants: [{ participant: P.daniela }, { participant: P.denisa }],
        },
      ],
    },
  ],

  customTabs: [
    {
      title: 'Sobotní výlet',
      icon: 'mountain',
      content: richText(
        p(
          text('V sobotu jdeme okruh od chaty k Sázavě a zpátky: '),
          text('13 km a dvě hospody po cestě', BOLD),
          text('. Čistého chození jsou necelé 4 hodiny, nastoupáme kolem 190 metrů. '),
          link(ROUTE_URL, 'Celá trasa na Mapy.com'),
          text('.'),
        ),
        image(m.view),
        h3('Plán dne'),
        ol(
          [
            text('10:00', BOLD),
            text(
              ' vyrážíme od chaty. Přes Vavřetice a Gabrhele scházíme po modré údolím do Nespek (5,3 km).',
            ),
          ],
          [
            text('Kolem 11:30', BOLD),
            text(
              ' oběd ve Staré hospodě Nespeky u mostu přes Sázavu. V sobotu má otevřeno od 10:00 do 24:00.',
            ),
          ],
          [
            text('Po obědě', BOLD),
            text(' kus po červené Posázavské stezce podél řeky a pak nahoru do Malešína (1,9 km).'),
          ],
          [
            text('Odpoledne', BOLD),
            text(' přes Křiváček do Řehenic na pivo do Hostince U Ondřichů (1,8 km).'),
          ],
          [
            text('Do půl páté', BOLD),
            text(' údolím zpátky na chatu (4,1 km). Pak se stmívá a čeká nás sauna.'),
          ],
        ),
        h3('Dobré vědět'),
        ul(
          [
            text(
              'Otevírací dobu Hostince U Ondřichů jsme nikde nenašli, v pátek ji ověříme. Kdyby měl zavřeno, dáme druhé pivo ještě v Nespekách.',
            ),
          ],
          [
            text(
              'Kdyby bylo ve Staré hospodě plno, kousek dál v Městečku je Hostinec Antonín Barták (v sobotu od 11:00).',
            ),
          ],
          [text('Poslední úsek údolím jdeme stejnou cestou jako ráno, jen do kopce.')],
        ),
        h3('Co si vzít'),
        ul(
          [text('Pevné boty do lesa')],
          [text('Bundu do deště')],
          [text('Čelovku pro jistotu, v listopadu se brzo stmívá')],
          [text('Peníze na hospody')],
        ),
        h3('Když bude pršet'),
        p(
          text(
            'Zkrátíme to: dojdeme jen na oběd do Nespek a stejnou cestou zpátky, celkem 10,6 km. ',
          ),
          text('Nebo zůstaneme na chatě u sauny, vířivky a deskovek.'),
        ),
      ),
    },
    {
      title: 'Pokračujeme do úterý',
      icon: 'calendar',
      content: richText(
        p(
          text('Úterý 17. listopadu je '),
          text('státní svátek', BOLD),
          text(
            '. Kdo může, zůstane s námi na chatě až do úterního rána. Je to úplně dobrovolné, víkend platí tak jako tak.',
          ),
        ),
        image(m.terrace),
        h3('V pondělí normálně pracujeme'),
        p(
          text('Pondělí 16. 11. je pracovní den a my ho '),
          text('opravdu odpracujeme', BOLD),
          text(
            '. Vezmi si notebook, ráno kafe a pak od stolu až do odpoledne, stejně jako z domova. Na chatě je Wi-Fi s 5G internetem a velká jídelna, kam se vejdeme všichni. Kdo potřebuje klid na call, zavře se v ložnici.',
          ),
        ),
        p(
          text(
            'Rozdíl přijde až po práci: místo cesty domů a prázdné kuchyně sauna, vířivka a večeře s partou.',
          ),
        ),
        h3('V úterý volno'),
        p(text('Odjíždíme do 10:00 a zbytek svátku máš celý pro sebe.')),
        h3('Jak se přidat'),
        p(
          text('Prodloužení máme s majitelem chaty '),
          text('potvrzené', BOLD),
          text(
            '. Stačí dát vědět Vojtovi, ať s tebou počítáme. Kolik to vyjde, uvidíš ve Financích.',
          ),
        ),
      ),
    },
  ],
})

async function main() {
  const { getPayload } = await import('payload')
  const { default: config } = await import(path.join(REPO, 'src/payload.config.ts'))
  const payload = await getPayload({ config })

  const found = await payload.find({
    collection: 'chatas',
    where: { slug: { equals: SLUG } },
    limit: 1,
    depth: 0,
    context: { triggerAfterRead: false },
  })
  const chata = found.docs[0]
  if (!chata) throw new Error(`chata ${SLUG} not found`)

  // the ninth person (the booking is for 9): created once, matched by name;
  // he picks his own bed on the Organizace tab
  const stepan = await payload.find({
    collection: 'participants',
    where: { and: [{ chata: { equals: chata.id } }, { name: { equals: 'Štěpán' } }] },
    limit: 1,
    depth: 0,
  })
  if (stepan.docs.length === 0) {
    const doc = await payload.create({
      collection: 'participants',
      depth: 0,
      data: { chata: chata.id, name: 'Štěpán', akuzativ: 'Štěpána', vokativ: 'Štěpáne' },
    })
    console.log(`created participant #${doc.id} Štěpán`)
  }

  const media = {} as MediaIds
  for (const [key, photo] of Object.entries(PHOTOS) as [
    keyof typeof PHOTOS,
    (typeof PHOTOS)[keyof typeof PHOTOS],
  ][]) {
    const existing = await payload.find({
      collection: 'media',
      where: { filename: { equals: photo.file } },
      limit: 1,
      depth: 0,
    })
    if (existing.docs[0]) {
      media[key] = existing.docs[0].id
      continue
    }
    const res = await fetch(LISTING + photo.src)
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/jpeg')) {
      throw new Error(`photo ${photo.src}: HTTP ${res.status} ${type}`)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const doc = await payload.create({
      collection: 'media',
      data: { alt: photo.alt },
      file: { data: buffer, mimetype: 'image/jpeg', name: photo.file, size: buffer.length },
    })
    media[key] = doc.id
    console.log(`media #${doc.id} ${photo.file}`)
  }
  const data = buildData(media)

  // Merge the transport rows by title: keep each row's id and riders (people
  // sign up later), keep rows somebody added in the admin
  type RiderRow = { id?: string | null; participant: number | { id: number } }
  type TransportRow = { id?: string | null; title: string; riders?: RiderRow[] | null }
  const existingTransport = (chata.publicTransportOptions ?? []) as TransportRow[]
  const riderOf = (r: RiderRow) =>
    typeof r.participant === 'object' ? r.participant.id : r.participant
  const publicTransportOptions = [
    ...TRANSPORT.map((option) => {
      const { mustRide = [], ...row } = option as typeof option & { mustRide?: number[] }
      const existing = existingTransport.find((e) => e.title === row.title)
      const riders: RiderRow[] = [...(existing?.riders ?? [])]
      for (const participant of mustRide) {
        if (!riders.some((r) => riderOf(r) === participant)) riders.push({ participant })
      }
      return { ...row, ...(existing?.id ? { id: existing.id } : {}), riders }
    }),
    ...existingTransport.filter((e) => !TRANSPORT.some((row) => row.title === e.title)),
  ]

  await payload.update({
    collection: 'chatas',
    id: chata.id,
    depth: 0,
    context: { triggerAfterRead: false },
    data: { ...data, publicTransportOptions } as never,
  })
  console.log(`updated chata #${chata.id} (${SLUG}) on ${dbHost}`)

  // Vojta's own account authors them too: "Přidáno tebou" on the cards and
  // editable from the frontend, same as if he had entered them himself
  const vojta = await payload.findByID({ collection: 'participants', id: P.vojta, depth: 0 })
  const vojtaAccount = typeof vojta.account === 'object' ? vojta.account?.id : vojta.account
  if (!vojtaAccount) throw new Error('Vojta has no linked account')

  // whoever stays longer: people who joined the extension were added to its
  // deposit by hand, and a NEW extension expense starts with the same split
  const extensionDeposit = await payload.find({
    collection: 'expenses',
    where: {
      and: [
        { chata: { equals: chata.id } },
        { title: { equals: 'Chata Oáza: záloha za prodloužení' } },
      ],
    },
    limit: 1,
    depth: 0,
  })
  const extensionWeights = (extensionDeposit.docs[0]?.weights ?? []).map((w) => ({
    participant: typeof w.participant === 'object' ? w.participant.id : w.participant,
    weight: w.weight,
  }))
  const SPLITS = {
    extension:
      extensionWeights.length > 0 ? extensionWeights : [{ participant: P.vojta, weight: 1 }],
    apartment: [
      { participant: P.daniela, weight: 1 },
      { participant: P.denisa, weight: 1 },
    ],
  }

  for (const expense of EXPENSES) {
    const existing = await payload.find({
      collection: 'expenses',
      where: { and: [{ chata: { equals: chata.id } }, { title: { equals: expense.title } }] },
      limit: 1,
      depth: 0,
    })
    const fields = {
      chata: chata.id,
      title: expense.title,
      amount: expense.amount,
      payer: { relationTo: 'participants' as const, value: P.vojta },
      ...(expense.split === 'all'
        ? { splitType: 'equal' as const, weights: [] }
        : { splitType: 'weighted' as const, weights: SPLITS[expense.split] }),
      createdAt: expense.date,
      note: expense.note,
      approvalStatus: 'approved' as const,
      authoredBy: vojtaAccount,
    }
    // an existing expense keeps its split: people who joined the extension
    // were added there by hand and must not be dropped by a re-run
    const { splitType: _splitType, weights: _weights, ...updateFields } = fields
    const doc = existing.docs[0]
      ? await payload.update({
          collection: 'expenses',
          id: existing.docs[0].id,
          depth: 0,
          data: updateFields,
        })
      : await payload.create({
          collection: 'expenses',
          depth: 0,
          data: { ...fields, isPlanned: true },
        })
    console.log(`${existing.docs[0] ? 'updated' : 'created'} expense #${doc.id} ${expense.title}`)
  }
  for (const title of RETIRED_EXPENSES) {
    const removed = await payload.delete({
      collection: 'expenses',
      where: { and: [{ chata: { equals: chata.id } }, { title: { equals: title } }] },
      depth: 0,
    })
    for (const doc of removed.docs) console.log(`removed expense #${doc.id} ${title}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
