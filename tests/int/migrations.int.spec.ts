import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards the "Schema changes — binding rule" in CLAUDE.md: schema changes are
// Payload migrations in src/migrations only. The hand-maintained DDL scheme
// (NEW_SCHEMA_DDL in scripts/migrate-payer-polymorphic.mjs, `migrate:payer`)
// was retired on 2026-11-01 and must not come back.

const root = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

function filesUnder(rel: string): string[] {
  const dir = path.join(root, rel)
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    const relPath = path.join(rel, name)
    return statSync(full).isDirectory() ? filesUnder(relPath) : [relPath]
  })
}

describe('schema migrations', () => {
  it('keeps the old DDL script and its command retired', () => {
    expect(existsSync(path.join(root, 'scripts/migrate-payer-polymorphic.mjs'))).toBe(false)
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>
    expect(scripts['migrate:payer']).toBeUndefined()
    expect(Object.values(scripts).join('\n')).not.toMatch(/migrate-payer-polymorphic/)
  })

  it('applies Payload migrations, then the upkeep script, before the build', () => {
    const build = JSON.parse(read('package.json')).scripts['vercel-build'] as string
    const steps = build.split('&&').map((s) => s.trim())
    const migrate = steps.indexOf('pnpm migrate')
    const upkeep = steps.indexOf('node scripts/db-post-migrate.mjs')
    const next = steps.indexOf('pnpm build')
    expect(migrate).toBeGreaterThan(-1)
    expect(upkeep).toBeGreaterThan(migrate)
    expect(next).toBeGreaterThan(upkeep)
  })

  it('has no hand-maintained schema DDL outside src/migrations', () => {
    const code = [...filesUnder('src'), ...filesUnder('scripts')].filter(
      (f) => /\.(m?[jt]sx?|cjs|sql)$/.test(f) && !f.startsWith(path.join('src', 'migrations')),
    )
    const offenders = code.filter((f) => read(f).includes('NEW_SCHEMA_DDL'))
    expect(offenders).toEqual([])
  })

  it('keeps db-post-migrate.mjs free of schema changes', () => {
    // Per-deploy data upkeep only. Its one structural statement is enabling
    // RLS on existing tables, which is allowed.
    const src = read('scripts/db-post-migrate.mjs').replace(/ALTER TABLE [^`\n]*ENABLE ROW LEVEL SECURITY/g, '')
    expect(src).not.toMatch(/\b(CREATE|ALTER|DROP)\s+(TABLE|TYPE|INDEX|SCHEMA|SEQUENCE|VIEW)\b/i)
    expect(src).not.toMatch(/\bADD\s+COLUMN\b/i)
  })

  it('registers every migration file in src/migrations/index.ts', () => {
    const index = read('src/migrations/index.ts')
    const migrations = readdirSync(path.join(root, 'src/migrations'))
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => f.replace(/\.ts$/, ''))
    expect(migrations.length).toBeGreaterThan(0)
    for (const name of migrations) {
      expect(index).toContain(`name: '${name}'`)
    }
  })
})
