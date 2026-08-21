#!/usr/bin/env node
// Validates the deployment configuration against scripts/env-spec.mjs.
//
// Runs in the Vercel build (see the "vercel-build" script) so a variable that
// was added in code but never set in the Vercel project fails the build —
// and fails the pull request's own preview deployment first, which is where
// you want to find out. Locally: `pnpm env:check`.
//
// Reads the environment the way Next does for this project's files: real env
// vars win, then .env.local, then .env. (Next would also read
// .env.development/.env.production — this project never uses them.) Paths are
// resolved against the repo root, not the CWD, so the check works from
// anywhere.

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ENV_SPEC, EXTERNAL_ENV, present, validateEnv } from './env-spec.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

try {
  const { config: loadEnv } = await import('dotenv')
  loadEnv({ path: path.join(root, '.env.local') })
  loadEnv({ path: path.join(root, '.env') })
} catch {}

// A leftover .env.local from the pre-template era permanently shadows every
// `pnpm env:pull` — worth a note, since git ignores it and nothing else sees it.
if (existsSync(path.join(root, '.env.local'))) {
  console.warn('  note     .env.local exists and overrides the generated .env — leftover values there survive every `pnpm env:pull`.')
}

// prod / preview / dev decides which specs apply (e.g. CRON_SECRET is required
// on Vercel but has no business in a local .env).
const environment =
  process.env.VERCEL_ENV === 'production' ? 'prod' : process.env.VERCEL_ENV === 'preview' ? 'preview' : 'dev'

const { errors, warnings } = validateEnv(process.env, environment)

const configured = ENV_SPEC.filter((spec) => present(process.env, spec.name)).map((s) => s.name)
console.log(`Checked ${ENV_SPEC.length} variables (as ${environment}), ${configured.length} configured.`)

for (const warning of warnings) console.warn(`  warning  ${warning}`)
for (const error of errors) console.error(`  ERROR    ${error}`)

if (errors.length) {
  console.error(
    `\n${errors.length} problem(s) in the environment.` +
      `\nLocal: add the variable to .env.tpl and run \`pnpm env:pull\`.` +
      `\nVercel: Settings > Environment Variables, then redeploy.` +
      `\nPlatform-provided variables (${EXTERNAL_ENV.platform.join(', ')}) are never set here.`,
  )
  process.exit(1)
}

console.log(warnings.length ? 'Environment usable, with warnings above.' : 'Environment OK.')
