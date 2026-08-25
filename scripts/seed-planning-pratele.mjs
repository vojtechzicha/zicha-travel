#!/usr/bin/env node
// One-off seed for the planning phase of zicha.travel/pratele
// (docs/PRD-planovani.md): two candidate weekends, four cottages from
// e-chalupy.cz (Kloučka is already booked for the October one), the intro
// copy, and the tentative window on the chata. Idempotent — a chata that
// already has date options is left alone.
//
// Run AFTER the schema exists (a deploy ran `migrate:payer auto`, or
// locally after `pnpm dev` pushed the schema):
//   pnpm planning:seed:pratele            # local .env DATABASE_URI
//   node scripts/seed-planning-pratele.mjs --db=<uri>   # explicit target
//   node scripts/seed-planning-pratele.mjs --slug=jina-chata

import pg from 'pg'

try {
  const { config: loadEnv } = await import('dotenv')
  loadEnv({ path: '.env.local' })
  loadEnv()
} catch {}

const args = process.argv.slice(2)
const dbArg = args.find((a) => a.startsWith('--db='))
const slugArg = args.find((a) => a.startsWith('--slug='))
const databaseUri = dbArg ? dbArg.slice('--db='.length) : process.env.DATABASE_URI
const slug = slugArg ? slugArg.slice('--slug='.length) : 'pratele'

if (!databaseUri) {
  console.error('ERROR: no database URI (set DATABASE_URI in .env.local/.env or pass --db=<uri>)')
  process.exit(1)
}

const url = new URL(databaseUri)
console.log(`Database: ${url.hostname}:${url.port || 5432}${url.pathname}`)
console.log(`Chata slug: ${slug}\n`)

// Both windows are Friday→Sunday weekends (2 nights). Day-only dates are
// stored the way Payload's dayOnly picker stores them: noon UTC.
const DATE_OPTIONS = [
  {
    label: '16.–18. 10. 2026',
    dateFrom: '2026-10-16T12:00:00.000Z',
    dateTo: '2026-10-18T12:00:00.000Z',
    note: 'víkend pá–ne',
  },
  {
    label: '13.–15. 11. 2026',
    dateFrom: '2026-11-13T12:00:00.000Z',
    dateTo: '2026-11-15T12:00:00.000Z',
    note: 'víkend pá–ne',
  },
]

// availableIn: indexes into DATE_OPTIONS. Kloučka is taken in October.
const ACCOMMODATIONS = [
  {
    name: 'Kamenná chalupa',
    locationNote: 'Bezdědice, pod Bezdězem',
    url: 'https://www.e-chalupy.cz/bela-pod-bezdezem-ubytovani-bezdedice-kamenna-chalupa-k-pronajmu-o21006',
    description: 'Kamenný dům pro 10 lidí a 2 přistýlky, kousek pod hradem Bezděz.',
    availableIn: [0, 1],
  },
  {
    name: 'Chata Kloučka',
    locationNote: 'Hradové Střimelice, Posázaví',
    url: 'https://www.e-chalupy.cz/ubytovani-stribrna-skalice-hradove-strimelice-chata-kloucka-o1424',
    description: 'Chata s vířivkou nad Sázavou. Čtyři ložnice pro 8 lidí, k tomu přistýlky.',
    availableIn: [1],
  },
  {
    name: 'Chata Oáza',
    locationNote: 'Vavřetice, Benešovsko',
    url: 'https://www.e-chalupy.cz/ubytovani-vavretice-chata-oaza-pronajem-o10009',
    description: 'Chata u lesa se třemi ložnicemi až pro 9 lidí, terasa s grilem.',
    availableIn: [0, 1],
  },
  {
    name: 'Chata Skvrnov',
    locationNote: 'Skvrnov u Kouřimi',
    url: 'https://www.e-chalupy.cz/ubytovani-skvrnov-chata-pronajem-o23763',
    description: 'Chata ve vsi mezi Kouřimí a Sázavou. Podrobnosti najdeš v nabídce.',
    availableIn: [0, 1],
  },
]

