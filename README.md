# Zicha Travel

Expense tracker for group trips and shared accommodations. Built with Payload CMS, Next.js, and PostgreSQL.

Features automatic expense splitting, QR payment codes (Czech banking), a pre-trip planning phase where the group votes on dates and accommodation, multi-domain routing, a bilingual Czech/English interface, and a mobile-friendly glass-morphism UI.

## Quick Start

1. Clone the repo and install dependencies:

   ```bash
   pnpm install
   ```

2. Generate the local environment file from the committed template. The
   secrets come from 1Password, so nothing is copied between machines:

   ```bash
   op signin
   pnpm env:pull
   ```

3. Start the development server (auto-starts a Docker PostgreSQL instance):

   ```bash
   pnpm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) for the frontend and [http://localhost:3000/admin](http://localhost:3000/admin) for the Payload admin panel.

## Prerequisites

- Node.js 18.20+ or 20.9+
- pnpm 10+ (no pinned version — whatever current pnpm you have installed)
- Docker (for local PostgreSQL) — Podman with a `docker` shim works too
- [1Password CLI](https://developer.1password.com/docs/cli/) (`op`), signed in

## Development Commands

```bash
pnpm dev              # Start PostgreSQL + Next.js dev server
pnpm db               # Start only PostgreSQL in background
pnpm db:stop          # Stop PostgreSQL
pnpm env:pull         # Regenerate .env from .env.tpl via 1Password
pnpm env:check        # Validate the environment against scripts/env-spec.mjs
pnpm migrate:create   # Generate a schema migration after changing a collection
pnpm migrate:status   # Show which migrations a database has applied
pnpm build            # Build for production
pnpm generate:types   # Generate TypeScript types from collections
pnpm test             # Run integration and e2e tests
```

## Configuration

Every variable the code reads is declared in `scripts/env-spec.mjs` and
mirrored by two committed templates — `.env.tpl` (local) and `.env.prod.tpl`
(production). A test fails if they drift apart, and `pnpm env:check` runs at
the start of the Vercel build so a variable added in code but never set in
Vercel breaks the pull request's preview deployment rather than production.

See **[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)** for the 1Password layout and
the workflow for adding a variable.

## Languages

The frontend is bilingual: Czech (the home language) and English.

- The first visit follows the browser's `Accept-Language` header (Slovak browsers get Czech); the footer switcher stores an explicit choice in the `NEXT_LOCALE` cookie, shared across chata subdomains via `SESSION_COOKIE_DOMAIN`.
- There is no locale URL segment. Locale resolution lives in `src/i18n/`, UI strings in `messages/{cs,en}/*.json` (next-intl, ICU plurals), and the prose-heavy help and privacy pages in per-locale `content.cs.tsx` / `content.en.tsx` modules.
- Czech grammar is handled properly: declined name forms (accusative/vocative) from the Participants collection, genitive month and weekday names in date ranges, and three-form plurals.
- The Payload admin panel is bilingual too (English default); each admin picks their language in their account settings.
- Magic-link sign-in emails follow the language the requester was using; other emails stay Czech.

Help screenshots show the Czech interface; the English help pages say so.

## Authentication

- **Frontend accounts** sign in with a magic link or with Microsoft, Google
  or Apple (each provider is switched on by its own environment variables).
- **Admins** use the same providers; superadmins sign in with OAuth only.
- **First setup:** while no OAuth provider is configured, the admin panel
  falls back to Payload's email and password login, so you can create the
  first superadmin. Configuring any provider switches that login off, so
  create a superadmin whose email matches your OAuth account first.

Provider setup (Azure, Google Cloud, Apple Developer) and every variable it
needs are in **[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)**; the sign-in flows
are described in `CLAUDE.md` under "Auth flows".

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) 15
- **CMS**: [Payload CMS](https://payloadcms.com/) 3
- **Database**: PostgreSQL on Supabase (Payload migrations in `src/migrations`)
- **Styling**: Tailwind CSS v4
- **Deployment**: Vercel (media on Supabase Storage)

## License

MIT
