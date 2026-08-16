import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import { getTranslations } from 'next-intl/server'
import config from '@/payload.config'
import { LoginCard } from '../components/LoginCard'
import '../styles.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth')
  return {
    title: t('login.metaTitle'),
    description: t('login.metaDescription'),
    // Also disallowed in robots.txt — noindex covers URLs already indexed
    robots: { index: false, follow: true },
  }
}

export default async function LoginPage() {
  const headersList = await headers()
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const { user } = await payload.auth({ headers: headersList }).catch(() => ({ user: null }))
  if (user) {
    redirect('/')
  }

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
      <div className="relative z-10 max-w-app mx-auto px-5 py-10 flex items-center justify-center min-h-screen">
        <LoginCard microsoftEnabled={process.env.NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED === 'true'} />
      </div>
    </div>
  )
}
