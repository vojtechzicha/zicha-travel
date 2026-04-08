'use client'

import React from 'react'

const BeforeLogin: React.FC = () => {
  return (
    <div
      style={{
        padding: '1.5rem',
        marginBottom: '1.5rem',
        background: 'var(--admin-brand-50, rgba(217, 119, 6, 0.08))',
        borderRadius: '0.75rem',
        border: '1px solid var(--admin-brand, #d97706)',
        borderColor: 'rgba(217, 119, 6, 0.2)',
        maxWidth: '400px',
      }}
    >
      <h3
        style={{
          margin: '0 0 0.75rem 0',
          color: 'var(--admin-brand, #d97706)',
          fontSize: '1.1rem',
          fontWeight: 700,
          fontFamily: "'Merriweather', Georgia, serif",
        }}
      >
        Welcome to zicha.travel
      </h3>
      <p
        style={{
          margin: '0 0 1rem 0',
          color: 'var(--theme-text, #44403c)',
          opacity: 0.7,
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        Manage your group trips and shared expenses with ease.
      </p>
      <div
        style={{
          fontSize: '0.8rem',
          color: 'var(--theme-text, #44403c)',
          opacity: 0.6,
          lineHeight: 1.7,
        }}
      >
        <p
          style={{
            margin: '0 0 0.5rem 0',
            fontWeight: 600,
            opacity: 1,
          }}
        >
          Quick Guide:
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          <li>
            <strong style={{ color: 'var(--admin-brand, #d97706)' }}>Chatas</strong> - Create and
            manage trips/events
          </li>
          <li>
            <strong style={{ color: 'var(--admin-brand, #d97706)' }}>Participants</strong> - Add
            people to each trip
          </li>
          <li>
            <strong style={{ color: 'var(--admin-brand, #d97706)' }}>Expenses</strong> - Track
            shared costs
          </li>
          <li>
            <strong style={{ color: 'var(--admin-brand, #d97706)' }}>Prepayments</strong> - Record
            advances and refunds
          </li>
          <li>
            <strong style={{ color: 'var(--admin-brand, #d97706)' }}>Users</strong> - Manage admin
            accounts
          </li>
        </ul>
      </div>
    </div>
  )
}

export default BeforeLogin
