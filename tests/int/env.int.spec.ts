import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

// Plain .mjs on purpose — it must load under bare Node in the Vercel build.
// Types come from scripts/env-spec.d.mts.
import { ENV_GROUPS, ENV_SPEC, EXTERNAL_ENV, envVarNames, validateEnv } from '../../scripts/env-spec.mjs'

const readTemplate = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8')

/** Uncommented KEY= lines, in file order. */
const templateKeys = (contents: string): string[] =>
  contents
    .split('\n')
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line.trim())?.[1])
    .filter((key): key is string => Boolean(key))

const DEV = readTemplate('.env.tpl')
const PROD = readTemplate('.env.prod.tpl')

describe('env templates match the spec', () => {
  it('.env.tpl declares exactly the variables that apply to dev', () => {
    expect(templateKeys(DEV).sort()).toEqual([...envVarNames('dev')].sort())
  })

  it('.env.prod.tpl declares exactly the variables that apply to prod', () => {
    expect(templateKeys(PROD).sort()).toEqual([...envVarNames('prod')].sort())
  })

  it('declares no variable twice', () => {
    for (const [file, keys] of [
      ['.env.tpl', templateKeys(DEV)],
      ['.env.prod.tpl', templateKeys(PROD)],
    ] as const) {
      expect(new Set(keys).size, `${file} repeats a key`).toBe(keys.length)
    }
  })

  it('keeps preview-only variables out of both templates', () => {
    // Vercel's preview deployments have no committed template: their values
    // live in Vercel and in the zicha-travel-preview 1Password item. A
    // preview-only variable in .env.tpl or .env.prod.tpl would be a value
    // nothing in that environment reads.
    const previewOnly = ENV_SPEC.filter(
      (spec) => spec.appliesTo?.length === 1 && spec.appliesTo[0] === 'preview',
    ).map((spec) => spec.name)
    expect(previewOnly).toContain('EMAIL_PREVIEW_TO')
    for (const name of previewOnly) {
      expect(templateKeys(DEV), `.env.tpl declares ${name}`).not.toContain(name)
      expect(templateKeys(PROD), `.env.prod.tpl declares ${name}`).not.toContain(name)
    }
  })

  it('gives every variable at least one environment', () => {
    for (const spec of ENV_SPEC) {
      expect(spec.appliesTo ?? ['dev', 'prod', 'preview'], spec.name).not.toEqual([])
    }
  })

  it('never declares a platform-provided, script-only or tooling variable', () => {
    const external = [...EXTERNAL_ENV.platform, ...EXTERNAL_ENV.scriptFlags, ...EXTERNAL_ENV.tooling]
    for (const keys of [templateKeys(DEV), templateKeys(PROD)]) {
      expect(keys.filter((key) => external.includes(key))).toEqual([])
    }
  })

  it('keeps production secrets out of the dev template', () => {
    // A dev value may reference the prod ITEM only through the documented
    // migrate-from-prod path, which resolves it at run time instead.
    expect(DEV).not.toContain('op://Development/zicha-travel-prod/')
  })

  it('never writes a secret reference outside an assignment', () => {
    // `op inject` substitutes EVERY op:// in the file, comments included, and
    // aborts the whole pull on one it cannot resolve. A comment that spells
    // the scheme out ("op:// references") is enough to break `pnpm env:pull`.
    for (const [file, contents] of [
      ['.env.tpl', DEV],
      ['.env.prod.tpl', PROD],
    ] as const) {
      const offenders = contents
        .split('\n')
        .filter((line) => line.includes('op://') && !/^[A-Z][A-Z0-9_]*=/.test(line.trim()))
      expect(offenders, `${file} mentions op:// outside a KEY= line`).toEqual([])
    }
  })

  it('resolves every op:// reference against the environment it belongs to', () => {
    // One vault for every project on this machine; the ITEM carries the
    // project and the environment, so vaults stay an access boundary rather
    // than a per-repo namespace.
    const refs = (contents: string) => contents.match(/op:\/\/\S+/g) ?? []
    for (const ref of refs(DEV)) expect(ref).toMatch(/^op:\/\/Development\/zicha-travel-dev\//)
    for (const ref of refs(PROD)) expect(ref).toMatch(/^op:\/\/Development\/zicha-travel-prod\//)
  })

  it('gives every spec entry a description', () => {
    for (const spec of ENV_SPEC) expect(spec.description.length, spec.name).toBeGreaterThan(20)
  })

  it('knows every environment variable the code reads', () => {
    // The spec claims to be the single source of truth; this is what actually
    // stops a variable being added "in code alone" (docs/ENVIRONMENT.md).
    // One-directional on purpose: every read must be declared, but a spec
    // entry may be read indirectly (shell scripts, `op` tooling).
    const known = new Set([...ENV_SPEC.map((s) => s.name), ...Object.values(EXTERNAL_ENV).flat()])
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.mts')) files.push(full)
      }
    }
    walk(path.join(process.cwd(), 'src'))
    walk(path.join(process.cwd(), 'scripts'))
    files.push(path.join(process.cwd(), 'next.config.mjs'), path.join(process.cwd(), 'vitest.setup.ts'))

    const undeclared = new Map<string, string>()
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|getRequiredEnv\('([A-Z][A-Z0-9_]*)'\)/g)) {
        const name = match[1] ?? match[2]
        if (!known.has(name)) undeclared.set(name, path.relative(process.cwd(), file))
      }
    }
    expect(
      [...undeclared].map(([name, file]) => `${name} (${file})`),
      'read by code but missing from ENV_SPEC / EXTERNAL_ENV in scripts/env-spec.mjs',
    ).toEqual([])
  })

  it('only groups variables that the spec knows about', () => {
    const names = ENV_SPEC.map((s) => s.name)
    for (const group of ENV_GROUPS) {
      for (const member of group.members) expect(names, group.name).toContain(member)
    }
  })
})

