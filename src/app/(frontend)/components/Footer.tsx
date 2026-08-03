import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { isAdminRole } from '@/lib/access'
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

  const { user } = await payload.auth({ headers: headersList }).catch(() => ({ user: null }))

  return (
    <footer className="relative z-10 mt-auto border-t border-white/10 bg-slate-900/60 backdrop-blur-sm">
      <div className="max-w-app mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-white/60">
        <div className="text-center sm:text-left">
          <span className="font-serif font-bold text-white/80">zicha.travel</span>
          {' — společně na chatu: plánování, informace a finance'}
          <div className="text-xs text-white/40 mt-1">
            © {new Date().getFullYear()} · verze {versionLabel()}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="text-white/70" title={user.email}>
                {user.email}
              </span>
              {isAdminRole(user) && (
                <a href="/admin" className="hover:text-white transition-colors underline underline-offset-2">
                  Administrace
                </a>
              )}
              <a
                href="/api/auth/logout"
                className="hover:text-white transition-colors underline underline-offset-2"
              >
                Odhlásit se
              </a>
            </>
          ) : (
            <a
              href="/login"
              className="hover:text-white transition-colors underline underline-offset-2"
            >
              Přihlásit se
            </a>
          )}
        </div>
      </div>
    </footer>
  )
}
