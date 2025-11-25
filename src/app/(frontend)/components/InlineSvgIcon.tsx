'use client'

import { useEffect, useState } from 'react'

interface InlineSvgIconProps {
  url: string
  size?: number
  className?: string
  color?: string // Direct color value (e.g., "#2563eb")
  fallback?: React.ReactNode
}

export function InlineSvgIcon({ url, size = 32, className, color, fallback }: InlineSvgIconProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!url) {
      setError(true)
      return
    }

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch SVG')
        return res.text()
      })
      .then((text) => {
        // Parse and modify the SVG to use currentColor and set size
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'image/svg+xml')
        const svg = doc.querySelector('svg')

        if (svg) {
          // Set dimensions
          svg.setAttribute('width', String(size))
          svg.setAttribute('height', String(size))

          // Ensure fill uses currentColor for proper CSS inheritance
          if (!svg.getAttribute('fill') || svg.getAttribute('fill') === 'currentColor') {
            svg.setAttribute('fill', 'currentColor')
          }

          setSvgContent(svg.outerHTML)
          setError(false)
        } else {
          setError(true)
        }
      })
      .catch(() => {
        setError(true)
      })
  }, [url, size])

  if (error || !svgContent) {
    return fallback ? <>{fallback}</> : null
  }

  return (
    <span
      className={`inline-flex w-[var(--icon-size)] h-[var(--icon-size)] ${color ? 'text-[var(--icon-color)]' : ''} ${className || ''}`}
      style={{
        '--icon-size': `${size}px`,
        ...(color ? { '--icon-color': color } : {}),
      } as React.CSSProperties}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  )
}
