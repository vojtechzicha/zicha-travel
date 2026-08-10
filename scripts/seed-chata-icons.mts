#!/usr/bin/env tsx
// Gives every chata its own icon instead of the shared default cottage.
//
//   pnpm exec tsx scripts/seed-chata-icons.mts          # apply
//   REVERT=1 pnpm exec tsx scripts/seed-chata-icons.mts # back to the default
//
// Environment decides the target: DATABASE_URI (+ S3_* for bucket uploads).
// Dry-run against the LOCAL docker DB first:
//   DATABASE_URI=postgresql://payload:payload@localhost:5433/payload \
//   S3_ENDPOINT= pnpm exec tsx scripts/seed-chata-icons.mts
//
// Idempotent: media is looked up by filename, icons by name, and the chata
// update just re-applies the same relationship.
//
// DESIGN CONSTRAINTS (why these icons look the way they do)
// --------------------------------------------------------
// * The smallest badge on the homepage renders the icon at 13 px inside an
//   ~21 px chip, so anything built from thin lines or several small elements
//   turns to mush. Every icon here is ONE bold silhouette that fills the
//   24×24 box, like the default cottage it replaces.
// * InlineSvgIcon rewrites the root fill to currentColor and the icon is
//   painted white on the chata's theme colour, so there is no second colour
//   to work with — "holes" have to be real gaps in the geometry (the badge
//   colour shows through), never a white shape on top.
// * Children carry no fill of their own so they inherit the root currentColor.

import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv()
process.env.NODE_ENV = 'production'

const sun = (): string => {
  const rays = Array.from({ length: 8 }, (_, i) =>
    `<rect x="10.7" y="0.6" width="2.6" height="3.9" rx="1.3" transform="rotate(${i * 45} 12 12)"/>`,
  ).join('')
  return `<circle cx="12" cy="12" r="5.4"/>${rays}`
}

// One arm (pointing up) with its two barbs, then rotated six times. Defining
// the barbs inside the rotated group is what keeps them ON the arm — nesting
// two rotations around different origins piled them all near the centre.
const snowflake = (): string => {
  const arm =
    '<rect x="10.7" y="1.1" width="2.6" height="11.6" rx="1.3"/>' +
    '<rect x="10.9" y="2.2" width="2.2" height="5.6" rx="1.1" transform="rotate(-44 12 3.2)"/>' +
    '<rect x="10.9" y="2.2" width="2.2" height="5.6" rx="1.1" transform="rotate(44 12 3.2)"/>'
  const arms = [0, 60, 120, 180, 240, 300]
    .map((deg) => `<g transform="rotate(${deg} 12 12)">${arm}</g>`)
    .join('')
  return `${arms}<circle cx="12" cy="12" r="2.4"/>`
}

const ICON_BODIES: Record<string, string> = {
  // Lázně — thermal water. A single fat teardrop; the most robust shape here.
  droplet: '<path d="M12 2.4c-4 4.9-7.2 8.9-7.2 12.5a7.2 7.2 0 1 0 14.4 0c0-3.6-3.2-7.6-7.2-12.5z"/>',

  // Baltské moře — sails and a hull, two chunky masses that survive scaling.
  sailboat:
    '<path d="M13.1 1.4 22 13.9h-8.9z"/>' +
    '<path d="M10.9 4.6v9.3H3.6z"/>' +
    '<path d="M1.8 16h20.4c.6 0 1 .6.8 1.1l-1 2.3c-.7 1.6-2.2 2.6-3.9 2.6H5.9c-1.7 0-3.2-1-3.9-2.6l-1-2.3c-.2-.5.2-1.1.8-1.1z"/>',

  // Vysočina v létě — the sun off the cover photo.
  sun: sun(),

  // Slapy — the reservoir. The tail has to OVERLAP the body, not sit beside
  // it: with a gap the whole thing read as two unrelated blobs at 13 px.
  // The eye is a real hole (evenodd) so it never becomes a white dot.
  fish:
    '<path fill-rule="evenodd" d="M1.6 12c2.5-4 6.6-6.5 11-6.5 4.4 0 8 2.9 8 6.5s-3.6 6.5-8 6.5c-4.4 0-8.5-2.5-11-6.5zm6.6-1.3a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z"/>' +
    '<path d="M15.6 12 22.4 6.4c.6-.5 1.6-.1 1.6.7v9.8c0 .8-1 1.2-1.6.7z"/>',

  // Zimní Točník — snow.
  snowflake: snowflake(),

  // Narozeninový víkend — the occasion, not the place: every other chata here
  // is a landscape, so this is the one that never gets confused, and it stands
  // out in the picker list. A cupcake rather than a layer cake — a dome over a
  // tapered wrapper is two DIFFERENT shapes, where frosting-bar over cake-bar
  // just read as two stacked bars.
  cake:
    '<path d="M12 0.6c1.5 1.5 2.2 2.6 2.2 3.5a2.2 2.2 0 0 1-4.4 0c0-.9.7-2 2.2-3.5z"/>' +
    '<rect x="11.2" y="4.4" width="1.6" height="3.4" rx="0.6"/>' +
    '<path d="M12 7.4c3.8 0 6.8 2.3 6.8 4.6 0 1-.7 1.7-1.7 1.7H6.9c-1 0-1.7-.7-1.7-1.7 0-2.3 3-4.6 6.8-4.6z"/>' +
    '<path d="M5.4 15h13.2l-1.6 6.4c-.3 1.1-1.2 1.8-2.3 1.8H9.3c-1.1 0-2-.7-2.3-1.8z"/>',

  // Chalupka pod Medem, Beskydy — a fir. The tiers overlap into one solid
  // mass with notched sides, which is what keeps it readable when tiny.
  fir:
    '<path d="M12 1.8 7.7 9h8.6z"/>' +
    '<path d="M12 6.4 5.7 14.6h12.6z"/>' +
    '<path d="M12 11.4 3.7 20.1h16.6z"/>' +
    '<rect x="10.7" y="19.4" width="2.6" height="3.2" rx="0.5"/>',
}

