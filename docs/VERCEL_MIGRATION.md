# Vercel Migration Plan

> **Status (2026-08-03, later): Phases 1–2 done, cutover (Phase 3) is
> next.** File migration is complete — `pnpm migrate:media run` was
> executed and media + expense-attachment files verified serving (HTTP
> 200) from `zicha-travel.vercel.app`, so both platforms are now fully
> functional against the same production DB. Phase 3 was re-planned to a
> **wildcard + Vercel nameservers** cutover (see below) — the same setup
> already used for `zicha.study`. Verified zone contents (NS currently
> `dns*.p05.nsone.net`): only the apex A/AAAA and three subdomain A
> records (`lazne`/`vysocina`/`exman`), all pointing at Fly — no MX/TXT/
> `www`, so nothing needs recreating in Vercel DNS. Dead domains
> (`jeseniky2025.zicha.travel`, `chata.zicha.name`,
> `beskydy2025.zicha.travel`) no longer resolve and are skipped. The Fly
> deploy pipeline stays in the repo until after the cutover; DB schema
> migrations run automatically on both platforms (`vercel-build` script
> on Vercel, `release_command` on Fly — same idempotent
> `pnpm migrate:payer auto`).

Transition zicha-travel from **Fly.io** to **Vercel** with automatic per-PR
preview deployments, while preserving the multi-tenant custom-domain routing.

## Why this isn't a one-click switch

This app has three properties that a naïve "connect repo to Vercel" would break:

1. **Persistent media on a Fly volume.** `src/collections/Media.ts` uses
   `upload: true` with local-disk storage served from the Fly volume at
   `/app/media`. Vercel's filesystem is ephemeral — uploads would vanish on the
   next cold start. → Move media to S3-compatible storage (Supabase Storage).
2. **Serverless DB connections.** Vercel functions open many short-lived
   connections; `DATABASE_URI` must use Supabase's transaction pooler
   (port `6543` / Supavisor), not the direct `5432` connection.
3. **Host-based multi-tenant routing.** Each Chata has a `domains[]` array
   (`src/collections/Chatas.ts`). `src/middleware.ts` reads the `Host` header,
   resolves it via `/api/domains/{hostname}`, and serves that chata in
   single-chata mode at `/`. Every custom domain must be registered on the
   Vercel project (auto-TLS) and re-pointed via DNS.

## Phase 0 — Code changes (DONE, in this branch)

Shipped and safe to run on Fly first (all gated/backward-compatible):

- Added `@payloadcms/storage-s3`, wired into `payload.config.ts`, **gated on
  `S3_ENDPOINT`**. When unset, Payload falls back to local-disk storage, so Fly
  keeps working unchanged.
- Fixed `middleware.ts` to resolve the domains API against the request origin
  (`request.nextUrl.origin`) instead of the hardcoded `NEXT_PUBLIC_SITE_URL`, so
  each deployment (prod / preview / local) queries its OWN database.
- Documented the S3 vars and the pooled `DATABASE_URI` in `.env.example`.

## Decisions

- **Media storage:** Supabase Storage (S3-compatible, free 1 GB, already owned).
  Fallback if it outgrows the free tier: Cloudflare R2 (10 GB free, same adapter).
- **Preview database:** a dedicated, separate Supabase project/database for all
  preview deployments — previews never mutate or migrate production data.
- **Vercel plan:** Hobby (free). Note: Hobby forbids *commercial* use — upgrade
  to Pro if this is ever billed to anyone.

## Environment variables

### Production (Vercel → Settings → Environment Variables → Production)

| Var | Value |
| --- | --- |
| `DATABASE_URI` | Supabase **pooled** conn (`...pooler.supabase.com:6543/postgres`) |
| `PAYLOAD_SECRET` | (existing prod secret) |
| `NEXT_PUBLIC_SITE_URL` | `https://zicha.travel` |
| `NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED` | `true` |
| `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | (existing) |
| `AZURE_REDIRECT_URI` | `https://zicha.travel/api/auth/callback` |
| `S3_ENDPOINT` | `https://<project>.supabase.co/storage/v1/s3` |
| `S3_REGION` | Supabase project region (e.g. `eu-central-1`) |
| `S3_BUCKET` | `media` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Supabase Storage S3 keys |

