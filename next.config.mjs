import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow dev requests from custom domains
  allowedDevOrigins: [],
  images: {
    // Cover photos are 2000px JPEGs served through the Payload media route,
    // which sends `max-age=0`. Everything that goes through next/image gets
    // resized, re-encoded and cached on the CDN for a month instead — the
    // upstream filename changes when a file is replaced, so this is safe.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
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

export default withPayload(nextConfig, { devBundleServerPackages: false })
