'use client'

import React from 'react'

const BeforeLogin: React.FC = () => {
  return (
    <div
      style={{
        padding: '1.5rem',
        marginBottom: '1.5rem',
        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(99, 102, 241, 0.1) 100%)',
        borderRadius: '0.75rem',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        maxWidth: '400px',
        backdropFilter: 'blur(10px)',
      }}
    >
      <h3
        style={{
          margin: '0 0 0.75rem 0',
          color: '#a5b4fc',
          fontSize: '1.1rem',
          fontWeight: 600,
        }}
      >
        Welcome to Aplikace Chata
      </h3>
      <p
        style={{
          margin: '0 0 1rem 0',
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        Manage your group trips and shared expenses with ease.
      </p>
      <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.7 }}>
        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }}>
          Quick Guide:
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          <li>
            <strong style={{ color: '#a5b4fc' }}>Chatas</strong> - Create and manage trips/events
          </li>
          <li>
            <strong style={{ color: '#a5b4fc' }}>Participants</strong> - Add people to each trip
          </li>
          <li>
            <strong style={{ color: '#a5b4fc' }}>Expenses</strong> - Track shared costs
          </li>
          <li>
            <strong style={{ color: '#a5b4fc' }}>Prepayments</strong> - Record advances and refunds
          </li>
          <li>
            <strong style={{ color: '#a5b4fc' }}>Users</strong> - Manage admin accounts
          </li>
        </ul>
      </div>
    </div>
  )
}

export default BeforeLogin
