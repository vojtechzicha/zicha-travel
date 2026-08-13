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

/**
 * Skeleton bar for content INSIDE the white sheet — the base Skeleton's
 * white/20 shimmer is invisible on a white background.
 */
function SheetBar({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-gray-200/80 dark:bg-white/10 rounded ${className}`} />
}

/** The white-sheet document shell the Informace/Organizace/Účastníci tabs render into. */
function SheetShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="mx-auto w-full max-w-5xl rounded-[22px] sm:rounded-[26px] bg-white p-5 sm:px-11 sm:py-9
        shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] dark:bg-[#1b212c] dark:border dark:border-white/[0.06]
        dark:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]"
    >
      {children}
    </div>
  )
}

/** Centered stat strip placeholder ("4 noci · 3 lidi · …"). */
function SheetStatStrip({ bordered = true }: { bordered?: boolean }) {
  return (
    <div
      className={`flex flex-wrap justify-center gap-x-8 gap-y-1 py-3.5 ${
        bordered ? 'border-y border-gray-100 dark:border-white/[0.07]' : ''
      }`}
    >
      <SheetBar className="h-5 w-16" />
      <SheetBar className="h-5 w-20" />
      <SheetBar className="h-5 w-24" />
    </div>
  )
}

/** Serif section heading placeholder with the bottom rule. */
function SheetHeadingBar({ width = 'w-40' }: { width?: string }) {
  return (
    <div className="flex items-center gap-3 pb-2.5 sm:pb-3 border-b-[3px] border-gray-100 dark:border-white/10 mt-7 sm:mt-9 mb-4">
      <SheetBar className="w-5 h-5 rounded-md" />
      <SheetBar className={`h-6 ${width} rounded-lg`} />
    </div>
  )
}

export function InformationViewSkeleton() {
  return (
    <SheetShell>
      {/* hero: date boxes · countdown badge · actions */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between sm:gap-6">
        <div className="flex gap-3">
          <SheetBar className="h-16 w-32 rounded-xl" />
          <SheetBar className="h-16 w-32 rounded-xl" />
        </div>
        <SheetBar className="h-8 w-40 rounded-full" />
        <div className="flex flex-col gap-2">
          <SheetBar className="h-9 w-44 rounded-lg" />
          <SheetBar className="h-9 w-44 rounded-lg" />
        </div>
      </div>
      <div className="mt-4">
        <SheetStatStrip />
      </div>
      {/* destination section */}
      <SheetHeadingBar width="w-48" />
      <SheetBar className="h-4 w-full mb-2" />
      <SheetBar className="h-4 w-11/12 mb-2" />
      <SheetBar className="h-4 w-3/4 mb-5" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <SheetBar key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      {/* second section */}
      <SheetHeadingBar width="w-36" />
      <SheetBar className="h-28 w-full rounded-2xl" />
    </SheetShell>
  )
}

export function OrganizationViewSkeleton() {
  return (
    <SheetShell>
      <SheetStatStrip />
      {/* "tvoje místa" accent card */}
      <SheetBar className="h-20 w-full rounded-2xl mt-4" />
      {/* rooms */}
      <SheetHeadingBar width="w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 dark:border-white/[0.08] px-4 py-3.5"
          >
            <div className="flex justify-between items-baseline mb-3">
              <SheetBar className="h-5 w-28 rounded-lg" />
              <SheetBar className="h-5 w-14 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <SheetBar className="h-7 w-20 rounded-full" />
              <SheetBar className="h-7 w-24 rounded-full" />
              <SheetBar className="h-7 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      {/* cars */}
      <SheetHeadingBar width="w-36" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2].map((i) => (
          <SheetBar key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </SheetShell>
  )
}

export function ParticipantsViewSkeleton() {
  return (
    <SheetShell>
      <SheetStatStrip />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 dark:border-white/[0.08] px-4 py-3.5"
          >
            <SheetBar className="h-5 w-28 rounded-lg mb-2" />
            <SheetBar className="h-4 w-36" />
          </div>
        ))}
      </div>
    </SheetShell>
  )
}

export function ContentSkeleton({ view }: { view: 'finance' | 'information' | 'organization' | 'participants' }) {
  if (view === 'finance') return <FinanceViewSkeleton />
  if (view === 'organization') return <OrganizationViewSkeleton />
  if (view === 'participants') return <ParticipantsViewSkeleton />
  return <InformationViewSkeleton />
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
