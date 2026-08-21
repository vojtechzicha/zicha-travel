# Environment configuration

`.env` is never committed and never copied between machines. What git carries
is a template listing every variable the code reads, with a literal value
wherever the value is not secret. You produce your own `.env` from it, either
by hand or with 1Password.

```
.env.tpl  ──op inject──▶  .env       local development   (gitignored)
.env.prod.tpl ─────────▶  .env.prod  production reference (gitignored)
scripts/env-spec.mjs  ─▶  the list of variables that exist, and their rules
```

| File | Committed | What it is |
| --- | --- | --- |
| `.env.tpl` | yes | Local dev config. Literals for everything non-secret, `op://` references for the rest. |
| `.env.prod.tpl` | yes | The same variables with production values. A recoverable copy of what Vercel holds. |
| `scripts/env-spec.mjs` | yes | Every variable the code reads, whether it is required, and the all-or-nothing groups. |
| `.env` | no | Yours. Loaded automatically by Next, Payload and the scripts. |
| `.env.prod` | no | Generated on demand. Live production secrets. Read by nothing automatically. |

`DATABASE_URI` in `.env.tpl` is a literal pointing at the local Docker
database. That is deliberate: the default must not be able to reach
production.

### Three environments, two templates

Local development and production each have a template. Vercel's preview
deployments are the third environment and have none, because nobody generates
a `.env` for them: Vercel injects the values at build time, and 1Password keeps
a recoverable copy in the `zicha-travel-preview` item. Most preview values are
the same Vercel rows as production, so duplicating them into a third template
would mean maintaining the same secret in two places.

A variable can therefore belong to any of the three, which is what `appliesTo`
in `scripts/env-spec.mjs` records. `EMAIL_PREVIEW_TO` is the current example of
a preview-only one: `src/lib/email.ts` reads it whenever `VERCEL_ENV` is set
and not `production` and redirects every outgoing mail there,
so a value for it in `.env` or `.env.prod` would sit unread. It is absent from
both templates on purpose, both templates say so, and a test keeps it that
way.

## Getting a working .env

### By hand

Nothing here depends on 1Password. Copy the template and fill it in:

```bash
cp .env.tpl .env
pnpm env:check     # says what is missing or contradictory
pnpm dev
```

Every line that reads `op://…` is a placeholder for a value you supply.
Replace it with the real one, or leave it empty if you can live without that
integration, and keep the literals as they are. Locally most of the file can
stay empty: with no `RESEND_API_KEY` the dev server prints magic-link emails to
the console, with no Turnstile keys the login and claim forms skip the bot
check, with no `S3_ENDPOINT` uploads go to local folders, and with no PostHog
key both analytics and the cookie banner disappear. Two values the app will
not start without: `DATABASE_URI` and `PAYLOAD_SECRET`. Generate the second one
with `openssl rand -base64 32`.

Microsoft sign-in needs the four `AZURE_*` lines. Leave them blank and Payload
falls back to email and password login, which is enough to get into the admin
panel.

### With 1Password

This project keeps the secrets in 1Password and generates `.env` from the
template, so a new machine needs no hand-editing and no file transfer:

```bash
git clone …
pnpm install
op signin
pnpm env:pull      # writes .env
pnpm env:check
pnpm dev
```

`op inject` resolves every reference in the file and refuses to write anything
if one of them fails, so a broken pull cannot leave a half-written `.env`
behind.

Two leftovers from the pre-template era to check for on an upgraded machine:
an old `.env` (it used to hold the PRODUCTION database URI — run
`pnpm env:pull` before the first `pnpm dev` so the dev schema push cannot
reach prod) and an old `.env.local` (it silently overrides the generated
`.env` forever; `pnpm env:check` prints a note when one exists — delete it).

## Authorizing op without a prompt per command

With only the desktop app integration, every `op` invocation asks for
biometrics or a PIN, which makes scripted use painful. A service account
authenticates by token instead, and can be scoped to a single vault:

```bash
op service-account create dev-machine --vault "Development:read_items,write_items"
```

Store the token it prints once, in `OP_SERVICE_ACCOUNT_TOKEN`. `pnpm env:pull`
then runs without interaction.

While that variable is set, every `op` command uses the service account and
sees only the vault it was granted. To act as yourself for one command, clear
it for that invocation: `OP_SERVICE_ACCOUNT_TOKEN= op …` on POSIX shells, or
`env -u OP_SERVICE_ACCOUNT_TOKEN op …`. A service account cannot read Personal
or Private vaults at all, which is the reason project config does not live in
those.

## The 1Password layout

