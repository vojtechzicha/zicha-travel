/**
 * Theme color utilities for generating dark/light variants from a hex color
 */

export interface ThemeColors {
  primary: string
  primaryDark: string
  primaryLight: string
}

/**
 * Adjusts the brightness of a hex color by a percentage
 * @param hex - Hex color string (e.g., "#d97706")
 * @param percent - Percentage to adjust (-100 to 100)
 * @returns Adjusted hex color
 */
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(255 * percent / 100)))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + Math.round(255 * percent / 100)))
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + Math.round(255 * percent / 100)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * Generates theme colors from a primary hex color
 * @param primaryColor - Primary hex color (e.g., "#d97706")
 * @returns Object with primary, primaryDark, and primaryLight colors
 */
export function getThemeColors(primaryColor: string | null | undefined): ThemeColors {
  const primary = primaryColor || '#d97706' // Default orange

  return {
    primary,
    primaryDark: adjustBrightness(primary, -15),
    primaryLight: adjustBrightness(primary, 25),
  }
}
