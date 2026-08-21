// The deployment configuration this app reads, in ONE place.
//
// Why plain .mjs and not src/lib/env.ts (where the other pure logic lives):
// `pnpm env:check` runs inside the Vercel build BEFORE next build compiles
// anything, so the spec has to be importable by bare Node with no loader and
// no type stripping. Vitest imports the same file, so the spec and its tests
// never drift.
//
// Adding a variable means: add it here, add it to .env.tpl and .env.prod.tpl
// (tests/int/env.int.spec.ts fails until all three agree), then put the value
// in 1Password and in Vercel. See docs/ENVIRONMENT.md.

/**
 * @typedef {Object} EnvVarSpec
 * @property {string} name
 * @property {'server' | 'public'} scope     `public` is inlined into the browser bundle at build time.
 * @property {boolean} [required]            The app cannot start without it.
 * @property {('dev' | 'prod' | 'preview')[]} [appliesTo] Defaults to ALL of
 *   dev, prod and preview — previews share production data, so an undeclared
 *   variable must still be validated there (required flags, format checks,
 *   the `[SENSITIVE]` placeholder). Narrow it only when a variable genuinely
 *   has no meaning in an environment.
 *   `preview` has no template of its own: Vercel holds those values and
 *   1Password mirrors them in the `-preview` item.
 * @property {string} description
 * @property {(value: string) => string | null} [check] Returns a problem, or null when fine.
 */

const isAbsoluteUrl = (value) => {
  try {
    const url = new URL(value)
    return Boolean(url.protocol && url.host)
  } catch {
    return false
  }
}

const mustBeUrl = (value) => (isAbsoluteUrl(value) ? null : 'must be an absolute URL')

const mustBeHttpsUrl = (value) => {
  if (!isAbsoluteUrl(value)) return 'must be an absolute URL'
  return new URL(value).protocol === 'https:' ? null : 'must be an https URL (Apple refuses http Return URLs)'
}

const mustBePostgres = (value) =>
  /^postgres(ql)?:\/\/.+@.+\/.+/.test(value)
    ? null
    : 'must look like postgresql://user:password@host:port/database'

const mustLookLikeEmail = (value) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? null : 'must be an email address')

