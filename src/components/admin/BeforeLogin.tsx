'use client'

import React from 'react'

export const BeforeLogin: React.FC = () => {
  return (
    <div
      style={{
        padding: '1.5rem',
        marginBottom: '1.5rem',
        backgroundColor: '#f0f9ff',
        borderRadius: '0.5rem',
        border: '1px solid #bae6fd',
        maxWidth: '400px',
      }}
    >
      <h3 style={{ margin: '0 0 1rem 0', color: '#0369a1', fontSize: '1.1rem', fontWeight: 600 }}>
        Welcome to Chata Admin
      </h3>
      <p style={{ margin: '0 0 1rem 0', color: '#475569', fontSize: '0.875rem', lineHeight: 1.6 }}>
        Manage your group trips and shared expenses with ease.
      </p>
      <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.7 }}>
        <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>Quick Guide:</p>
        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
          <li><strong>Chatas</strong> - Create and manage trips/events</li>
          <li><strong>Participants</strong> - Add people to each trip</li>
          <li><strong>Expenses</strong> - Track shared costs</li>
          <li><strong>Prepayments</strong> - Record advances and refunds</li>
          <li><strong>Users</strong> - Manage admin accounts</li>
        </ul>
      </div>
    </div>
  )
}