### Preview (Vercel → Preview)

Same as production **except**:

- `DATABASE_URI` → the **dedicated preview** Supabase database.
- `S3_BUCKET` → `media-preview` (separate bucket, same Supabase project).
- `NEXT_PUBLIC_SITE_URL` → leave unset / Vercel's per-deployment URL (routing no
  longer depends on it after the middleware fix).

## Phase 1 — Stand up Vercel in parallel (no DNS change)

1. Create a Vercel project linked to `vojtechzicha/zicha-travel`; production
   branch = `main`. Framework preset: Next.js. Install command: `pnpm install`.
2. Set the **Production** env vars above.
3. In Supabase, create the `media` (public) bucket and generate S3 access keys.
4. Migrate existing files off the Fly volume into the `media` bucket:
   with the `S3_*` vars in `.env.local`, run `pnpm migrate:media status`
   to see what's missing, then `pnpm migrate:media run` (idempotent;
   `--verify=https://zicha-travel.vercel.app` re-checks each file on the
   Vercel side after upload). The script needs no Fly access — it
   downloads every `media` and `expense-attachments` file from the live
   site over public HTTP and uploads it to the bucket under the key the
   S3 plugin expects. Re-run it right before the DNS cutover to pick up
   files uploaded in the meantime.
5. Deploy and smoke-test on the `*.vercel.app` URL against prod DB: admin login,
   image rendering, expense math, a test upload.

## Phase 2 — Preview deployments + DB isolation

6. Create the dedicated preview Supabase project; run Payload migrations into it
   once. Create the `media-preview` bucket.
7. Set the **Preview** env vars. Open a throwaway PR and confirm the preview
   deploy points at the preview DB + preview bucket (not prod).

## Phase 3 — Domain cutover (wildcard + Vercel nameservers)

Wildcard domains on Vercel require the zone to use Vercel's nameservers
(the wildcard cert needs a DNS-01 challenge). That is fine here: the
`zicha.travel` zone contains nothing but records pointing at Fly (verified
2026-08-03 — no mail/TXT/other records), so switching nameservers loses
nothing. With `*.zicha.travel` on the project, every future chata
subdomain works with **zero** DNS/Vercel config — the Host-header
middleware already routes it — which also makes the once-considered
"register domains via Vercel API" hook unnecessary.

8. Re-run `pnpm migrate:media run` (idempotent) to pick up files uploaded
   since the last run.
9. In the Vercel project → Settings → Domains, add `zicha.travel` and
   `*.zicha.travel`. Vercel shows the nameserver instructions
   (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`) — same flow as
   `zicha.study`.
10. Glance at the current DNS panel (NS1) to confirm the zone really has
    no extra records; recreate any stragglers in Vercel DNS first.
11. At the registrar, switch `zicha.travel`'s nameservers to Vercel's.
    No TTL-lowering dance is needed: during NS propagation (up to ~48 h)
    stale resolvers keep hitting Fly and fresh ones hit Vercel — both
    serve the same app against the same DB, so there is no downtime
    window. Vercel issues the wildcard cert automatically once it sees
    the nameservers.
12. Verify: `https://zicha.travel` (+ admin login) and each live chata
    subdomain (`lazne`, `vysocina`, `exman`) load with valid TLS. Azure
    needs no change — OAuth uses the single fixed `AZURE_REDIRECT_URI`
    (`https://zicha.travel/api/auth/callback`), already registered.
13. After propagation, run `pnpm migrate:media status` once more: an
    upload made through a stale-DNS (Fly) request during the window would
    land on the Fly volume, not the bucket.
14. Keep Fly hot for 24–48 h as instant rollback (rollback = switch the
    nameservers back at the registrar).

## Phase 4 — Decommission

13. Delete `.github/workflows/deploy.yml` (Vercel's GitHub integration handles
    deploys now).
14. Once stable, tear down the Fly app (`split-expanses`) and its `media_data`
    volume.

## Rollback

At any point before Phase 4, repoint DNS back to Fly — the Fly app stays fully
functional because the Phase 0 changes are env-gated (no `S3_ENDPOINT` on Fly =
local-disk storage as before).
