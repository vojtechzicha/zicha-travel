#!/usr/bin/env node
// One-time migration of uploaded files into Supabase Storage (S3).
// Cross-platform — run via `pnpm migrate:media <command>`.
//
// Context (docs/VERCEL_MIGRATION.md, Phase 1 step 4): all uploads so far
// went through the Fly deployment, which stores them on its local volume.
// The Vercel deployment serves uploads from the S3 bucket instead, so every
// `/api/media/file/*` request 500s there until the files exist in the
// bucket. This script fills the bucket WITHOUT needing Fly access: the
// files are publicly readable over HTTP from the live (Fly-served) site,
// so it enumerates the `media` and `expense-attachments` collections via
// the public REST API, downloads each original from the source deployment,
// and uploads it to the bucket under the key Payload's S3 plugin expects
// (`<filename>` for media, `expense-attachments/<filename>` for
// attachments — matching the plugin's `prefix` config).
//
// Commands:
//   pnpm migrate:media status   # list what is / isn't in the bucket (read-only)
//   pnpm migrate:media run      # upload everything missing (idempotent)
//
// Options:
//   --source=<url>   deployment to download from (default https://zicha.travel)
//   --verify=<url>   after `run`, GET each file from this deployment and
//                    require HTTP 200 (e.g. https://zicha-travel.vercel.app)
//   --overwrite      re-upload even when the object already exists
//
// Requires the S3_* vars from .env / .env.local (see .env.tpl and
// docs/ENVIRONMENT.md):
// S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
// The bucket must already exist (Supabase Dashboard → Storage → New bucket,
// public) — Supabase's S3 endpoint does not support CreateBucket.
//
// Idempotent: objects that already exist with the expected size are
// skipped, so it is safe to re-run (e.g. right before the DNS cutover to
// pick up files uploaded since the previous run).

import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

try {
  const { config: loadEnv } = await import('dotenv')
  loadEnv({ path: '.env.local' })
  loadEnv()
} catch {}

const args = process.argv.slice(2)
const command = args.find((a) => !a.startsWith('--'))
const opt = (name) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
    .replace(/\/+$/, '')
const source = opt('source') || 'https://zicha.travel'
const verifyTarget = opt('verify')
const overwrite = args.includes('--overwrite')

if (!['status', 'run'].includes(command)) {
  console.error('Usage: pnpm migrate:media status|run [--source=<url>] [--verify=<url>] [--overwrite]')
  process.exit(1)
}

const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter(
  (v) => !process.env[v],
)
if (missing.length) {
  console.error(`ERROR: missing env vars: ${missing.join(', ')} (see .env.tpl / docs/ENVIRONMENT.md)`)
  process.exit(1)
}

const bucket = process.env.S3_BUCKET
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: true, // Supabase Storage requires path-style URLs
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
})

// [collection slug, S3 key prefix] — prefixes must match the s3Storage()
// `collections` config in src/payload.config.ts
const COLLECTIONS = [
  ['media', ''],
  ['expense-attachments', 'expense-attachments/'],
]

async function fetchOk(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${init?.method || 'GET'} ${url} -> HTTP ${res.status}`)
  return res
}

async function listCollection(slug) {
  const docs = []
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const res = await fetchOk(`${source}/api/${slug}?limit=100&page=${page}&depth=0`)
    const data = await res.json()
    totalPages = data.totalPages
    docs.push(...data.docs)
  }
  return docs
}

async function bucketObjectSize(key) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return head.ContentLength ?? -1
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') return null
    throw err
  }
}

let uploaded = 0
let skipped = 0
const problems = []

for (const [slug, prefix] of COLLECTIONS) {
  const docs = await listCollection(slug)
  console.log(`\n${slug}: ${docs.length} document(s) on ${source}`)

  for (const doc of docs) {
    const key = `${prefix}${doc.filename}`
    const existingSize = await bucketObjectSize(key)
    const label = `  ${key} (${doc.filesize} B)`

    if (existingSize !== null && !overwrite) {
      if (existingSize === doc.filesize) {
        console.log(`${label}: already in bucket — skip`)
        skipped++
      } else {
        console.log(`${label}: SIZE MISMATCH in bucket (${existingSize} B) — re-run with --overwrite`)
        problems.push(key)
      }
      continue
    }

    if (command === 'status') {
      console.log(`${label}: MISSING from bucket`)
      problems.push(key)
      continue
    }

    const fileUrl = `${source}/api/${slug}/file/${encodeURIComponent(doc.filename)}`
    // A document row can outlive its file — a handful of older uploads 404 at
    // the source. Nothing to migrate for those, so record them and keep going
    // instead of aborting the whole run on the first one.
    let body
    try {
      body = Buffer.from(await (await fetchOk(fileUrl)).arrayBuffer())
    } catch (err) {
      console.log(`${label}: NOT AVAILABLE at source (${err.message}) — skipped`)
      problems.push(`source-missing:${key}`)
      continue
    }
    if (body.length !== doc.filesize) {
      console.log(`${label}: download size mismatch (got ${body.length} B) — NOT uploaded`)
      problems.push(key)
      continue
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: doc.mimeType || 'application/octet-stream',
      }),
    )
    console.log(`${label}: uploaded`)
    uploaded++

    if (verifyTarget) {
      const verifyUrl = `${verifyTarget}${doc.url}`
      const res = await fetch(verifyUrl)
      if (!res.ok) {
        console.log(`    verify ${verifyUrl} -> HTTP ${res.status}`)
        problems.push(`verify:${key}`)
      }
    }
  }
}

console.log(
  `\nDone: ${uploaded} uploaded, ${skipped} already present` +
    (problems.length ? `, ${problems.length} problem(s):\n  ${problems.join('\n  ')}` : ''),
)
process.exit(problems.length ? 1 : 0)
