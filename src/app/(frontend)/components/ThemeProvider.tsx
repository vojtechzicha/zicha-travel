'use client'

import { createContext, useContext, useMemo } from 'react'
import type { Chata, Background, Icon, Media } from '@/payload-types'
import { getThemeColors, type ThemeColors } from '@/utils/themeColors'

interface ThemeContextValue {
  colors: ThemeColors
  backgroundUrl: string | null
  iconUrl: string | null
}

const DEFAULT_BACKGROUND_URL =
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2670&auto=format&fit=crop'

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ThemeProviderProps {
  chata: Chata
  children: React.ReactNode
}

export function ThemeProvider({ chata, children }: ThemeProviderProps) {
  const theme = useMemo(() => {
    // Get colors from chata's themeColor
    const colors = getThemeColors(chata.themeColor)

    // Get background URL
    let backgroundUrl: string | null = DEFAULT_BACKGROUND_URL
    if (chata.background && typeof chata.background === 'object') {
      const bg = chata.background as Background
      if (bg.type === 'url' && bg.url) {
        backgroundUrl = bg.url
      } else if (bg.type === 'upload' && bg.image && typeof bg.image === 'object') {
        const media = bg.image as Media
        backgroundUrl = media.url || DEFAULT_BACKGROUND_URL
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

    return { colors, backgroundUrl, iconUrl }
  }, [chata])

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
