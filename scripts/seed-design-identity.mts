#!/usr/bin/env tsx
// One-off backfill for the homepage redesign ("Výběr chaty"): gives every
// chata its design identity (cover photo + theme color) and names the two
// existing frontend accounts.
//
//   pnpm exec tsx scripts/seed-design-identity.mts
//
// Environment decides the target: DATABASE_URI (+ S3_* for bucket uploads).
// Run against the LOCAL docker DB first as a dry-run:
//   DATABASE_URI=postgresql://payload:payload@localhost:5433/payload \
//   S3_ENDPOINT= pnpm exec tsx scripts/seed-design-identity.mts
//
// Idempotent: media is looked up by filename, backgrounds by name, and the
// chata/user updates just re-apply the same values. NODE_ENV is forced to
// "production" so Payload never dev-pushes schema at the target database —
// the two additive users columns are created explicitly below (the same DDL
// ships in scripts/migrate-payer-polymorphic.mjs for the Vercel build).

import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv()
process.env.NODE_ENV = 'production'

// Design covers (claude.ai/design "Výběr chaty") — one per production chata
const CHATAS = [
  {
    slug: 'lazne-2026', // Lázně v Jeseníkách 2026
    themeColor: '#0e7490',
    filename: 'cover-lazne-jeseniky-2026.jpg',
    alt: 'Mlžné lesy v Jeseníkách',
    backgroundName: 'Jeseníky — mlžné lesy',
    photo: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=2000&auto=format&fit=crop',
  },
  {
    slug: 'vysocina-2026', // Léto na kolech na Vysočině 2026
    themeColor: '#4d7c0f',
    filename: 'cover-vysocina-2026.jpg',
    alt: 'Polní cesta na Vysočině',
    backgroundName: 'Vysočina — polní cesta',
    photo: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=2000&auto=format&fit=crop',
  },
  {
    slug: 'exman', // exMan Slapy 2026
    themeColor: '#d97706',
    filename: 'cover-slapy-2026.jpg',
    alt: 'Slapská přehrada',
    backgroundName: 'Slapy — přehrada',
    photo: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2000&auto=format&fit=crop',
  },
  {
    slug: 'jeseniky-2025', // Zimní Točník v Jeseníkách 2025
    themeColor: '#4f46e5',
    filename: 'cover-jeseniky-2025.jpg',
    alt: 'Zimní hory v noci',
    backgroundName: 'Jeseníky — zimní hory',
    photo: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2000&auto=format&fit=crop',
  },
  {
    slug: 'beskydy-2025', // e(x)Man 2025 - Chalupka pod Medem
    themeColor: '#b45309',
    filename: 'cover-beskydy-2025.jpg',
    alt: 'Hory v Beskydech',
    backgroundName: 'Beskydy — hory',
    photo: 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?q=80&w=2000&auto=format&fit=crop',
  },
]

// Account display names — resolved through the participant link so the
// script works on any copy of the data
const ACCOUNTS = [
  { participantName: 'Vojta', name: 'Vojtěch Zicha', vokativ: 'Vojto' },
  { participantName: 'Katka', name: 'Kateřina Rechová', vokativ: 'Katko' },
]

async function main() {
  if (!process.env.DATABASE_URI) {
    console.error('DATABASE_URI is not set')
    process.exit(1)
  }
  const dbHost = process.env.DATABASE_URI.replace(/^.*@/, '').replace(/\/.*$/, '')
  console.log(`Target database: ${dbHost}`)
  console.log(`S3 uploads: ${process.env.S3_ENDPOINT ? 'enabled' : 'disabled (local disk)'}`)

  // 1. Additive users columns (same statements as the deploy migration)
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: process.env.DATABASE_URI })
  await client.connect()
  await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS name character varying')
  await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS vokativ character varying')
  await client.end()
  console.log('users.name / users.vokativ columns ensured')

  const { getPayload } = await import('payload')
  const { default: payloadConfig } = await import('../src/payload.config')
  const payload = await getPayload({ config: payloadConfig })

  // 2. Covers + theme colors
  for (const item of CHATAS) {
    const chataRes = await payload.find({
      collection: 'chatas',
      where: { slug: { equals: item.slug } },
      limit: 1,
      depth: 0,
      context: { triggerAfterRead: false },
    })
    const chata = chataRes.docs[0]
    if (!chata) {
      console.warn(`! chata "${item.slug}" not found — skipping`)
      continue
    }

    let media = (
      await payload.find({
        collection: 'media',
        where: { filename: { equals: item.filename } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]
    if (!media) {
      console.log(`downloading ${item.photo}`)
      const res = await fetch(item.photo)
      if (!res.ok) throw new Error(`Download failed (${res.status}): ${item.photo}`)
      const data = Buffer.from(await res.arrayBuffer())
      media = await payload.create({
        collection: 'media',
        data: { alt: item.alt },
        file: { data, name: item.filename, mimetype: 'image/jpeg', size: data.length },
      })
      console.log(`uploaded media #${media.id} (${item.filename}, ${(data.length / 1024).toFixed(0)} kB)`)
    } else {
      console.log(`media ${item.filename} already exists (#${media.id})`)
    }

    let background = (
      await payload.find({
        collection: 'backgrounds',
        where: { name: { equals: item.backgroundName } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]
    if (!background) {
      background = await payload.create({
        collection: 'backgrounds',
        data: { name: item.backgroundName, type: 'upload', image: media.id },
      })
      console.log(`created background #${background.id} "${item.backgroundName}"`)
    } else if (
      background.type !== 'upload' ||
      (typeof background.image === 'object' ? background.image?.id : background.image) !== media.id
    ) {
      await payload.update({
        collection: 'backgrounds',
        id: background.id,
        data: { type: 'upload', image: media.id, url: null },
      })
      console.log(`updated background #${background.id} "${item.backgroundName}"`)
    }

    await payload.update({
      collection: 'chatas',
      id: chata.id,
      data: { background: background.id, themeColor: item.themeColor },
      depth: 0,
      context: { triggerAfterRead: false },
    })
    console.log(`chata "${chata.name}" → background #${background.id}, theme ${item.themeColor}`)
  }

  // 3. Account names (found via their linked participants)
  for (const account of ACCOUNTS) {
    const linked = (
      await payload.find({
        collection: 'participants',
        where: { and: [{ name: { equals: account.participantName } }, { account: { not_equals: null } }] },
        limit: 1,
        depth: 0,
      })
    ).docs[0]
    const userId =
      linked && (typeof linked.account === 'object' ? linked.account?.id : linked.account)
    if (!userId) {
      console.warn(`! no account linked to a participant named "${account.participantName}" — skipping`)
      continue
    }
    await payload.update({
      collection: 'users',
      id: userId,
      data: { name: account.name, vokativ: account.vokativ },
      depth: 0,
    })
    console.log(`user #${userId} → "${account.name}" (${account.vokativ})`)
  }

  console.log('Done.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
