import type { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  padding?: 'none' | 'small' | 'medium' | 'large'
  animation?: boolean
}

export function GlassCard({
  children,
  className = '',
  padding = 'large',
  animation = true,
}: GlassCardProps) {
  const paddingClasses = {
    none: '',
    small: 'p-4',
    medium: 'p-6',
    large: 'p-10',
  }

  return (
    <div
      className={`
        bg-white/95 backdrop-blur-md rounded-glass-lg shadow-2xl
        ${paddingClasses[padding]}
        ${animation ? 'animate-popIn' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