/** @type {EnvVarSpec[]} */
export const ENV_SPEC = [
  // -- Core -----------------------------------------------------------------
  {
    name: 'DATABASE_URI',
    scope: 'server',
    required: true,
    description: 'PostgreSQL connection string. On Vercel this MUST be the Supabase pooler (port 6543).',
    check: mustBePostgres,
  },
  {
    name: 'PAYLOAD_SECRET',
    scope: 'server',
    required: true,
    description: 'Signs the payload-token session cookie and every magic-link / claim / expense-approval JWT.',
    check: (value) => (value.length >= 24 ? null : 'should be at least 24 characters'),
  },

  // -- Microsoft OAuth ------------------------------------------------------
  {
    name: 'AZURE_CLIENT_ID',
    scope: 'server',
    description: 'Azure app registration client ID. Setting this and the secret makes OAuth the only admin login.',
  },
  {
    name: 'AZURE_CLIENT_SECRET',
    scope: 'server',
    description: 'Azure client secret value.',
  },
  {
    name: 'AZURE_REDIRECT_URI',
    scope: 'server',
    description:
      'Fixed callback URL registered in Azure. The provider THROWS when OAuth is on and this is missing.',
    check: mustBeUrl,
  },
  {
    name: 'NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED',
    scope: 'public',
    description: 'Literal "true" to show the Microsoft button on the login screens.',
    check: (value) => (value === 'true' ? null : 'must be exactly "true" (or left empty)'),
  },

  // -- Google OAuth ---------------------------------------------------------
  {
    name: 'GOOGLE_CLIENT_ID',
    scope: 'server',
    description: 'Google Cloud OAuth client ID. Public: it appears in every OAuth redirect.',
  },
  {
    name: 'GOOGLE_CLIENT_SECRET',
    scope: 'server',
    description: 'Google Cloud OAuth client secret for the same client.',
  },
  {
    name: 'GOOGLE_REDIRECT_URI',
    scope: 'server',
    description:
      'Fixed callback URL (/api/auth/callback/google) registered on the Google OAuth client.',
    check: mustBeUrl,
  },
  {
    name: 'NEXT_PUBLIC_GOOGLE_AUTH_ENABLED',
    scope: 'public',
    description: 'Literal "true" to show the Google button on the login screens.',
    check: (value) => (value === 'true' ? null : 'must be exactly "true" (or left empty)'),
  },

  // -- Apple OAuth ----------------------------------------------------------
  // Sign in with Apple refuses http and localhost callbacks, so this
  // provider only exists on preview and production.
  {
    name: 'APPLE_CLIENT_ID',
    scope: 'server',
    appliesTo: ['prod', 'preview'],
    description: 'Apple Services ID identifier (e.g. travel.zicha.signin), not the App ID.',
  },
  {
    name: 'APPLE_TEAM_ID',
    scope: 'server',
    appliesTo: ['prod', 'preview'],
    description: 'Apple Developer Team ID (10 characters, top right of the developer portal).',
  },
  {
    name: 'APPLE_KEY_ID',
    scope: 'server',
    appliesTo: ['prod', 'preview'],
    description: 'Key ID of the "Sign in with Apple" private key (.p8) from the developer portal.',
  },
  {
    name: 'APPLE_PRIVATE_KEY',
    scope: 'server',
    appliesTo: ['prod', 'preview'],
    description:
      'The .p8 private key, base64-encoded to a single line (`base64 -i AuthKey_XXX.p8`); a raw PEM with "\\n" escapes works too.',
  },
  {
    name: 'APPLE_REDIRECT_URI',
    scope: 'server',
    appliesTo: ['prod', 'preview'],
    description:
      'Fixed callback URL (/api/auth/callback/apple) registered as a Return URL on the Services ID. Must be https.',
    check: mustBeHttpsUrl,
  },
  {
    name: 'NEXT_PUBLIC_APPLE_AUTH_ENABLED',
    scope: 'public',
    appliesTo: ['prod', 'preview'],
    description: 'Literal "true" to show the Apple button on the login screens.',
    check: (value) => (value === 'true' ? null : 'must be exactly "true" (or left empty)'),
  },

  // -- Outgoing email -------------------------------------------------------
  {
    name: 'RESEND_API_KEY',
    scope: 'server',
    description: 'Enables the Resend adapter. Empty (local dev) logs emails to the console instead.',
  },
  {
    name: 'EMAIL_FROM',
    scope: 'server',
    description: 'Sender address. Defaults to login@zicha.travel.',
    check: mustLookLikeEmail,
  },
  {
    name: 'EMAIL_FROM_NAME',
    scope: 'server',
    description: 'Sender display name. Defaults to zicha.travel.',
  },
  {
    name: 'EMAIL_PREVIEW_TO',
    scope: 'server',
    // Preview-only in Vercel, and meaningless anywhere else: src/lib/email.ts
    // consults it whenever VERCEL_ENV is set and not 'production'. Declaring it
    // in the dev or prod template would put a value in two snapshots that never
    // read it.
    appliesTo: ['preview'],
    description: 'Vercel PREVIEW deployments redirect all mail here. Empty on preview means mail is only logged.',
    check: mustLookLikeEmail,
  },

  // -- Sessions -------------------------------------------------------------
  {
    name: 'SESSION_COOKIE_DOMAIN',
    scope: 'server',
    description:
      'Cookie Domain shared by the session, consent and locale cookies. ".zicha.travel" in prod, empty locally.',
  },

  // -- Bot protection -------------------------------------------------------
  {
    name: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    scope: 'public',
    description: 'Cloudflare Turnstile site key for the login and claim forms.',
  },
  {
    name: 'TURNSTILE_SECRET_KEY',
    scope: 'server',
    description: 'Turnstile secret used to verify the token server-side.',
  },

  // -- Cron -----------------------------------------------------------------
  {
    name: 'CRON_SECRET',
    scope: 'server',
    // Preview carries its OWN value (see docs/ENVIRONMENT.md), so a leaked
    // preview secret cannot drive the production cron. Required: without it
    // the daily reminder job silently starts returning 401.
    appliesTo: ['prod', 'preview'],
    required: true,
    description:
      'Vercel sends it as "Authorization: Bearer …" to /api/claim-requests/remind. Without it only superadmins can call it.',
  },

  // -- Analytics ------------------------------------------------------------
  {
    name: 'NEXT_PUBLIC_POSTHOG_KEY',
    scope: 'public',
    description: 'Enables PostHog AND the cookie-consent banner. Capture still only happens on production.',
  },
  {
    name: 'NEXT_PUBLIC_POSTHOG_HOST',
    scope: 'public',
    description: 'Overrides the first-party /ingest proxy. Only set this to debug.',
    check: mustBeUrl,
  },

  // -- Media storage --------------------------------------------------------
  {
    name: 'S3_ENDPOINT',
    scope: 'server',
    description: 'S3-compatible endpoint (Supabase Storage). Empty falls back to local-disk uploads.',
    check: mustBeUrl,
  },
  {
    name: 'S3_REGION',
    scope: 'server',
    description: 'Bucket region. Supabase ignores it, but the AWS SDK refuses to sign a request without one.',
  },
  {
    name: 'S3_BUCKET',
    scope: 'server',
    description: 'Bucket holding both media and expense-attachments (the latter under its own prefix).',
  },
  {
    name: 'S3_ACCESS_KEY_ID',
    scope: 'server',
    description: 'S3 access key ID from Supabase Project Settings > Storage > S3 connection.',
  },
  {
    name: 'S3_SECRET_ACCESS_KEY',
    scope: 'server',
    description: 'S3 secret access key issued alongside the access key ID.',
  },

  // -- Local tooling only ---------------------------------------------------
  {
    name: 'TEST_DATABASE_URI',
    scope: 'server',
    appliesTo: ['dev'],
    description: 'Database for `pnpm test:int`. Empty uses the local docker-compose instance.',
    check: mustBePostgres,
  },
  {
    name: 'PROD_DATABASE_URI',
    scope: 'server',
    appliesTo: ['dev'],
    description:
      'Read ONLY by `pnpm migrate-from-prod`. Leave empty: the script resolves it from 1Password on demand so prod credentials never sit in .env.',
    check: mustBePostgres,
  },
  {
    name: 'PROD_SITE_URL',
    scope: 'server',
    appliesTo: ['dev'],
    description: 'Source of the uploaded files for `pnpm migrate-from-prod`. Defaults to https://zicha.travel.',
    check: mustBeUrl,
  },
]

