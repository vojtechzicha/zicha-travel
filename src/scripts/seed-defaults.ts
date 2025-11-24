/**
 * Seed script to create default Background and Icon entries
 *
 * Usage:
 *   pnpm tsx src/scripts/seed-defaults.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function seedDefaults() {
  console.log('Starting seed...\n')

  const payload = await getPayload({ config })
  console.log('Payload initialized\n')

  // Check if defaults already exist
  const existingBackgrounds = await payload.find({
    collection: 'backgrounds',
    where: { isDefault: { equals: true } },
  })

  const existingIcons = await payload.find({
    collection: 'icons',
    where: { isDefault: { equals: true } },
  })

  // Create default background
  if (existingBackgrounds.docs.length === 0) {
    console.log('Creating default background...')
    await payload.create({
      collection: 'backgrounds',
      data: {
        name: 'Default',
        isDefault: true,
        type: 'url',
        url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2670&auto=format&fit=crop',
      },
    })
    console.log('  Default background created')
  } else {
    console.log('Default background already exists')
  }

  // Create default icon (upload the cottage SVG)
  if (existingIcons.docs.length === 0) {
    console.log('Creating default icon...')

    // First upload the SVG file
    const svgPath = path.resolve(__dirname, '../../public/favicon.svg')
    const svgBuffer = fs.readFileSync(svgPath)

    const uploadedMedia = await payload.create({
      collection: 'media',
      data: {
        alt: 'Default cottage icon',
      },
      file: {
        data: svgBuffer,
        mimetype: 'image/svg+xml',
        name: 'cottage-icon.svg',
        size: svgBuffer.length,
      },
    })

    // Then create the icon entry
    await payload.create({
      collection: 'icons',
      data: {
        name: 'Default (Cottage)',
        isDefault: true,
        svg: uploadedMedia.id,
      },
    })
    console.log('  Default icon created')
  } else {
    console.log('Default icon already exists')
  }

  console.log('\nSeed complete!')
  process.exit(0)
}

seedDefaults().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
