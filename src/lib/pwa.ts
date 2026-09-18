/**
 * PWA layer: the web app manifest and the install-target rules.
 *
 * The installed app must always BE zicha.travel, not a chata subdomain — a
 * subdomain install would go stale the moment the trip is over. The web
 * platform ties every install to the origin of the page it starts from
 * (a cross-origin start_url is ignored by spec), so the closest possible
 * behaviour is:
 *
 * - On the apex (and previews, localhost, any multi-chata host) the
 *   manifest starts at "/" — a clean, in-scope install.
 * - On a single-chata subdomain the manifest still exists (so "Add app"
 *   keeps working there) but starts at PWA_BRIDGE_PATH, a same-origin
 *   route that redirects to the apex. The launched app lands on
 *   zicha.travel; because that is outside the subdomain app's scope the
 *   browser shows its origin bar in the window — the price of installing
 *   from the "wrong" origin. Installing from zicha.travel itself has no
 *   bar. The footer install link is the clean path either way.
 *
 * The apex is derived from SESSION_COOKIE_DOMAIN (".zicha.travel" →
 * "https://zicha.travel") — the same boundary the session, consent and
 * locale cookies already use. Where it is unset (local dev, previews with
 * host-only cookies) there is no apex to bridge to and the bridge falls
 * back to "/".
 */

export const PWA_BRIDGE_PATH = '/app-start'
export const OFFLINE_PATH = '/offline'

/** "https://zicha.travel" from ".zicha.travel"; null when unconfigured. */
export function apexOriginFromCookieDomain(
  cookieDomain: string | null | undefined,
): string | null {
  if (!cookieDomain) return null
  const apex = cookieDomain.trim().toLowerCase().replace(/^\./, '')
  // A bare label ("localhost") or empty rest is not a domain we can trust
  if (!apex || !apex.includes('.')) return null
  return `https://${apex}`
}

export interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: 'maskable'
}

export interface ManifestOptions {
  /** Single-chata host: start at the bridge instead of "/". */
  bridged: boolean
  /** VERCEL_ENV, to label preview installs apart from the real app. */
  vercelEnv?: string | null
}

/**
 * Manifest content, shared by every host the deployment serves. `id` stays
 * "/" so reinstalling after a redeploy updates the existing app instead of
 * creating a second one.
 */
export function buildManifest({ bridged, vercelEnv }: ManifestOptions) {
  const name = vercelEnv === 'preview' ? 'zicha.travel (preview)' : 'zicha.travel'
  const icons: ManifestIcon[] = [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    {
      src: '/icons/icon-maskable-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/icons/icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ]
  return {
    id: '/',
    name,
    short_name: name,
    description: 'Společně na chatu: plánování, informace, finance',
    lang: 'cs',
    dir: 'ltr',
    start_url: bridged ? PWA_BRIDGE_PATH : '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    categories: ['travel', 'lifestyle'],
    icons,
  }
}

/**
 * Where the install has to be done by hand. Chromium fires
 * `beforeinstallprompt` and the footer link can trigger the native dialog;
 * WebKit never does, so on iPhone/iPad (every browser there is WebKit) and
 * in Safari on the Mac the link opens a short walkthrough instead:
 *
 * - `ios`: Share button → "Add to Home Screen" (the share sheet route,
 *   which third-party iOS browsers offer too). iPadOS Safari reports a Mac
 *   user agent, so a touch-capable "Macintosh" counts as iOS.
 * - `mac-safari`: File → "Add to Dock", available since Safari 17. Older
 *   Safari has no install at all, and Chromium-based Mac browsers take the
 *   native path, so both yield null.
 *
 * Inside an installed app (standalone display mode) there is nothing left
 * to install, so the guide never shows there.
 */
export type ManualInstallGuide = 'ios' | 'mac-safari'

export interface InstallEnvironment {
  userAgent: string
  /** navigator.maxTouchPoints — tells iPadOS apart from a real Mac. */
  maxTouchPoints?: number
  /** Already running as an installed app. */
  standalone: boolean
}

const NON_SAFARI_ENGINES = /Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/i

export function manualInstallGuide({
  userAgent,
  maxTouchPoints = 0,
  standalone,
}: InstallEnvironment): ManualInstallGuide | null {
  if (standalone) return null
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (!/Macintosh/i.test(userAgent)) return null
  if (maxTouchPoints > 1) return 'ios'
  if (!/Safari\//.test(userAgent) || NON_SAFARI_ENGINES.test(userAgent)) return null
  const version = Number(/Version\/(\d+)/.exec(userAgent)?.[1])
  return version >= 17 ? 'mac-safari' : null
}
