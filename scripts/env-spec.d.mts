// Types for scripts/env-spec.mjs. The spec itself stays plain JavaScript so
// `pnpm env:check` can run under bare Node during the Vercel build, before
// anything is compiled — this file just gives TypeScript callers (the tests)
// the same shape.

export type EnvScope = 'server' | 'public'

/**
 * Only `dev` and `prod` have a committed template. `preview` is Vercel's
 * per-branch deployments, whose config lives in Vercel and is mirrored in the
 * `zicha-travel-preview` 1Password item, so a `preview` variable appears in
 * neither `.env.tpl` nor `.env.prod.tpl`.
 */
export type EnvEnvironment = 'dev' | 'prod' | 'preview'

export interface EnvVarSpec {
  name: string
  scope: EnvScope
  required?: boolean
  appliesTo?: EnvEnvironment[]
  description: string
  check?: (value: string) => string | null
}

export interface EnvGroupSpec {
  name: string
  members: string[]
  note: string
}

export const ENV_SPEC: EnvVarSpec[]
export const ENV_GROUPS: EnvGroupSpec[]
export const EXTERNAL_ENV: { platform: string[]; derived: string[]; scriptFlags: string[]; tooling: string[] }

export function envVarNames(environment: EnvEnvironment): string[]
export function present(env: Record<string, string | undefined>, name: string): string
export function validateEnv(
  env: Record<string, string | undefined>,
  environment?: EnvEnvironment,
): {
  errors: string[]
  warnings: string[]
}
