'use client'

import { useTheme } from './ThemeProvider'
import { CottageIcon } from './CottageIcon'
import { InlineSvgIcon } from './InlineSvgIcon'

interface DynamicIconProps {
  size?: number
  className?: string
}

export function DynamicIcon({ size = 48, className }: DynamicIconProps) {
  const { iconUrl } = useTheme()

  if (iconUrl) {
    return (
      <InlineSvgIcon
        url={iconUrl}
        size={size}
        className={className}
        fallback={<CottageIcon size={size} className={className} />}
      />
    )
  }

  // Fall back to default cottage icon
  return <CottageIcon size={size} className={className} />
}