describe('validateEnv', () => {
  const valid = {
    DATABASE_URI: 'postgresql://payload:payload@localhost:5433/payload',
    PAYLOAD_SECRET: 'a'.repeat(32),
  }

  it('accepts the minimum viable configuration', () => {
    expect(validateEnv(valid)).toEqual({ errors: [], warnings: [] })
  })

  it('requires the two variables the app cannot start without', () => {
    const { errors } = validateEnv({})
    expect(errors).toHaveLength(2)
    expect(errors.join(' ')).toContain('DATABASE_URI')
    expect(errors.join(' ')).toContain('PAYLOAD_SECRET')
  })

  it('treats whitespace as absent', () => {
    expect(validateEnv({ ...valid, DATABASE_URI: '   ' }).errors.join(' ')).toContain('DATABASE_URI is required')
  })

  it('rejects a half-configured integration', () => {
    const { errors } = validateEnv({ ...valid, S3_ENDPOINT: 'https://example.supabase.co/storage/v1/s3' })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('S3_BUCKET')
    expect(errors[0]).toContain('S3_SECRET_ACCESS_KEY')
  })

  it('accepts a fully configured integration', () => {
    expect(
      validateEnv({
        ...valid,
        S3_ENDPOINT: 'https://example.supabase.co/storage/v1/s3',
        S3_REGION: 'eu-central-1',
        S3_BUCKET: 'media',
        S3_ACCESS_KEY_ID: 'key',
        S3_SECRET_ACCESS_KEY: 'secret',
      }).errors,
    ).toEqual([])
  })

  it('catches the OAuth trio that throws only at sign-in time', () => {
    const { errors } = validateEnv({ ...valid, AZURE_CLIENT_ID: 'id', AZURE_CLIENT_SECRET: 'secret' })
    expect(errors.join(' ')).toContain('AZURE_REDIRECT_URI')
  })

  it('warns when OAuth is configured but its button is hidden', () => {
    const { warnings } = validateEnv({
      ...valid,
      AZURE_CLIENT_ID: 'id',
      AZURE_CLIENT_SECRET: 'secret',
      AZURE_REDIRECT_URI: 'https://zicha.travel/api/auth/callback',
    })
    expect(warnings.join(' ')).toContain('NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED')
  })

  it('warns about a cookie domain that cannot reach chata subdomains', () => {
    expect(validateEnv({ ...valid, SESSION_COOKIE_DOMAIN: 'zicha.travel' }).warnings.join(' ')).toContain(
      'subdomains',
    )
    expect(validateEnv({ ...valid, SESSION_COOKIE_DOMAIN: '.zicha.travel' }).warnings).toEqual([])
  })

  it('rejects an unresolved op:// reference left by a hand-copied template', () => {
    // `cp .env.tpl .env` is a documented path (docs/ENVIRONMENT.md) — the
    // op:// strings it leaves behind are committed, public values. The one for
    // PAYLOAD_SECRET is long enough to pass the length check, so without this
    // rule a guessable session-signing secret gets an "Environment OK".
    const { errors } = validateEnv({
      ...valid,
      PAYLOAD_SECRET: 'op://Development/zicha-travel-dev/PAYLOAD_SECRET',
    })
    expect(errors.join(' ')).toContain('PAYLOAD_SECRET')
    expect(errors.join(' ')).toContain('unresolved 1Password reference')
  })

  it('validates against the given environment, so prod requirements skip dev', () => {
    // CRON_SECRET is required where the Vercel cron runs (prod and preview,
    // each with its own value) but has no business in a local .env.
    expect(validateEnv(valid).errors).toEqual([])
    expect(validateEnv(valid, 'prod').errors.join(' ')).toContain('CRON_SECRET is required')
    expect(validateEnv(valid, 'preview').errors.join(' ')).toContain('CRON_SECRET is required')
    expect(validateEnv({ ...valid, CRON_SECRET: 'cron-secret' }, 'prod').errors).toEqual([])
  })

  it('still validates the shared variables on preview', () => {
    // Previews share production data, so a spec with no explicit appliesTo
    // must be checked there too. Before this default, a preview with a broken
    // DATABASE_URI and a placeholder PAYLOAD_SECRET reported no errors at all
    // as long as CRON_SECRET was set.
    const errors = validateEnv(
      { CRON_SECRET: 'cron-secret', DATABASE_URI: 'bad', PAYLOAD_SECRET: '[SENSITIVE]' },
      'preview',
    ).errors.join(' ')
    expect(errors).toContain('DATABASE_URI')
    expect(errors).toContain('PAYLOAD_SECRET')
    expect(validateEnv({ ...valid, CRON_SECRET: 'cron-secret' }, 'preview').errors).toEqual([])
  })

  it('skips dev-only format checks for prod snapshots', () => {
    // TEST_DATABASE_URI only applies to dev; a prod check must not trip over it.
    const env = { ...valid, CRON_SECRET: 'cron-secret', TEST_DATABASE_URI: 'not-a-uri' }
    expect(validateEnv(env, 'prod').errors).toEqual([])
    expect(validateEnv(env).errors.join(' ')).toContain('TEST_DATABASE_URI')
  })

  it('warns when the Microsoft button is enabled without OAuth behind it', () => {
    // The reverse of the button-hidden warning, and the worse state: the
    // button renders and the provider throws on the first click.
    const { warnings } = validateEnv({ ...valid, NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED: 'true' })
    expect(warnings.join(' ')).toContain('the Microsoft button will render and fail')
  })

  it('fails when OAuth is configured but no provider button is enabled', () => {
    // Any configured provider turns off the local password strategy; with no
    // NEXT_PUBLIC_*_AUTH_ENABLED flag the login screens offer nothing that
    // works — a lockout, so an error rather than a warning (Codex review).
    const configured = {
      ...valid,
      AZURE_CLIENT_ID: 'id',
      AZURE_CLIENT_SECRET: 'secret',
      AZURE_REDIRECT_URI: 'https://zicha.travel/api/auth/callback',
    }
    expect(validateEnv(configured).errors.join(' ')).toContain('locking admins out')
    // One visible provider is enough — even a different one than the
    // configured pair is only the existing pairing warning, not a lockout.
    expect(
      validateEnv({ ...configured, NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED: 'true' }).errors,
    ).toEqual([])
    // No OAuth at all keeps the local password bootstrap: no error.
    expect(validateEnv(valid).errors).toEqual([])
  })

  it('rejects a non-https APPLE_REDIRECT_URI — Apple refuses http Return URLs', () => {
    const apple = {
      ...valid,
      CRON_SECRET: 'cron-secret',
      APPLE_CLIENT_ID: 'travel.zicha.signin',
      APPLE_TEAM_ID: 'TEAMID9999',
      APPLE_KEY_ID: 'KEYID88888',
      APPLE_PRIVATE_KEY: 'a'.repeat(32),
      NEXT_PUBLIC_APPLE_AUTH_ENABLED: 'true',
    }
    expect(
      validateEnv({ ...apple, APPLE_REDIRECT_URI: 'http://localhost:3000/api/auth/callback/apple' }, 'prod')
        .errors.join(' '),
    ).toContain('https')
    expect(
      validateEnv({ ...apple, APPLE_REDIRECT_URI: 'https://zicha.travel/api/auth/callback/apple' }, 'prod')
        .errors,
    ).toEqual([])
  })

  it('applies the button/backend pairing to Google and Apple too', () => {
    const google = validateEnv({ ...valid, NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: 'true' })
    expect(google.warnings.join(' ')).toContain('the Google button will render and fail')
    const apple = validateEnv(
      { ...valid, CRON_SECRET: 'cron-secret', NEXT_PUBLIC_APPLE_AUTH_ENABLED: 'true' },
      'prod',
    )
    expect(apple.warnings.join(' ')).toContain('the Apple button will render and fail')
  })

  it('rejects a half-configured Google or Apple provider', () => {
    const google = validateEnv({ ...valid, GOOGLE_CLIENT_ID: 'id' })
    expect(google.errors.join(' ')).toContain('GOOGLE_CLIENT_SECRET')
    const apple = validateEnv({ ...valid, CRON_SECRET: 'cron-secret', APPLE_CLIENT_ID: 'travel.zicha.signin' }, 'prod')
    expect(apple.errors.join(' ')).toContain('APPLE_PRIVATE_KEY')
  })

  it('keeps Apple out of local dev — its callbacks cannot be http or localhost', () => {
    // The Apple specs are prod+preview only, so .env.tpl must not declare
    // them (the template test above enforces that side). The all-or-nothing
    // group still applies everywhere: a half-set APPLE_* group is an error
    // even in dev, because the code would read it there too.
    const appleSpecs = ENV_SPEC.filter((spec) => spec.name.startsWith('APPLE_'))
    expect(appleSpecs.length).toBe(5)
    for (const spec of appleSpecs) expect(spec.appliesTo, spec.name).toEqual(['prod', 'preview'])
    expect(validateEnv({ ...valid, APPLE_CLIENT_ID: 'alone' }).errors.join(' ')).toContain('Apple OAuth')
  })

  it('rejects the placeholder `vercel env pull` writes for sensitive variables', () => {
    const { errors } = validateEnv({ ...valid, RESEND_API_KEY: '[SENSITIVE]' })
    expect(errors.join(' ')).toContain('RESEND_API_KEY')
    expect(errors.join(' ')).toContain('placeholder')
    // A required variable holding the placeholder is a failure, not a pass.
    expect(validateEnv({ ...valid, PAYLOAD_SECRET: '[SENSITIVE]' }).errors).toHaveLength(1)
  })

  it('rejects a malformed database URI', () => {
    expect(validateEnv({ ...valid, DATABASE_URI: 'localhost:5433' }).errors.join(' ')).toContain('DATABASE_URI')
  })

  it('never echoes a secret back in an error message', () => {
    const secret = 'super-secret-value-that-is-not-a-url'
    const { errors } = validateEnv({ ...valid, S3_ENDPOINT: secret })
    expect(errors.join(' ')).not.toContain(secret)
  })
})