const PLANNING_INTRO =
  'Chystáme podzimní víkend na chatě. Ve hře jsou dva termíny a čtyři chalupy ' +
  'kousek od Prahy. Řekni nám, kdy můžeš a kam by se ti chtělo, ať můžeme rezervovat.'

// The tentative window spans both candidate weekends; the homepage then
// files the chata under "Plánujeme" with the "Termín upřesníme" badge.
const WINDOW_FROM = '2026-10-16T12:00:00.000Z'
const WINDOW_TO = '2026-11-15T12:00:00.000Z'
const PLANNED_NIGHTS = 2

const client = new pg.Client({ connectionString: databaseUri })

async function main() {
  await client.connect()

  const tables = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('trip_date_options', 'trip_accommodation_options')`,
  )
  if (tables.rows[0].n < 2) {
    console.error(
      'ERROR: planning tables missing — deploy first (vercel-build runs migrate:payer auto), or run `pnpm migrate:payer auto`.',
    )
    process.exit(1)
  }

  const chataRes = await client.query('SELECT id, name FROM chatas WHERE slug = $1', [slug])
  if (chataRes.rows.length === 0) {
    console.error(`ERROR: no chata with slug "${slug}"`)
    process.exit(1)
  }
  const chata = chataRes.rows[0]
  console.log(`Chata: #${chata.id} ${chata.name}`)

  const existing = await client.query(
    'SELECT count(*)::int AS n FROM trip_date_options WHERE chata_id = $1',
    [chata.id],
  )
  if (existing.rows[0].n > 0) {
    console.log('Date options already exist for this chata — nothing seeded.')
    return
  }

  await client.query('BEGIN')

  const dateIds = []
  for (const option of DATE_OPTIONS) {
    const res = await client.query(
      `INSERT INTO trip_date_options (chata_id, label, date_from, date_to, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [chata.id, option.label, option.dateFrom, option.dateTo, option.note],
    )
    dateIds.push(res.rows[0].id)
    console.log(`  + termín ${option.label} (#${res.rows[0].id})`)
  }

  for (const place of ACCOMMODATIONS) {
    const res = await client.query(
      `INSERT INTO trip_accommodation_options (chata_id, name, location_note, url, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [chata.id, place.name, place.locationNote, place.url, place.description],
    )
    const placeId = res.rows[0].id
    let order = 1
    for (const idx of place.availableIn) {
      await client.query(
        `INSERT INTO trip_accommodation_options_rels ("order", parent_id, path, trip_date_options_id)
         VALUES ($1, $2, 'dateOptions', $3)`,
        [order++, placeId, dateIds[idx]],
      )
    }
    console.log(
      `  + chalupa ${place.name} (#${placeId}, termíny: ${place.availableIn
        .map((i) => DATE_OPTIONS[i].label)
        .join(', ')})`,
    )
  }

  // Planning flag + intro; the tentative window only where the chata has no
  // trip dates yet (never clobber an admin's setup)
  await client.query(
    `UPDATE chatas SET planning_enabled = true, planning_intro = $2 WHERE id = $1`,
    [chata.id, PLANNING_INTRO],
  )
  const windowRes = await client.query(
    `UPDATE chatas
     SET trip_date_from = $2, trip_date_to = $3, trip_dates_tentative = true,
         trip_planned_nights = $4
     WHERE id = $1 AND trip_date_from IS NULL AND trip_date_to IS NULL`,
    [chata.id, WINDOW_FROM, WINDOW_TO, PLANNED_NIGHTS],
  )
  console.log(
    windowRes.rowCount > 0
      ? '  + orientační termín 16. 10. – 15. 11. 2026, 2 noci'
      : '  (chata už měla termín — okno nezměněno)',
  )

  await client.query('COMMIT')
  console.log('\nDone. Planning is live — check the chata page and the admin Planning group.')
}

try {
  await main()
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(err)
  process.exitCode = 1
} finally {
  await client.end()
}
