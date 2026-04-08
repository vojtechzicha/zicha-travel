'use client'

import React from 'react'

const BeforeDashboard: React.FC = () => {
  return (
    <div
      style={{
        marginBottom: '2rem',
        padding: '2rem 2.5rem',
        background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
        borderRadius: '12px',
        color: '#fff',
        boxShadow: '0 4px 20px rgba(180, 83, 9, 0.3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
            fill="rgba(255,255,255,0.9)"
          />
          <circle cx="12" cy="9" r="2.5" fill="#d97706" />
        </svg>
        <h1
          style={{
            margin: 0,
            fontSize: '1.8rem',
            fontFamily: "'Merriweather', Georgia, serif",
            fontWeight: 900,
            letterSpacing: '-0.02em',
          }}
        >
          zicha.travel
        </h1>
      </div>
      <p style={{ margin: 0, opacity: 0.9, fontSize: '0.95rem', lineHeight: 1.6, maxWidth: 600 }}>
        Manage group trips and shared expenses. Track who paid what, calculate fair splits, and
        settle up with automatic balance calculations.
      </p>
    </div>
  )
}

export default BeforeDashboard
