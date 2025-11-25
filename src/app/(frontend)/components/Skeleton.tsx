'use client'

import { ReactNode } from 'react'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-white/20 rounded ${className}`}
    />
  )
}

export function HeaderSkeleton() {
  return (
    <header className="text-center mb-10 text-white">
      <div className="inline-block bg-white/10 p-4 rounded-full mb-3 backdrop-blur-sm border border-white/20 shadow-lg">
        <Skeleton className="w-12 h-12 rounded-full" />
      </div>
      <Skeleton className="h-12 w-64 mx-auto mb-2 rounded-lg" />
      <Skeleton className="h-6 w-48 mx-auto rounded-lg" />
      <div className="flex gap-5 justify-center items-center flex-wrap mt-5">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-56 rounded-xl" />
      </div>
    </header>
  )
}

export function FinanceViewSkeleton() {
  return (
    <div className="w-full">
      {/* Participant selector skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

export function InformationViewSkeleton() {
  return (
    <div className="information-view">
      {/* Hero section skeleton */}
      <div className="info-hero">
        <div className="info-hero-content">
          <Skeleton className="w-12 h-12 rounded-full mx-auto mb-4" />
          <Skeleton className="h-8 w-48 mx-auto mb-6 rounded-lg" />
          <div className="flex gap-4 justify-center">
            <Skeleton className="h-24 w-36 rounded-xl" />
            <Skeleton className="h-24 w-36 rounded-xl" />
          </div>
        </div>
      </div>
      {/* Content sections skeleton */}
      <div className="info-section">
        <Skeleton className="h-8 w-40 mb-4 rounded-lg" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </div>
  )
}

export function ContentSkeleton({ view }: { view: 'finance' | 'information' }) {
  return view === 'finance' ? <FinanceViewSkeleton /> : <InformationViewSkeleton />
}

export function ChataSelectorSkeleton() {
  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />

      <div className="relative z-10 max-w-app mx-auto px-5 py-10">
        <header className="text-center mb-12 text-white">
          <div className="inline-block bg-white/10 p-4 rounded-full mb-3 backdrop-blur-sm border border-white/20">
            <Skeleton className="w-12 h-12 rounded-full" />
          </div>
          <Skeleton className="h-14 w-72 mx-auto mb-2 rounded-lg" />
          <Skeleton className="h-6 w-40 mx-auto rounded-lg" />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg"
            >
              <div className="flex flex-col items-center text-center">
                <Skeleton className="w-14 h-14 rounded-full mb-3" />
                <Skeleton className="h-8 w-32 mb-2 rounded-lg" />
                <Skeleton className="h-5 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
