# =============================================================================
# PRODUCTION configuration — the reference copy of what Vercel should hold.
#
#   pnpm env:pull:prod   writes .env.prod from this file via `op inject`
#
# Vercel remains the source of truth for the running deployment; this file
# exists so the values are recoverable, diffable, and ready if the hosting or
# a provider ever changes. .env.prod is gitignored and holds LIVE production
# secrets — generate it when you need it, delete it when you are done.
#
# It is NOT loaded by anything automatically. Nothing reads .env.prod unless
# you point a command at it explicitly.
#
# PREVIEW deployments are a third environment with no template of their own:
# Vercel holds those values and 1Password mirrors them in zicha-travel-preview.
# Most of them are the same rows as production; the differences are listed in
# docs/ENVIRONMENT.md.
#
# Full walkthrough, including the 1Password layout: docs/ENVIRONMENT.md
# =============================================================================

# -- Core ---------------------------------------------------------------------
# Must be the Supabase POOLER connection (…pooler.supabase.com:6543). The
# direct :5432 connection exhausts its connection limit under serverless.

DATABASE_URI=op://Development/zicha-travel-prod/DATABASE_URI
PAYLOAD_SECRET=op://Development/zicha-travel-prod/PAYLOAD_SECRET

# -- Microsoft OAuth ----------------------------------------------------------
# The callback is fixed on the apex: Azure sends every sign-in here, whichever
# chata subdomain it started from, and the callback redirects back afterwards.
# Google and Apple below follow the same pattern on their own callback paths.

AZURE_CLIENT_ID=op://Development/zicha-travel-prod/AZURE_CLIENT_ID
AZURE_CLIENT_SECRET=op://Development/zicha-travel-prod/AZURE_CLIENT_SECRET
AZURE_REDIRECT_URI=https://zicha.travel/api/auth/callback
NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED=true

# -- Google OAuth -------------------------------------------------------------

GOOGLE_CLIENT_ID=op://Development/zicha-travel-prod/GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=op://Development/zicha-travel-prod/GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://zicha.travel/api/auth/callback/google
NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true

# -- Apple OAuth --------------------------------------------------------------
# APPLE_CLIENT_ID is the Services ID identifier, not the App ID. The private
# key is the .p8 from the developer portal, base64-encoded to a single line
# (base64 -i AuthKey_XXX.p8) so it survives env-file round-trips.

APPLE_CLIENT_ID=op://Development/zicha-travel-prod/APPLE_CLIENT_ID
APPLE_TEAM_ID=op://Development/zicha-travel-prod/APPLE_TEAM_ID
APPLE_KEY_ID=op://Development/zicha-travel-prod/APPLE_KEY_ID
APPLE_PRIVATE_KEY=op://Development/zicha-travel-prod/APPLE_PRIVATE_KEY
APPLE_REDIRECT_URI=https://zicha.travel/api/auth/callback/apple
NEXT_PUBLIC_APPLE_AUTH_ENABLED=true

# -- Outgoing email -----------------------------------------------------------
# EMAIL_PREVIEW_TO is absent on purpose: it only does anything on PREVIEW
# deployments, where src/lib/email.ts redirects every send there instead of to
# the real recipient. Vercel scopes it to Preview, and 1Password keeps it in
# the zicha-travel-preview item.

RESEND_API_KEY=op://Development/zicha-travel-prod/RESEND_API_KEY
# EMAIL_FROM IS set in Vercel — the code fallback is login@zicha.travel, not
# this address, so deleting the Vercel row would silently change the sender.
EMAIL_FROM=info-noreply@zicha.travel
# EMAIL_FROM_NAME is not set in Vercel; this value is the same fallback
# payload.config.ts already applies, so behaviour matches either way.
EMAIL_FROM_NAME=zicha.travel

# -- Sessions -----------------------------------------------------------------
# The leading dot is required: one sign-in has to work on the apex and on
# every chata subdomain, and OAuth started on a subdomain depends on it.

SESSION_COOKIE_DOMAIN=.zicha.travel

# -- Bot protection -----------------------------------------------------------

NEXT_PUBLIC_TURNSTILE_SITE_KEY=op://Development/zicha-travel-prod/NEXT_PUBLIC_TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY=op://Development/zicha-travel-prod/TURNSTILE_SECRET_KEY

# -- Cron ---------------------------------------------------------------------
# Vercel sends this automatically as a Bearer token to the daily
# /api/claim-requests/remind job declared in vercel.json.

CRON_SECRET=op://Development/zicha-travel-prod/CRON_SECRET

# -- Analytics ----------------------------------------------------------------
# NEXT_PUBLIC_POSTHOG_HOST stays empty so the browser talks to the first-party
# /ingest proxy rewritten in next.config.mjs.

NEXT_PUBLIC_POSTHOG_KEY=op://Development/zicha-travel-prod/NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST=

# -- Media storage ------------------------------------------------------------
# Supabase Storage, S3-compatible. Project Settings > Storage > S3 connection.

S3_ENDPOINT=op://Development/zicha-travel-prod/S3_ENDPOINT
S3_REGION=op://Development/zicha-travel-prod/S3_REGION
S3_BUCKET=op://Development/zicha-travel-prod/S3_BUCKET
S3_ACCESS_KEY_ID=op://Development/zicha-travel-prod/S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY=op://Development/zicha-travel-prod/S3_SECRET_ACCESS_KEY