const svgFor = (key: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${ICON_BODIES[key]}</svg>`

// `cover` is only set for chatas that still have no design identity — it
// uploads the image, wraps it in a Background and applies the theme colour,
// the same three things scripts/seed-design-identity.mts did for the rest.
const CHATAS: {
  slug: string
  icon: string
  iconName: string
  alt: string
  themeColor?: string
  cover?: { file: string; filename: string; alt: string; backgroundName: string }
}[] = [
  { slug: 'lazne-2026', icon: 'droplet', iconName: 'Kapka (lázně)', alt: 'Kapka vody' },
  { slug: 'polsko-2027', icon: 'sailboat', iconName: 'Plachetnice (moře)', alt: 'Plachetnice' },
  { slug: 'vysocina-2026', icon: 'sun', iconName: 'Slunce (léto)', alt: 'Slunce' },
  { slug: 'exman', icon: 'fish', iconName: 'Ryba (přehrada)', alt: 'Ryba' },
  { slug: 'jeseniky-2025', icon: 'snowflake', iconName: 'Vločka (zima)', alt: 'Sněhová vločka' },
  { slug: 'beskydy-2025', icon: 'fir', iconName: 'Smrk (hory)', alt: 'Jehličnatý strom' },
  {
    slug: 'narozeniny-2026',
    icon: 'cake',
    iconName: 'Dort (narozeniny)',
    alt: 'Narozeninový dort',
    // rose — the one hue no other chata uses; #d97706 and #b45309 are already
    // close enough to each other that a third amber would be unreadable as a
    // rail on the homepage
    themeColor: '#be123c',
    cover: {
      file: 'scripts/assets/cover-narozeniny-2026.jpg',
      filename: 'cover-narozeniny-2026.jpg',
      alt: 'Hory s prvním sněhem nad podzimním lesem',
      backgroundName: 'Hory — první sníh nad podzimním lesem',
    },
  },
]

async function main() {
  // EMIT_ONLY=<dir> writes the SVGs plus a contact sheet and touches nothing
  // else — how these were proofed at 13/18/26 px before going near a database.
  if (process.env.EMIT_ONLY) {
    const fs = await import('node:fs')
    const dir = process.env.EMIT_ONLY
    fs.mkdirSync(dir, { recursive: true })
    const swatches = CHATAS.map((c) => c.themeColor ?? '')
    const fallback = ['#0e7490', '#0369a1', '#4d7c0f', '#d97706', '#4f46e5', '#b45309', '#be123c']
    const rows = CHATAS.map((item, i) => {
      fs.writeFileSync(`${dir}/icon-${item.icon}.svg`, svgFor(item.icon))
      const chip = (px: number) =>
        `<span class="chip" style="background:${swatches[i] || fallback[i]};padding:${Math.round(px / 3)}px">` +
        svgFor(item.icon).replace('<svg ', `<svg width="${px}" height="${px}" `) +
        '</span>'
      return `<tr><td>${item.iconName}</td><td>${chip(13)}</td><td>${chip(18)}</td><td>${chip(26)}</td><td>${chip(64)}</td></tr>`
    }).join('')
    fs.writeFileSync(
      `${dir}/index.html`,
      `<!doctype html><meta charset="utf-8"><style>body{background:#0f172a;color:#e2e8f0;font:14px system-ui;padding:24px}td{padding:10px 18px;vertical-align:middle}.chip{display:inline-flex;border-radius:8px;color:#fff}</style><table>${rows}</table>`,
    )
    console.log(`wrote ${CHATAS.length} SVGs + index.html to ${dir}`)
    process.exit(0)
  }

  if (!process.env.DATABASE_URI) {
    console.error('DATABASE_URI is not set')
    process.exit(1)
  }
  const revert = process.env.REVERT === '1'
  const dbHost = process.env.DATABASE_URI.replace(/^.*@/, '').replace(/\/.*$/, '')
  console.log(`Target database: ${dbHost}`)
  console.log(`S3 uploads: ${process.env.S3_ENDPOINT ? 'enabled' : 'disabled (local disk)'}`)
  console.log(revert ? 'Mode: REVERT to the default icon' : 'Mode: apply per-chata icons')

  const { getPayload } = await import('payload')
  const { default: payloadConfig } = await import('../src/payload.config')
  const payload = await getPayload({ config: payloadConfig })

  const defaultIcon = (
    await payload.find({ collection: 'icons', where: { isDefault: { equals: true } }, limit: 1, depth: 0 })
  ).docs[0]

  for (const item of CHATAS) {
    const chata = (
      await payload.find({
        collection: 'chatas',
        where: { slug: { equals: item.slug } },
        limit: 1,
        depth: 0,
        context: { triggerAfterRead: false },
      })
    ).docs[0]
    if (!chata) {
      console.warn(`! chata "${item.slug}" not found — skipping`)
      continue
    }

    if (revert) {
      await payload.update({
        collection: 'chatas',
        id: chata.id,
        data: { icon: defaultIcon?.id ?? null },
        depth: 0,
        context: { triggerAfterRead: false },
      })
      console.log(`chata "${chata.name}" → default icon`)
      continue
    }

    const filename = `icon-${item.icon}.svg`
    let media = (
      await payload.find({ collection: 'media', where: { filename: { equals: filename } }, limit: 1, depth: 0 })
    ).docs[0]
    const data = Buffer.from(svgFor(item.icon), 'utf8')
    if (!media) {
      media = await payload.create({
        collection: 'media',
        data: { alt: item.alt },
        file: { data, name: filename, mimetype: 'image/svg+xml', size: data.length },
      })
      console.log(`uploaded media #${media.id} (${filename}, ${data.length} B)`)
    } else {
      console.log(`media ${filename} already exists (#${media.id})`)
    }

    let icon = (
      await payload.find({ collection: 'icons', where: { name: { equals: item.iconName } }, limit: 1, depth: 0 })
    ).docs[0]
    if (!icon) {
      icon = await payload.create({ collection: 'icons', data: { name: item.iconName, svg: media.id } })
      console.log(`created icon #${icon.id} "${item.iconName}"`)
    } else {
      const current = typeof icon.svg === 'object' ? icon.svg?.id : icon.svg
      if (current !== media.id) {
        await payload.update({ collection: 'icons', id: icon.id, data: { svg: media.id } })
        console.log(`icon #${icon.id} "${item.iconName}" → media #${media.id}`)
      }
    }

    const update: Record<string, unknown> = { icon: icon.id }

    if (item.cover) {
      const fs = await import('node:fs')
      let cover = (
        await payload.find({
          collection: 'media',
          where: { filename: { equals: item.cover.filename } },
          limit: 1,
          depth: 0,
        })
      ).docs[0]
      if (!cover) {
        const bytes = fs.readFileSync(item.cover.file)
        cover = await payload.create({
          collection: 'media',
          data: { alt: item.cover.alt },
          file: { data: bytes, name: item.cover.filename, mimetype: 'image/jpeg', size: bytes.length },
        })
        console.log(`uploaded cover #${cover.id} (${item.cover.filename}, ${(bytes.length / 1024) | 0} kB)`)
      }
      let background = (
        await payload.find({
          collection: 'backgrounds',
          where: { name: { equals: item.cover.backgroundName } },
          limit: 1,
          depth: 0,
        })
      ).docs[0]
      if (!background) {
        background = await payload.create({
          collection: 'backgrounds',
          data: { name: item.cover.backgroundName, type: 'upload', image: cover.id },
        })
        console.log(`created background #${background.id} "${item.cover.backgroundName}"`)
      }
      update.background = background.id
    }
    if (item.themeColor) update.themeColor = item.themeColor

    const previous = typeof chata.icon === 'object' ? chata.icon?.id : chata.icon
    await payload.update({
      collection: 'chatas',
      id: chata.id,
      data: update,
      depth: 0,
      context: { triggerAfterRead: false },
    })
    console.log(`chata "${chata.name}" → icon #${icon.id} "${item.iconName}" (was #${previous ?? 'none'})`)
  }

  console.log('Done.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
