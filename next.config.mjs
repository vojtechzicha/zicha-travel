import { execSync } from 'child_process'
import { withPayload } from '@payloadcms/next/withPayload'
import createNextIntlPlugin from 'next-intl/plugin'

// Locale lives in a cookie (src/i18n/request.ts) — no URL segment, so the
// hostname middleware and /[chataSlug] routing stay untouched.
const withNextIntl = createNextIntlPlugin()

// Build id for the post-deploy refresh hint (see components/UpdateHint.tsx):
// inlined into both the client bundle and the server route handlers via
// `env`, so a long-lived tab can compare its own id against GET /api/version
// and learn that a newer build has been deployed.
//
// Must be DETERMINISTIC — Next evaluates this config several times during one
// build (main process + compiler workers), so a random id would come out
// different in the client bundle, the server bundle and BUILD_ID, making
// every fresh tab look stale. The git commit makes all evaluations agree and
// gives every deploy of new code a new id. On Vercel the commit arrives via
// VERCEL_GIT_COMMIT_SHA (no .git dir in the build); locally, git itself
// answers. With neither (e.g. a tarball build) it falls back to a constant,
// which disables the hint rather than misfiring.
function computeBuildId() {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA
  if (vercelSha) return vercelSha.slice(0, 16)
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .slice(0, 16)
  } catch {
    return 'unversioned'
  }
}

const buildId = computeBuildId()

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Linting runs as its own pipeline step (`pnpm lint` in vercel-build, with
  // --max-warnings 0) — don't lint a second time inside `next build`.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow dev requests from custom domains
  allowedDevOrigins: [],
  generateBuildId: () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  images: {
    // Cover photos are 2000px JPEGs served through the Payload media route,
    // which sends `max-age=0`. Everything that goes through next/image gets
    // resized, re-encoded and cached on the CDN for a month instead — the
    // upstream filename changes when a file is replaced, so this is safe.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    formats: ['image/avif', 'image/webp'],
  },
  // PostHog first-party proxy (docs/PRD-analytika.md): analytics beacons go
  // to /ingest on our own origin — not blocked by ad blockers, no
  // third-party cookies, no extra DNS lookup on mobile.
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
    ]
  },
  // PostHog API requests carry trailing slashes; without this Next would
  // 308-redirect them and the beacons (POST) would be dropped.
  skipTrailingSlashRedirect: true,
  async headers() {
    // Content-Security-Policy (compliance-gaps item 11). Every external
    // endpoint named here must also appear in the outbound-calls inventory
    // (docs/legal, compliance-gaps item 21) — adding a new outbound endpoint
    // means updating BOTH the CSP and the inventory/policy.
    //
    // Known needs: Turnstile (script + iframe + its own connect calls),
    // Open-Meteo (client-side weather fetch), Paylibo QR + legacy external
    // backgrounds + S3 storage (img-src https:), PostHog rides the
    // first-party /ingest proxy so connect-src 'self' covers it.
    // 'unsafe-eval' only in development — Next.js dev tooling needs it.
    const isDev = process.env.NODE_ENV === 'development'
    // Receipt uploads go straight from the browser to the bucket
    // (S3 clientUploads presigned URLs), so the storage origin must be a
    // permitted connect target wherever S3 is configured.
    const s3Origin = process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : null
    const csp = [
      `default-src 'self'`,
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://challenges.cloudflare.com`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: blob: https:`,
      `font-src 'self' data:`,
      `connect-src 'self' https://api.open-meteo.com https://challenges.cloudflare.com${s3Origin ? ` ${s3Origin}` : ''}`,
      // posthog-js may spin up blob: web workers
      `worker-src 'self' blob:`,
      `frame-src https://challenges.cloudflare.com`,
      `frame-ancestors 'self'`,
      `base-uri 'self'`,
      `form-action 'self'`,
      `object-src 'none'`,
    ].join('; ')

    return [
      {
        // Security headers on every response (compliance-gaps item 11).
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
      {
        // Static site background — public/ files default to max-age=0, which
        // means a revalidation round-trip for a file that only changes when
        // we redeploy a new one.
        source: '/bg/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000' }],
      },
      {
        // The raw Payload media route is a serverless function hop; without a
        // cache-control it is a CDN MISS on every single request.
        source: '/api/media/file/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withNextIntl(withPayload(nextConfig, { devBundleServerPackages: false }))
