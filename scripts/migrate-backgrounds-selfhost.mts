#!/usr/bin/env tsx
// One-off migration for compliance-gaps blocker 10 (decision 9): convert
// existing `type: 'url'` Background rows that point at an EXTERNAL http(s)
// host (e.g. images.unsplash.com) into self-hosted `type: 'upload'` rows.
// Each image is downloaded server-side (10 MB cap, image/* check) and stored
// as a `media` document via the same shared helper the Backgrounds
// beforeChange hook uses — the helper is called directly, so nothing depends
// on hooks firing.
//
// Idempotent: rows already `type: 'upload'` and url-type rows with a relative
// URL (e.g. /bg/mountains-1920.avif — already self-hosted) are skipped. The
// original external URL stays on the row as a provenance record (hidden in
// the admin once the type is 'upload').
//
// Run against production by pointing DATABASE_URI (and the S3_* storage vars,
// so the file lands in Supabase Storage) at the production project:
//
//   DATABASE_URI=postgresql://... pnpm backgrounds:selfhost
//
// Locally it picks up .env.local / .env like the other scripts. A row whose
// download fails is reported and left unchanged; re-run after fixing or
// replace the row manually in the admin.

import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv()
process.env.NODE_ENV = 'production'

async function main() {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config.js')
  const { isExternalImageUrl, selfHostImage, SelfHostImageError } = await import(
    '../src/utils/selfHostImage.js'
  )

  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'backgrounds',
    where: { type: { equals: 'url' } },
    depth: 0,
    limit: 0,
    pagination: false,
  })

  let converted = 0
  let skipped = 0
  let failed = 0

  for (const background of docs) {
    const label = `#${background.id} "${background.name}"`
    if (!isExternalImageUrl(background.url)) {
      console.log(`- ${label}: relative or empty URL (${background.url ?? '—'}), skipping`)
      skipped += 1
      continue
    }

    try {
      console.log(`- ${label}: fetching ${background.url} ...`)
      const mediaId = await selfHostImage(payload, {
        url: background.url,
        alt: background.name,
      })
      // The beforeChange hook sees `type: 'upload'` in this update and no-ops.
      await payload.update({
        collection: 'backgrounds',
        id: background.id,
        data: { type: 'upload', image: mediaId },
      })
      console.log(`  converted to upload (media ${mediaId})`)
      converted += 1
    } catch (err) {
      failed += 1
      const detail =
        err instanceof SelfHostImageError
          ? `${err.reason}: ${err.detail}`
          : err instanceof Error
            ? err.message
            : String(err)
      console.error(`  FAILED (${detail}) — row left unchanged`)
    }
  }

  console.log(
    `\nDone: ${converted} converted, ${skipped} skipped (already self-hosted), ${failed} failed.`,
  )
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
