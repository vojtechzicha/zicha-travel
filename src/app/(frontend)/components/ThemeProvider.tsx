'use client'

import { createContext, useContext, useMemo } from 'react'
import type { Chata, Background, Icon, Media } from '@/payload-types'
import { getThemeColors, type ThemeColors } from '@/utils/themeColors'
import { useRegisterAttributions } from './AttributionProvider'

interface ThemeContextValue {
  colors: ThemeColors
  backgroundUrl: string | null
  backgroundCredit: { text: string; url: string | null } | null
  iconUrl: string | null
}

// Self-hosted copy of the old Unsplash default (see styles.css) — the remote
// 2670px original was 640 kB on every chata page that has no own background.
const DEFAULT_BACKGROUND_URL = '/bg/mountains-1920.avif'

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ThemeProviderProps {
  chata: Chata
  children: React.ReactNode
}

export function ThemeProvider({ chata, children }: ThemeProviderProps) {
  const theme = useMemo((): ThemeContextValue => {
    // Get colors from chata's themeColor
    const colors = getThemeColors(chata.themeColor)

    // Get background URL
    let backgroundUrl: string | null = DEFAULT_BACKGROUND_URL
    let backgroundCredit: ThemeContextValue['backgroundCredit'] = null
    if (chata.background && typeof chata.background === 'object') {
      const bg = chata.background as Background
      if (bg.type === 'url' && bg.url) {
        backgroundUrl = bg.url
      } else if (bg.type === 'upload' && bg.image && typeof bg.image === 'object') {
        const media = bg.image as Media
        backgroundUrl = media.url || DEFAULT_BACKGROUND_URL
      }
      if (bg.attribution) {
        backgroundCredit = { text: bg.attribution, url: bg.attributionUrl || null }
      }
    }

    // Get icon URL
    let iconUrl: string | null = null
    if (chata.icon && typeof chata.icon === 'object') {
      const icon = chata.icon as Icon
      if (icon.svg && typeof icon.svg === 'object') {
        const media = icon.svg as Media
        iconUrl = media.url || null
      }
    }

    return { colors, backgroundUrl, backgroundCredit, iconUrl }
  }, [chata])

  // The background fills the screen but is painted through CSS, so its credit
  // is owed by this page and paid in the footer.
  useRegisterAttributions(
    theme.backgroundCredit
      ? [{ text: theme.backgroundCredit.text, url: theme.backgroundCredit.url }]
      : null
  )

  return (
    <ThemeContext.Provider value={theme}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root {
              --color-primary: ${theme.colors.primary};
              --color-primary-dark: ${theme.colors.primaryDark};
              --color-primary-light: ${theme.colors.primaryLight};
            }
            body {
              background-image: url('${theme.backgroundUrl}');
            }
          `,
        }}
      />
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