/**
 * All-or-nothing groups: a half-configured integration fails at runtime in a
 * much less obvious place than at build time.
 * @type {{name: string, members: string[], note: string}[]}
 */
export const ENV_GROUPS = [
  {
    name: 'Microsoft OAuth',
    members: ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_REDIRECT_URI'],
    note: 'the provider throws on the first sign-in attempt otherwise',
  },
  {
    name: 'Google OAuth',
    members: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    note: 'the provider throws on the first sign-in attempt otherwise',
  },
  {
    name: 'Apple OAuth',
    members: ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_REDIRECT_URI'],
    note: 'the provider throws on the first sign-in attempt otherwise',
  },
  {
    name: 'Cloudflare Turnstile',
    members: ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'],
    note: 'the widget would render but never verify, or verify with no widget to solve',
  },
  {
    name: 'S3 media storage',
    members: ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
    note: 'the plugin activates on S3_ENDPOINT alone and then fails every upload',
  },
]

/**
 * Supplied by the platform, by a one-off command, or by machine-level tooling —
 * never written to .env, so the templates must NOT list them.
 */
export const EXTERNAL_ENV = {
  platform: ['NODE_ENV', 'PORT', 'CI', 'VERCEL', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_SHA', 'NEXT_PUBLIC_VERCEL_ENV'],
  // Computed by next.config.mjs at build time (from the git commit) and baked
  // into the bundle — nobody ever sets it, so no template may list it.
  derived: ['NEXT_PUBLIC_BUILD_ID'],
  scriptFlags: ['SITE', 'OUT', 'EMIT_ONLY', 'REVERT', 'SEED_SALT', 'DEBUG_MIDDLEWARE'],
  // A 1Password service-account token in a generated .env would sit on every
  // dev machine — it belongs in the shell profile (docs/ENVIRONMENT.md).
  tooling: ['OP_SERVICE_ACCOUNT_TOKEN'],
}

const DEFAULT_APPLIES_TO = ['dev', 'prod', 'preview']

const appliesTo = (spec, environment) => (spec.appliesTo ?? DEFAULT_APPLIES_TO).includes(environment)

/** Variable names that belong in the template for the given environment. */
export function envVarNames(environment) {
  return ENV_SPEC.filter((spec) => appliesTo(spec, environment)).map((s) => s.name)
}

/** The single definition of "is this variable set" — check-env.mjs uses it too. */
export const present = (env, name) => (env[name] ?? '').trim()

/** What `vercel env pull` writes instead of a value it is not allowed to read. */
const PULLED_PLACEHOLDER = '[SENSITIVE]'

/**
 * @param {Record<string, string | undefined>} env
 * @param {'dev' | 'prod' | 'preview'} [environment] Which environment this env
 *   snapshot belongs to. Specs whose `appliesTo` excludes it are skipped, so a
 *   variable can be `required` in prod without failing every dev check.
 *   Defaults to 'dev' — the local `pnpm env:check` case.
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateEnv(env, environment = 'dev') {
  const errors = []
  const warnings = []

  for (const spec of ENV_SPEC) {
    if (!appliesTo(spec, environment)) continue
    const value = present(env, spec.name)
    if (!value) {
      if (spec.required) errors.push(`${spec.name} is required. ${spec.description}`)
      continue
    }
    // `vercel env pull` writes this placeholder for variables marked
    // "Sensitive" — their real values can never be read back out of Vercel.
    // Copied into 1Password unnoticed, it produces an .env that looks fully
    // configured and fails at the provider instead.
    if (value === PULLED_PLACEHOLDER) {
      errors.push(
        `${spec.name} is the literal "${PULLED_PLACEHOLDER}" placeholder from \`vercel env pull\`, not a real value. Take it from the provider that issued it.`,
      )
      continue
    }
    // A hand-copied template (`cp .env.tpl .env`, the documented no-1Password
    // path) leaves 1Password references as values. They must never pass: the
    // op:// string for PAYLOAD_SECRET is committed, public, and long enough to
    // satisfy the length check — a guessable session-signing secret.
    if (value.startsWith('op://')) {
      errors.push(
        `${spec.name} is an unresolved 1Password reference. Run \`pnpm env:pull\` (op inject), or replace the reference with the real value.`,
      )
      continue
    }
    // The value itself is never echoed: half of these are secrets, and the
    // name plus the rule is enough to fix the problem.
    const problem = spec.check?.(value)
    if (problem) errors.push(`${spec.name} ${problem}.`)
  }

  for (const group of ENV_GROUPS) {
    const set = group.members.filter((name) => present(env, name))
    if (set.length === 0 || set.length === group.members.length) continue
    const missing = group.members.filter((name) => !present(env, name))
    errors.push(`${group.name}: set all of these or none. Missing ${missing.join(', ')} — ${group.note}.`)
  }

  // Each OAuth provider pairs backend credentials with a public button flag.
  // Off-by-one states are only warnings, but the flag-without-backend one is
  // the worse of the two: the button renders and throws on the first click.
  const oauthPairs = [
    {
      label: 'Microsoft',
      flag: 'NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED',
      prefix: 'AZURE_*',
      on: present(env, 'AZURE_CLIENT_ID') && present(env, 'AZURE_CLIENT_SECRET'),
    },
    {
      label: 'Google',
      flag: 'NEXT_PUBLIC_GOOGLE_AUTH_ENABLED',
      prefix: 'GOOGLE_*',
      on: present(env, 'GOOGLE_CLIENT_ID') && present(env, 'GOOGLE_CLIENT_SECRET'),
    },
    {
      label: 'Apple',
      flag: 'NEXT_PUBLIC_APPLE_AUTH_ENABLED',
      prefix: 'APPLE_*',
      on:
        present(env, 'APPLE_CLIENT_ID') &&
        present(env, 'APPLE_TEAM_ID') &&
        present(env, 'APPLE_KEY_ID') &&
        present(env, 'APPLE_PRIVATE_KEY'),
    },
  ]
  for (const { label, flag, prefix, on } of oauthPairs) {
    if (on && present(env, flag) !== 'true') {
      warnings.push(
        `${label} OAuth is configured but ${flag} is not "true", so no ${label} sign-in button will be shown.`,
      )
    }
    if (!on && present(env, flag) === 'true') {
      warnings.push(
        `${flag} is "true" but ${label} OAuth is not configured — the ${label} button will render and fail at sign-in. Blank the flag together with the ${prefix} secrets.`,
      )
    }
  }
  // Configured-but-invisible OAuth is a lockout, not a cosmetic problem: any
  // configured provider disables Payload's local password strategy, and with
  // no flag set the login screens render either no button at all or a dead
  // password form — superadmins (whose magic links are refused) would have
  // no working way in. Fail the build rather than deploy that state.
  const anyOAuthConfigured = oauthPairs.some((pair) => pair.on)
  const anyOAuthVisible = oauthPairs.some((pair) => present(env, pair.flag) === 'true')
  if (anyOAuthConfigured && !anyOAuthVisible) {
    errors.push(
      'OAuth credentials are configured but no NEXT_PUBLIC_*_AUTH_ENABLED flag is "true" — local password login is disabled and no sign-in button would render, locking admins out. Enable at least one provider flag (or remove all OAuth credentials).',
    )
  }

  const cookieDomain = present(env, 'SESSION_COOKIE_DOMAIN')
  if (cookieDomain && !cookieDomain.startsWith('.')) {
    warnings.push(
      `SESSION_COOKIE_DOMAIN is "${cookieDomain}" — without a leading dot the session will not reach chata subdomains.`,
    )
  }

  return { errors, warnings }
}
