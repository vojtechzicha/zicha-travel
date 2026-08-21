# =============================================================================
# LOCAL DEVELOPMENT configuration.
#
#   pnpm env:pull        regenerates .env from this file via `op inject`
#
# Only real SECRETS are 1Password references; everything else is a literal, so a
# diff of this file shows actual configuration changes. .env is generated and
# gitignored — never edit it by hand, your change would be overwritten.
#
# Adding a variable? Add it to scripts/env-spec.mjs, here, and to
# .env.prod.tpl. tests/int/env.int.spec.ts fails until all three agree.
# A variable that only applies to Vercel PREVIEW deployments is the exception:
# mark it `appliesTo: ['preview']` in the spec and leave both templates alone.
#
# Full walkthrough, including the 1Password layout: docs/ENVIRONMENT.md
# =============================================================================

# -- Core ---------------------------------------------------------------------

# Local PostgreSQL from docker-compose.yml, started by `pnpm db` / `pnpm dev`.
# This is a literal on purpose: the default must never be able to reach prod.
DATABASE_URI=postgresql://payload:payload@localhost:5433/payload

PAYLOAD_SECRET=op://Development/zicha-travel-dev/PAYLOAD_SECRET

# -- Microsoft OAuth ----------------------------------------------------------
# Same Azure app registration as production; only the callback differs, and
# http://localhost:3000/api/auth/callback is already registered on it.
# Blank all four to fall back to Payload's email+password bootstrap login.

AZURE_CLIENT_ID=op://Development/zicha-travel-dev/AZURE_CLIENT_ID
AZURE_CLIENT_SECRET=op://Development/zicha-travel-dev/AZURE_CLIENT_SECRET
AZURE_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED=true

# -- Outgoing email -----------------------------------------------------------
# Empty API key = Payload logs magic-link emails to the dev-server console.
# Leave it that way locally; a real key would send real mail to real people.
#
# EMAIL_PREVIEW_TO is missing from this file on purpose. It only does something
# on Vercel PREVIEW deployments (src/lib/email.ts redirects all mail there), so
# it belongs to neither template. See scripts/env-spec.mjs.

RESEND_API_KEY=
EMAIL_FROM=
EMAIL_FROM_NAME=

# -- Sessions -----------------------------------------------------------------
# Empty = host-only cookies, which is what localhost needs.

SESSION_COOKIE_DOMAIN=

# -- Bot protection -----------------------------------------------------------
# Both empty disables Turnstile, so the login and claim forms submit without a
# challenge. To exercise it, set both together — Cloudflare's always-passes
# test widget works locally (the documented public pair in docs/ENVIRONMENT.md;
# the zicha-travel-dev item carries no Turnstile fields).

NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# -- Analytics ----------------------------------------------------------------
# Empty disables PostHog AND the cookie-consent banner. Setting the key locally
# is safe — capture requires NEXT_PUBLIC_VERCEL_ENV=production, so events are
# only logged to the console as "[analytika] …".

NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# -- Media storage ------------------------------------------------------------
# Empty S3_ENDPOINT = uploads go to the local media/ and expense-attachments/
# folders. That is the right default: it keeps dev uploads out of the
# production bucket, which has no separate dev prefix.

S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# -- Local tooling ------------------------------------------------------------

# `pnpm test:int` pins itself to the local docker instance when this is empty.
TEST_DATABASE_URI=

# Both are read ONLY by `pnpm migrate-from-prod` (a shell export beats the
# value here). Leave PROD_DATABASE_URI empty: the script resolves
# Development/zicha-travel-prod/DATABASE_URI from 1Password at run time, so
# production credentials never sit on disk.
PROD_DATABASE_URI=
PROD_SITE_URL=
