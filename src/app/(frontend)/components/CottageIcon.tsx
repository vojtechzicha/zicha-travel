interface CottageIconProps {
  size?: number
  className?: string
}

export function CottageIcon({ size = 48, className }: CottageIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={size}
      height={size}
      className={className}
    >
      {/* Roof */}
      <path d="M12 2L2 10h2v10h16V10h2L12 2z" />
      {/* Chimney */}
      <rect x="15" y="4" width="3" height="4" rx="0.5" />
      {/* Door */}
      <rect x="10" y="13" width="4" height="7" fill="white" rx="0.5" />
      {/* Window left */}
      <rect x="5" y="12" width="3" height="3" fill="white" rx="0.3" />
      {/* Window right */}
      <rect x="16" y="12" width="3" height="3" fill="white" rx="0.3" />
    </svg>
  )
}
