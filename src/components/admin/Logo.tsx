'use client'

import React from 'react'

const Logo: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
      }}
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
          fill="#d97706"
        />
        <circle cx="12" cy="9" r="2.5" fill="#fff" />
      </svg>
      <span
        style={{
          fontSize: '1.4rem',
          fontFamily: "'Merriweather', Georgia, serif",
          fontWeight: 900,
          letterSpacing: '-0.02em',
          color: 'var(--theme-text)',
        }}
      >
        zicha
        <span style={{ color: '#d97706', fontWeight: 700 }}>.travel</span>
      </span>
    </div>
  )
}

export default Logo
