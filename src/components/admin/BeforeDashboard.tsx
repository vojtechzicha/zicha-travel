'use client'

import React from 'react'

const BeforeDashboard: React.FC = () => {
  return (
    <div className="mb-8 p-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl text-white">
      <div className="flex items-center gap-4 mb-4">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 10.5L12 3L21 10.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V10.5Z"
            fill="white"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 21V14H15V21"
            stroke="#4F46E5"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1 className="m-0 text-3xl font-bold">Chata Expense Tracker</h1>
      </div>
      <p className="m-0 opacity-90 text-base leading-relaxed max-w-[600px]">
        Manage your group trips and shared expenses. Track who paid what, calculate fair splits,
        and settle up easily with automatic balance calculations.
      </p>
    </div>
  )
}

export default BeforeDashboard
