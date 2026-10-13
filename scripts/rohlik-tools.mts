#!/usr/bin/env tsx
// Prints what the official Rohlík MCP server offers to a connected account:
// tools/list (names, descriptions, input schemas) and the RAW result of a
// sample product search, plus what normalizeProducts makes of it. Run it
// when Rohlík changes something: it says whether the tools pinned in
// src/lib/rohlik/mcp.ts (ROHLIK_TOOLS) still exist.
//
// LOCAL ONLY. Connect first: as the chata's banker, open the "Nákup" tab on
// the local dev server and click "Propojit s Rohlíkem". Then:
//
//   pnpm exec tsx scripts/rohlik-tools.mts <userId> [query]
//
// <userId> is the users.id of the connected account; query defaults to
// "mléko". Refuses any non-localhost DATABASE_URI. Never prints tokens.

import { config as loadEnv } from 'dotenv'
import path from 'node:path'

loadEnv({ path: '.env.local' })
loadEnv()

const dbHost = new URL(process.env.DATABASE_URI ?? 'postgres://invalid').hostname
if (!['localhost', '127.0.0.1'].includes(dbHost)) {
  console.error(`Refusing to run against ${dbHost}: local database only`)
  process.exit(1)
}

const [userIdArg, queryArg] = process.argv.slice(2)
if (!userIdArg) {
  console.error('Usage: pnpm exec tsx scripts/rohlik-tools.mts <userId> [query]')
  process.exit(1)
}
const query = queryArg ?? 'mléko'

async function main() {
  const { getPayload } = await import('payload')
  const { default: config } = await import(path.join(process.cwd(), 'src/payload.config.ts'))
  const { getAccessToken } = await import(path.join(process.cwd(), 'src/utils/rohlikConnection.ts'))
  const { ROHLIK_TOOLS, callTool, listTools, normalizeProducts, searchArgs } = await import(
    path.join(process.cwd(), 'src/lib/rohlik/mcp.ts')
  )
  const payload = await getPayload({ config })

  const token: string | null = await getAccessToken(payload, userIdArg)
  if (!token) {
    console.error(
      `User ${userIdArg} has no usable Rohlík connection — connect from the Nákup tab first`,
    )
    process.exit(1)
  }

  const tools = await listTools(token)
  console.log(`\n=== tools/list (${tools.length}) ===`)
  for (const tool of tools) {
    console.log(`\n# ${tool.name}`)
    if (tool.description) console.log(tool.description)
    console.log(JSON.stringify(tool.inputSchema ?? {}, null, 2))
  }

  // the pinned tools must still exist — Rohlík calls the server experimental
  console.log('\n=== pinned tools ===')
  for (const name of Object.values(ROHLIK_TOOLS)) {
    console.log(`${name}: ${tools.some((tool) => tool.name === name) ? 'present' : 'MISSING'}`)
  }

  const args = searchArgs(query)
  console.log(`\n=== ${ROHLIK_TOOLS.search}(${JSON.stringify(args)}) raw result ===`)
  const result = await callTool(token, ROHLIK_TOOLS.search, args)
  console.log(JSON.stringify(result, null, 2).slice(0, 20000))
  console.log('\n=== normalizeProducts ===')
  console.log(JSON.stringify(normalizeProducts(result), null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