One vault, `Development`, holds the config for every project rather than one
vault per repository. A vault is an access boundary, deciding who and what can
read its contents, not a namespace. Splitting per repository multiplies the
sharing decisions without separating anything, and a service account for CI
would have to be granted each vault separately. Keeping app config out of
`Personal` is the separation that pays off.

The item carries the project and the environment, as `<repo>-dev`,
`<repo>-preview` and `<repo>-prod`, all category Secure Note:

```
Development
├── zicha-travel-dev        3 fields
├── zicha-travel-preview   16 fields
├── zicha-travel-prod      14 fields
└── …-dev / …-prod for every other project
```

Each item is a complete snapshot of one environment, so switching hosting or
rotating a provider means reading one item instead of hunting through a
password manager.

Add each value as a custom field whose label is exactly the variable name.
That is what makes `op://Development/zicha-travel-prod/DATABASE_URI` resolve.
Use the password field type for secrets, since it stays concealed in the UI,
and text for the rest.

Renaming the vault or an item breaks `pnpm env:pull` for everyone: the
references are literals in the committed templates, and
`tests/int/env.int.spec.ts` pins the expected prefix.
`scripts/migrate-from-prod.sh` hardcodes the prod `DATABASE_URI` path too.
Change the templates, that test and that script in the same commit.

### Item zicha-travel-dev

| Field label | Where the value comes from |
| --- | --- |
| `PAYLOAD_SECRET` | A fresh one, unrelated to production: `openssl rand -base64 32` |
| `AZURE_CLIENT_ID` | Same Azure app registration as production |
| `AZURE_CLIENT_SECRET` | Same Azure app registration as production |

The Azure pair is duplicated from `zicha-travel-prod` on purpose, so that each
item stays a self-contained snapshot of one environment.

### Item zicha-travel-prod

| Field label | Where the value comes from |
| --- | --- |
| `DATABASE_URI` | Supabase pooler, port 6543. The direct 5432 connection exhausts its limit under serverless. |
| `PAYLOAD_SECRET` | Rotating this invalidates every session and every outstanding magic link, claim link and expense-approval link. |
| `AZURE_CLIENT_ID` | Azure portal, app registration overview. Public: it appears in every OAuth redirect. |
| `AZURE_CLIENT_SECRET` | Azure portal. Existing secrets cannot be read again; add a second one and update Vercel. |
| `RESEND_API_KEY` | Resend, API Keys. Existing keys cannot be read again either. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare, Turnstile, the widget. Public. |
| `TURNSTILE_SECRET_KEY` | The same widget. Readable in the Cloudflare dashboard. |
| `CRON_SECRET` | Any random string, but Vercel must send the same one, so change both together or the daily reminder job starts returning 401. |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog, project settings. Public: it ships to browsers. |
| `S3_ENDPOINT` | Supabase, Project Settings, Storage, S3 connection |
| `S3_REGION` | The same screen |
| `S3_BUCKET` | The same screen |
| `S3_ACCESS_KEY_ID` | The same screen. Shown once when the key is created. |
| `S3_SECRET_ACCESS_KEY` | The same screen. Shown once when the key is created. |

Vercel cannot hand these back. `vercel env pull` writes the literal string
`[SENSITIVE]` for every variable marked sensitive in the project, and most of
these are, so neither the CLI nor the dashboard can decrypt them. Copied into
1Password unnoticed, `[SENSITIVE]` produces an `.env` that looks fully
configured and fails at the provider instead, which is why `validateEnv`
rejects that exact string.

So 1Password is where a value is kept, not where it is born. A value marked
sensitive exists only in 1Password and in the service that issued it. Add it to
both at the moment you create it.

### Item zicha-travel-preview

Most of preview is production. One Vercel row covers both environments for the
database, `PAYLOAD_SECRET`, the Azure pair, the S3 credentials and the PostHog
key, so those values are identical by definition. Preview owns the rest
separately:

| Field | How preview differs |
| --- | --- |
| `EMAIL_PREVIEW_TO` | Exists in preview alone, which is why no template declares it. `src/lib/email.ts` redirects every send here, so a preview deployment cannot mail a real participant. |
| `EMAIL_FROM` | Not set in preview, so it falls back to `login@zicha.travel` from `payload.config.ts`, while production sends from `info-noreply@zicha.travel`. That fallback address has to stay verified in Resend or preview mail fails. |
| `SESSION_COOKIE_DOMAIN` | Not set in preview, which is right: preview runs on hosts outside `zicha.travel`, and a `.zicha.travel` cookie would never reach them. |
| `AZURE_REDIRECT_URI` | `https://preview.zicha.travel/api/auth/callback`, its own subdomain, so OAuth from a preview does not land on production. |
| Turnstile pair | Cloudflare's always-passes test widget (`1x00000000000000000000AA` with secret `1x0000000000000000000000000000000AA`), not the production widget. Documented public values rather than secrets. |
| `CRON_SECRET` | Its own value, so a leaked preview secret cannot drive the production cron. |

