import type { ReactElement } from 'react'

// Which OAuth sign-in buttons the frontend shows, and their brand icons.
// Shared by LoginCard and the claim dialog; each surface applies its own
// button styling. The NEXT_PUBLIC_* flags are inlined at build time, so the
// reads must stay literal property accesses.

export type FrontendOAuthProvider = {
  id: 'microsoft' | 'google' | 'apple'
  /** Key under auth `login.*` and `claim.dialog.*` for the button label. */
  labelKey: 'microsoft' | 'google' | 'apple'
  icon: ReactElement
}

export function enabledOAuthProviders(): FrontendOAuthProvider[] {
  const providers: FrontendOAuthProvider[] = []
  if (process.env.NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED === 'true') {
    providers.push({ id: 'microsoft', labelKey: 'microsoft', icon: <MicrosoftIcon /> })
  }
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true') {
    providers.push({ id: 'google', labelKey: 'google', icon: <GoogleIcon /> })
  }
  if (process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === 'true') {
    providers.push({ id: 'apple', labelKey: 'apple', icon: <AppleIcon /> })
  }
  return providers
}

export function oauthLoginHref(providerId: FrontendOAuthProvider['id'], returnTo: string): string {
  return `/api/auth/login?provider=${providerId}&returnTo=${encodeURIComponent(returnTo)}`
}

export function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.09A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.57.38-2.29V6.62H1.27a11.99 11.99 0 0 0 0 10.76l4.01-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 1.27 6.62l4.01 3.09C6.22 6.87 8.87 4.77 12 4.77z"
      />
    </svg>
  )
}

export function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.365 1.43c0 1.14-.47 2.2-1.22 3.02-.79.87-2.1 1.54-3.16 1.46-.13-1.1.44-2.27 1.16-3.03.8-.86 2.19-1.51 3.22-1.45zM20.94 17.03c-.55 1.26-.82 1.82-1.53 2.93-.99 1.55-2.39 3.49-4.12 3.5-1.54.02-1.94-1.01-4.03-1-2.09.01-2.53 1.03-4.07 1.01-1.73-.02-3.05-1.76-4.04-3.31C.4 15.85-.13 10.9 1.51 8.26c1.16-1.87 3-2.97 4.72-2.97 1.75 0 2.86 1.01 4.31 1.01 1.41 0 2.27-1.01 4.3-1.01 1.53 0 3.16.84 4.31 2.28-3.79 2.08-3.18 7.5 1.79 9.46z" />
    </svg>
  )
}
