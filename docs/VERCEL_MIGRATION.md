# Vercel Migration Plan

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
   - `fly ssh console -a split-expanses` → copy `/app/media/*` out (or
     `fly sftp get`), then upload to the Supabase bucket (e.g. `rclone`/`aws s3
     cp --endpoint-url`). Preserve the original filenames so existing DB
     references resolve.
5. Deploy and smoke-test on the `*.vercel.app` URL against prod DB: admin login,
   image rendering, expense math, a test upload.

## Phase 2 — Preview deployments + DB isolation

6. Create the dedicated preview Supabase project; run Payload migrations into it
   once. Create the `media-preview` bucket.
7. Set the **Preview** env vars. Open a throwaway PR and confirm the preview
   deploy points at the preview DB + preview bucket (not prod).

## Phase 3 — Domain cutover (do this carefully)

8. In the Vercel project, **add every existing chata domain + `zicha.travel`**.
   Vercel issues certs while DNS still points at Fly — no downtime yet.
   (List current domains from the `chatas.domains` table.)
9. Lower DNS TTLs ~24h in advance.
10. Re-point each domain to Vercel **one at a time**, verifying each chata loads
    before the next:
    - Apex (`zicha.travel`): A record → Vercel anycast IP, or Vercel nameservers.
    - Subdomains: CNAME → `cname.vercel-dns.com`.
11. Add `https://<domain>/api/auth/callback` redirect URIs in Azure for any
    domain that needs OAuth.
12. Keep Fly hot for 24–48h as instant rollback.

> Optional: automate future domain registration with a Payload `afterChange`
> hook on `Chatas` that calls the Vercel Domains API when a domain is added.

## Phase 4 — Decommission

13. Delete `.github/workflows/deploy.yml` (Vercel's GitHub integration handles
    deploys now).
14. Once stable, tear down the Fly app (`split-expanses`) and its `media_data`
    volume.

## Rollback

At any point before Phase 4, repoint DNS back to Fly — the Fly app stays fully
functional because the Phase 0 changes are env-gated (no `S3_ENDPOINT` on Fly =
local-disk storage as before).