Preview shares the production database and storage credentials. That is a
deliberate convenience rather than an oversight, but it means a preview
deployment writes to real data, and the mail redirect above is what keeps that
harmless.

## Adding a variable

The schema travels through git. Only the value is manual.

1. In code: add it to `scripts/env-spec.mjs` with its name, scope,
   description, whether it is required, and any format check or all-or-nothing
   group.
2. In both templates: `.env.tpl` and `.env.prod.tpl`.
   `tests/int/env.int.spec.ts` fails until the spec and both templates agree,
   so this cannot be forgotten, including by an agent working in the cloud.
   A variable that only applies to preview deployments skips this step: mark it
   `appliesTo: ['preview']` and leave the templates alone.
3. In 1Password, if it is a secret: add the field to `zicha-travel-dev`,
   `zicha-travel-preview` or `zicha-travel-prod`.
4. In Vercel: Settings, Environment Variables.

Steps 1 and 2 are the pull request. Steps 3 and 4 are paste operations only a
human with the credentials can do, so note them in the PR body. Other machines
pick the change up with `git pull && pnpm env:pull`.

`pnpm env:check` runs at the start of `vercel-build`, before the migration and
before `next build`. A variable declared in code but missing in Vercel fails
the build, and it fails the pull request's own preview deployment first, so the
gap surfaces at review time rather than in production.

## Production

Vercel stays the source of truth for what the deployment runs. 1Password holds
the recoverable copy and `.env.prod.tpl` documents the shape. Nothing pushes
automatically from 1Password into Vercel, because an accidental sync in the
wrong direction is far worse than a rare manual paste.

The other direction is useful when you need to reproduce a production bug
locally: `vercel env pull`, then delete the file afterwards. Remember that
sensitive variables come back as `[SENSITIVE]`.

## Refreshing local data from production

```bash
pnpm migrate-from-prod
```

The script resolves `op://Development/zicha-travel-prod/DATABASE_URI` on demand,
so production credentials never sit on disk. It deliberately ignores
`DATABASE_URI`, which points at the local database and would have the script
dump localhost onto itself. Export `PROD_DATABASE_URI` (or fill it in `.env`;
the export wins) to override for one run.

## Variables that are not in the templates

Deliberately absent, and a test enforces it:

- Platform-provided: `NODE_ENV`, `PORT`, `CI`, `VERCEL`, `VERCEL_ENV`,
  `VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_ENV`.
- Build-derived: `NEXT_PUBLIC_BUILD_ID` — computed by `next.config.mjs` from
  the git commit and baked into the bundle for the post-deploy refresh hint.
- One-off script flags: `SITE`, `OUT` (help screenshots), `EMIT_ONLY`,
  `REVERT` (icon seeding), `SEED_SALT` (demo data), `DEBUG_MIDDLEWARE`
  (opt-in request logging in `src/middleware.ts`). Pass them on the command
  line for the run that needs them.

`NEXT_PUBLIC_SITE_URL` is not among them either. Nothing reads it, because
multi-domain routing resolves the host from the database in
`src/middleware.ts`.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `op inject` errors on a reference | The field does not exist in that item, or its label does not match the variable name exactly. |
| `op inject` errors on `op://references` | A comment in the template spells out the scheme. `op inject` substitutes every occurrence in the file, comments included, and aborts on one it cannot resolve. A test guards against this. |
| A variable is set but the provider rejects it | Its value may be the literal `[SENSITIVE]` copied out of `vercel env pull`. `pnpm env:check` catches it. |
| `pnpm env:pull` writes nothing | Not signed in. Run `op signin`. |
| A template change never takes effect | A leftover `.env.local` overrides the generated `.env`. `pnpm env:check` prints a note when one exists — delete it. |
| `op: command not found` | The install directory is not on `PATH`. Add it and restart the terminal. |
| Build fails with "set all of these or none" | An integration is half-configured. Setting `S3_ENDPOINT` alone activates the storage plugin, which then fails every upload. |
| Sign-in works on `zicha.travel` but not on a chata subdomain | `SESSION_COOKIE_DOMAIN` is missing its leading dot. `env:check` warns about this. |
