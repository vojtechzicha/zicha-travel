import { headers } from 'next/headers'
import { getPayload } from 'payload'
import { getTranslations } from 'next-intl/server'
import config from '@/payload.config'
import { isAdminRole } from '@/lib/access'
import { analyticsEnabled } from '@/lib/consent'
import { PrivacySettingsLink } from './PrivacySettingsLink'
import { LanguageSwitcher } from './LanguageSwitcher'
import packageJson from '../../../../package.json'

// Version stamp: Vercel injects the deployed commit; local dev falls back to
// the package version
function versionLabel(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  const env = process.env.VERCEL_ENV
  if (sha) {
    const short = sha.slice(0, 7)
    return env && env !== 'production' ? `${short} (${env})` : short
  }
  return `v${packageJson.version} (dev)`
}

export async function Footer() {
  const headersList = await headers()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const t = await getTranslations('common.footer')

  const { user } = await payload.auth({ headers: headersList }).catch(() => ({ user: null }))

  return (
    <footer className="relative z-10 mt-auto border-t border-white/10 bg-slate-900/60 backdrop-blur-sm">
      <div className="max-w-app mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-white/60">
        <div className="text-center sm:text-left">
          <span className="font-serif font-bold text-white/80">zicha.travel</span>{' '}
          {t('tagline')}
          <div className="text-xs text-white/40 mt-1">
            © {new Date().getFullYear()} · {t('version', { version: versionLabel() })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          {user && (
            <span className="text-white/70" title={user.email}>
              {user.email}
            </span>
          )}
          <LanguageSwitcher />
          <a
            href="/napoveda"
            className="hover:text-white transition-colors underline underline-offset-2"
          >
            {t('help')}
          </a>
          {/* Reopens the consent banner — consent must be as easy to
              withdraw as to give. Hidden while analytics is off. */}
          {analyticsEnabled() && (
            <PrivacySettingsLink className="hover:text-white transition-colors underline underline-offset-2">
              {t('privacySettings')}
            </PrivacySettingsLink>
          )}
          {/* Anonymous visitors get the link too (it lands on the admin
              login); only plain frontend accounts have no business there */}
          {(!user || isAdminRole(user)) && (
            <a href="/admin" className="hover:text-white transition-colors underline underline-offset-2">
              {t('admin')}
            </a>
          )}
          {user ? (
            <a
              href="/api/auth/logout"
              className="hover:text-white transition-colors underline underline-offset-2"
            >
              {t('signOut')}
            </a>
          ) : (
            <a
              href="/login"
              className="hover:text-white transition-colors underline underline-offset-2"
            >
              {t('signIn')}
            </a>
          )}
        </div>
      </div>
    </footer>
  )
}
