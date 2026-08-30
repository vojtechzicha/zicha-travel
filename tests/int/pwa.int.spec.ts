import { describe, it, expect } from 'vitest'
import {
  apexOriginFromCookieDomain,
  buildManifest,
  OFFLINE_PATH,
  PWA_BRIDGE_PATH,
} from '@/lib/pwa'
import { serviceWorkerSource } from '@/lib/serviceWorkerSource'

describe('apexOriginFromCookieDomain', () => {
  it('derives the apex origin from the cookie domain', () => {
    expect(apexOriginFromCookieDomain('.zicha.travel')).toBe('https://zicha.travel')
  })

  it('accepts a domain without the leading dot', () => {
    expect(apexOriginFromCookieDomain('zicha.travel')).toBe('https://zicha.travel')
  })

  it('normalizes case and whitespace', () => {
    expect(apexOriginFromCookieDomain(' .Zicha.Travel ')).toBe('https://zicha.travel')
  })

  it('yields nothing when unconfigured', () => {
    expect(apexOriginFromCookieDomain(undefined)).toBeNull()
    expect(apexOriginFromCookieDomain(null)).toBeNull()
    expect(apexOriginFromCookieDomain('')).toBeNull()
  })

  it('refuses bare labels — a host-only cookie has no apex to bridge to', () => {
    expect(apexOriginFromCookieDomain('localhost')).toBeNull()
    expect(apexOriginFromCookieDomain('.')).toBeNull()
  })
})

describe('buildManifest', () => {
  it('starts at the homepage on the apex and multi-chata hosts', () => {
    const manifest = buildManifest({ bridged: false })
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.id).toBe('/')
    expect(manifest.display).toBe('standalone')
  })

  it('starts at the bridge on single-chata subdomains', () => {
    expect(buildManifest({ bridged: true }).start_url).toBe(PWA_BRIDGE_PATH)
  })

  it('ships regular and maskable icons in both manifest sizes', () => {
    const icons = buildManifest({ bridged: false }).icons
    const bySize = (purpose?: string) =>
      icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes)
    expect(bySize(undefined).sort()).toEqual(['192x192', '512x512'])
    expect(bySize('maskable').sort()).toEqual(['192x192', '512x512'])
  })

  it('labels preview installs apart from the production app', () => {
    expect(buildManifest({ bridged: false, vercelEnv: 'preview' }).name).toBe(
      'zicha.travel (preview)',
    )
    expect(buildManifest({ bridged: false, vercelEnv: 'production' }).name).toBe('zicha.travel')
    expect(buildManifest({ bridged: false }).name).toBe('zicha.travel')
  })
})

describe('serviceWorkerSource', () => {
  const source = serviceWorkerSource('abc123def4567890')

  it('bakes the build id into the worker, so every deploy changes the bytes', () => {
    expect(source).toContain('"abc123def4567890"')
    expect(serviceWorkerSource('другой')).not.toBe(source)
  })

  it('precaches and falls back to the offline page', () => {
    expect(source).toContain(`'${OFFLINE_PATH}'`)
  })

  it('claims clients and skips waiting — a new worker takes over immediately', () => {
    expect(source).toContain('skipWaiting()')
    expect(source).toContain('clients.claim()')
  })

  it('purges the personalized caches on every auth transition', () => {
    // Pages and chata payloads are cached by URL but personalized per
    // viewer — each login landing and sign-out must drop them, or an
    // offline fetch could serve the previous account's data.
    for (const path of [
      '/api/auth/logout',
      '/api/auth/callback',
      '/api/auth/magic-link/verify',
      '/api/users/login',
      '/api/users/logout',
    ]) {
      expect(source).toContain(`'${path}'`)
    }
    expect(source).toContain('caches.delete(PAGE_CACHE)')
    expect(source).toContain('caches.delete(DATA_CACHE)')
  })

  it('keeps the offline precache out of the purged page cache', () => {
    expect(source).not.toContain('caches.open(PAGE_CACHE)\n          await pages.put(OFFLINE_URL')
    expect(source).toMatch(/caches\.open\(STATIC_CACHE\)\s*\n\s*await offlineStore\.put\(OFFLINE_URL/)
  })

  it('never touches the admin panel or analytics proxy', () => {
    expect(source).toContain("startsWith('/admin')")
    expect(source).toContain("startsWith('/ingest')")
  })

  it('is a self-contained classic script', () => {
    expect(source).not.toMatch(/\bimport\b/)
    expect(source).not.toMatch(/\bexport\b/)
  })
})
