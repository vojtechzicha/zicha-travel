#!/usr/bin/env tsx
// Demo data behind the screenshots on /napoveda.
//
//   DATABASE_URI=postgresql://payload:payload@localhost:5433/payload \
//   pnpm exec tsx scripts/seed-help-demo.mts
//
// LOCAL ONLY. The help pages must never show real people's names or real
// amounts, so the screenshots are taken against this made-up chata
// ("Ukázková chata", slug `ukazka`) with invented participants. Re-run it
// when the UI changes and the screenshots need retaking; it wipes and
// recreates its own chata and touches nothing else.
//
// The demo account (demo@zicha.travel, role `user`, linked to Katka) exists
// so the signed-in states can be captured: the "Přidat výdaj" button, the
// composer and the "Přidali jste vy" footer. It never logs in, so Katka
// stays visible to anonymous visitors in the participant selector.

import { config as loadEnv } from 'dotenv'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

loadEnv({ path: '.env.local' })
loadEnv()
process.env.NODE_ENV = 'production'

const SLUG = 'ukazka'
const DEMO_EMAIL = 'demo@zicha.travel'

const BANKER_ACCOUNT = '1902345678/3030'

async function main() {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config.js')
  const { accountToIban } = await import('../src/utils/czechBankAccount.js')
  const payload = await getPayload({ config })

  // ─── wipe a previous run ────────────────────────────────────────────────
  const existing = await payload.find({
    collection: 'chatas',
    where: { slug: { equals: SLUG } },
    limit: 1,
    depth: 0,
    context: { triggerAfterRead: false },
  })

  if (existing.docs[0]) {
    const chataId = existing.docs[0].id
    // order matters: everything pointing at a participant goes first, and
    // `paidBy` means participants themselves reference each other
    for (const collection of [
      'expenses',
      'prepayments',
      'joint-accounts',
      'claim-requests',
      'participants',
    ] as const) {
      await payload.delete({
        collection,
        where: { chata: { equals: chataId } },
      })
    }
    await payload.delete({ collection: 'chatas', id: chataId })
    console.log(`removed previous demo chata #${chataId}`)
  }

  // ─── chata ──────────────────────────────────────────────────────────────
  const chata = await payload.create({
    collection: 'chatas',
    depth: 0,
    context: { triggerAfterRead: false },
    data: {
      name: 'Ukázková chata',
      shortName: 'Ukázka',
      location: 'Kokořínsko',
      slug: SLUG,
      themeColor: '#0e7490',
      // required on the collection; the banker relationship follows once the
      // participants exist
      bankerAccountNumber: BANKER_ACCOUNT,
      bankerIban: accountToIban(BANKER_ACCOUNT)!,
      informationEnabled: true,
      tripDateFrom: '2026-09-11T00:00:00.000Z',
      tripDateTo: '2026-09-13T00:00:00.000Z',
      destinationName: 'Roubenka U Tří lip',
      destinationLocation: 'Vidim 42, Kokořínsko',
      destinationDescription:
        'Roubenka kousek od skal. Velká kuchyň, kamna, dvě koupelny a zahrada se stolem na ping pong.',
      basicInfo: [
        { info: 'Klíče vyzvedneme v hospodě naproti, majitel tam bývá do osmi.' },
        { info: 'Wi-Fi je jen v kuchyni, signál na zahradě nechytíte.' },
        { info: 'Snídaně a večeře vaříme společně, obědy si každý řeší sám.' },
      ],
      parking: 'Na dvoře se vejdou tři auta, další stojí u kapličky o sto metrů výš.',
      carRoutes: [
        {
          from: 'Praha',
          duration: '1 h 10 min',
          distance: '62 km',
          route: 'D8 na Zdiby, exit 18 na Mělník, pak přes Vidim.',
        },
      ],
      publicTransportOptions: [
        {
          title: 'Vlakem a autobusem přes Mělník',
          direction: 'tam',
          totalDuration: '2 h 5 min',
          notes: 'Na autobus v Mělníku je devět minut, staví na stejném nástupišti.',
          connections: [
            {
              type: 'vlak',
              number: 'Os 6812',
              from: 'Praha Masarykovo n.',
              to: 'Mělník',
              departure: '09:12',
              arrival: '10:04',
            },
            {
              type: 'autobus',
              number: '469',
              from: 'Mělník aut. st.',
              to: 'Vidim',
              departure: '10:13',
              arrival: '11:17',
            },
          ],
        },
      ],
      bedroomOrganizationEnabled: true,
      sharedCarsEnabled: true,
    },
  })
  console.log(`chata #${chata.id} "${chata.name}"`)

  // ─── participants ───────────────────────────────────────────────────────
  const people = [
    { name: 'Katka', akuzativ: 'Katku', vokativ: 'Katko', accountNumber: '2701234567/2010' },
    { name: 'Vojta', akuzativ: 'Vojtu', vokativ: 'Vojto', accountNumber: '1902345678/3030' },
    { name: 'Míša', akuzativ: 'Míšu', vokativ: 'Míšo', accountNumber: '1234567890/0800' },
    { name: 'Petr', akuzativ: 'Petra', vokativ: 'Petře', accountNumber: '6543210987/0300' },
    { name: 'Tereza', akuzativ: 'Terezu', vokativ: 'Terezo', accountNumber: '4455667788/0600' },
  ]

  const ids: Record<string, number> = {}
  for (const person of people) {
    const doc = await payload.create({
      collection: 'participants',
      depth: 0,
      data: { ...person, chata: chata.id },
    })
    ids[person.name] = doc.id
  }

  // Ela is a child: Katka covers her shares ("platí za ni")
  const ela = await payload.create({
    collection: 'participants',
    depth: 0,
    data: { name: 'Ela', akuzativ: 'Elu', vokativ: 'Elo', chata: chata.id, paidBy: ids['Katka'] },
  })
  ids['Ela'] = ela.id
  console.log(`participants: ${Object.keys(ids).join(', ')}`)

  // ─── banker + banking details on the chata ──────────────────────────────
  await payload.update({
    collection: 'chatas',
    id: chata.id,
    depth: 0,
    context: { triggerAfterRead: false },
    data: {
      banker: ids['Vojta'],
      rooms: [
        {
          name: 'Podkroví',
          description: 'Dvě postele pod trámy, do kolena se tam nedá stoupnout.',
          maxSleepingSpaces: 3,
          beds: [
            { name: 'Manželská postel', occupants: [{ participant: ids['Katka'] }, { participant: ids['Vojta'] }] },
            { name: 'Rozkládací křeslo', occupants: [{ participant: ids['Ela'] }] },
          ],
        },
        {
          name: 'Pokoj u kuchyně',
          description: 'Dvě samostatné postele a kamna hned za zdí.',
          maxSleepingSpaces: 3,
          beds: [
            { name: 'Postel u okna', occupants: [{ participant: ids['Míša'] }] },
            { name: 'Postel u dveří', occupants: [{ participant: ids['Petr'] }] },
            { name: 'Matrace', occupants: [{ participant: ids['Tereza'] }] },
          ],
        },
      ],
      sharedCars: [
        {
          name: 'Vojtova oktávka',
          description: 'Odjezd v pátek v 15:00 od metra Ládví.',
          driver: ids['Vojta'],
          frontPassenger: ids['Katka'],
          passengers: [{ participant: ids['Ela'] }],
        },
        {
          name: 'Míšino auto',
          description: 'Vyjíždí až po práci, kolem sedmé.',
          driver: ids['Míša'],
          passengers: [{ participant: ids['Petr'] }],
        },
      ],
    },
  })

  // ─── joint account ──────────────────────────────────────────────────────
  const joint = await payload.create({
    collection: 'joint-accounts',
    depth: 0,
    data: {
      name: 'Katka a Vojta',
      chata: chata.id,
      members: [ids['Katka'], ids['Vojta']],
    },
  })

  // ─── expenses ───────────────────────────────────────────────────────────
  const all = [ids['Katka'], ids['Vojta'], ids['Míša'], ids['Petr'], ids['Tereza'], ids['Ela']]

  const expenses = [
    {
      title: 'Pronájem chalupy (2 noci)',
      amount: 7200,
      payer: { relationTo: 'joint-accounts' as const, value: joint.id },
      splitType: 'equal' as const,
      note: 'Záloha i doplatek majiteli, poslané z našeho společného účtu.',
    },
    {
      title: 'Velký nákup v Mělníku',
      amount: 3480,
      payer: { relationTo: 'participants' as const, value: ids['Míša'] },
      splitType: 'equal' as const,
    },
    {
      title: 'Snídaně a pečivo na sobotu',
      amount: 640,
      payer: { relationTo: 'participants' as const, value: ids['Petr'] },
      splitType: 'equal' as const,
    },
    {
      title: 'Pivo a víno',
      amount: 1250,
      payer: { relationTo: 'participants' as const, value: ids['Vojta'] },
      splitType: 'weighted' as const,
      weights: [
        { participant: ids['Katka'], weight: 1 },
        { participant: ids['Vojta'], weight: 2 },
        { participant: ids['Míša'], weight: 1 },
        { participant: ids['Petr'], weight: 2 },
      ],
      note: 'Vojta a Petr si dali víc, tak mají dvojnásobný podíl.',
    },
    {
      title: 'Vstup do skalního bludiště',
      amount: 900,
      payer: { relationTo: 'participants' as const, value: ids['Katka'] },
      splitType: 'equal' as const,
      invitations: [{ host: ids['Katka'], guest: ids['Tereza'] }],
      note: 'Terezu jsem vzala jako dárek k narozeninám.',
    },
    {
      title: 'Dřevo do kamen',
      amount: 450,
      payer: { relationTo: 'participants' as const, value: ids['Tereza'] },
      splitType: 'equal' as const,
    },
    {
      title: 'Nedělní oběd v hospodě',
      amount: 1800,
      payer: { relationTo: 'participants' as const, value: ids['Vojta'] },
      splitType: 'equal' as const,
      isPlanned: true,
      note: 'Zatím jen plán, platíme až na místě.',
    },
  ]

  for (const expense of expenses) {
    const doc = await payload.create({
      collection: 'expenses',
      depth: 0,
      data: {
        chata: chata.id,
        ...expense,
        // equal splits still list who takes part
        ...(expense.splitType === 'equal'
          ? { weights: all.map((participant) => ({ participant, weight: 1 })) }
          : {}),
      } as never,
    })
    console.log(`expense #${doc.id} ${expense.title}`)
  }

  // ─── prepayments to the banker ──────────────────────────────────────────
  const prepayments = [
    { from: { relationTo: 'joint-accounts' as const, value: joint.id }, amount: 4000, type: 'advance' as const, note: 'Záloha za nás oba i za Elu' },
    { from: { relationTo: 'participants' as const, value: ids['Míša'] }, amount: 2000, type: 'advance' as const },
    { from: { relationTo: 'participants' as const, value: ids['Petr'] }, amount: 2000, type: 'advance' as const },
    { from: { relationTo: 'participants' as const, value: ids['Tereza'] }, amount: 2000, type: 'advance' as const },
    { from: { relationTo: 'participants' as const, value: ids['Míša'] }, amount: 500, type: 'supplement' as const, note: 'Doplatek po nákupu' },
  ]

  for (const prepayment of prepayments) {
    await payload.create({
      collection: 'prepayments',
      depth: 0,
      data: { chata: chata.id, ...prepayment },
    })
  }
  console.log(`prepayments: ${prepayments.length}`)

  // ─── demo frontend account linked to Katka ──────────────────────────────
  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: DEMO_EMAIL } },
    limit: 1,
    depth: 0,
  })
  const user =
    found.docs[0] ??
    (await payload.create({
      collection: 'users',
      depth: 0,
      data: {
        email: DEMO_EMAIL,
        name: 'Katka',
        vokativ: 'Katko',
        role: 'user',
        password: `demo-${Math.round(Number(process.env.SEED_SALT) || 42)}-not-used`,
      },
    }))

  await payload.update({
    collection: 'participants',
    id: ids['Katka'],
    depth: 0,
    data: { account: user.id },
  })
  console.log(`demo account #${user.id} (${DEMO_EMAIL}) → Katka`)

  // One expense authored from the frontend, so the screenshots can show the
  // "Přidali jste vy" footer with Upravit/Smazat
  const authored = await payload.find({
    collection: 'expenses',
    where: { and: [{ chata: { equals: chata.id } }, { title: { equals: 'Vstup do skalního bludiště' } }] },
    limit: 1,
    depth: 0,
  })
  if (authored.docs[0]) {
    await payload.update({
      collection: 'expenses',
      id: authored.docs[0].id,
      depth: 0,
      data: { authoredBy: user.id },
    })
  }

  // ─── admin of the demo chata + one pending claim to decide ──────────────
  // The admin screenshots (chata form, participant form) and the claim
  // decision page are all shot through these two accounts.
  const adminEmail = 'demo-spravce@zicha.travel'
  const foundAdmin = await payload.find({
    collection: 'users',
    where: { email: { equals: adminEmail } },
    limit: 1,
    depth: 0,
  })
  const admin =
    foundAdmin.docs[0] ??
    (await payload.create({
      collection: 'users',
      depth: 0,
      data: { email: adminEmail, name: 'Správce ukázky', role: 'admin', password: 'demo-not-used' },
    }))
  await payload.update({
    collection: 'users',
    id: admin.id,
    depth: 0,
    data: { role: 'admin', assignedChatas: [chata.id] },
  })

  const claimantEmail = 'demo-tereza@zicha.travel'
  const foundClaimant = await payload.find({
    collection: 'users',
    where: { email: { equals: claimantEmail } },
    limit: 1,
    depth: 0,
  })
  const claimant =
    foundClaimant.docs[0] ??
    (await payload.create({
      collection: 'users',
      depth: 0,
      data: { email: claimantEmail, name: 'Tereza', role: 'user', password: 'demo-not-used' },
    }))

  const claim = await payload.create({
    collection: 'claim-requests',
    depth: 0,
    data: {
      participant: ids['Tereza'],
      chata: chata.id,
      user: claimant.id,
      status: 'pending',
    },
  })
  console.log(`admin #${admin.id} (${adminEmail}), pending claim #${claim.id} na Terezu`)

  // Ids for the screenshot script — the admin and claim rows are not
  // readable without a session, so they are handed over on disk instead.
  const manifest = path.join(process.cwd(), 'scripts', '.help-demo.json')
  await writeFile(
    manifest,
    JSON.stringify(
      { chataId: chata.id, slug: SLUG, participants: ids, userId: user.id, adminId: admin.id, claimId: claim.id },
      null,
      2,
    ),
  )
  console.log(`manifest → ${manifest}`)

  console.log(`\nHotovo. http://localhost:3000/${SLUG}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
