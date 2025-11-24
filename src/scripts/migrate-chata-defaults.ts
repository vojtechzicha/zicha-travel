/**
 * Migration script to set default background, icon, and theme color for existing Chatas
 *
 * Usage:
 *   pnpm tsx src/scripts/migrate-chata-defaults.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

async function migrateChataDefaults() {
  console.log('Starting migration...\n')

  const payload = await getPayload({ config })
  console.log('Payload initialized\n')

  // Get default background and icon
  const defaultBackground = await payload.find({
    collection: 'backgrounds',
    where: { isDefault: { equals: true } },
    limit: 1,
  })

  const defaultIcon = await payload.find({
    collection: 'icons',
    where: { isDefault: { equals: true } },
    limit: 1,
  })

  if (defaultBackground.docs.length === 0 || defaultIcon.docs.length === 0) {
    console.error('Default background or icon not found. Run seed-defaults.ts first.')
    process.exit(1)
  }

  const defaultBgId = defaultBackground.docs[0].id
  const defaultIconId = defaultIcon.docs[0].id

  console.log(`Default background ID: ${defaultBgId}`)
  console.log(`Default icon ID: ${defaultIconId}\n`)

  // Get all chatas
  const chatas = await payload.find({
    collection: 'chatas',
    limit: 1000,
    depth: 0,
  })

  console.log(`Found ${chatas.docs.length} chatas to check\n`)

  for (const chata of chatas.docs) {
    const updates: Record<string, unknown> = {}

    if (!chata.background) {
      updates.background = defaultBgId
    }
    if (!chata.icon) {
      updates.icon = defaultIconId
    }
    if (!chata.themeColor) {
      updates.themeColor = '#d97706'
    }

    if (Object.keys(updates).length > 0) {
      console.log(`Updating ${chata.name}...`)
      await payload.update({
        collection: 'chatas',
        id: chata.id,
        data: updates,
      })
      console.log(`  Updated with: ${JSON.stringify(updates)}`)
    } else {
      console.log(`${chata.name} - already configured`)
    }
  }

  console.log('\nMigration complete!')
  process.exit(0)
}

migrateChataDefaults().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
