'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from './Header'
import { FinanceView } from './FinanceView'
import { InformationView } from './InformationView'
import { OrganizationView } from './OrganizationView'
import { HeaderSkeleton, ContentSkeleton, ChataSelectorSkeleton } from './Skeleton'
import { ThemeProvider } from './ThemeProvider'
import { getThemeColors } from '@/utils/themeColors'
import type { Chata, Participant, Expense, Prepayment } from '@/payload-types'
import type { ChataStats } from '@/utils/calculateStats'

interface ChataData {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  prepayments: Prepayment[]
  stats: ChataStats
}

interface ChataViewProps {
  slug: string
  allowSwitch: boolean
  initialThemeColor?: string | null
}

// Custom hook for delayed loading indicator
function useDelayedLoading(isLoading: boolean, delay = 200) {
  const [showLoading, setShowLoading] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        setShowLoading(true)
      }, delay)
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      setShowLoading(false)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [isLoading, delay])

  return showLoading
}

export function ChataView({ slug, allowSwitch, initialThemeColor }: ChataViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [currentView, setCurrentView] = useState<'finance' | 'information' | 'organization' | null>(
    (searchParams.get('view') as 'finance' | 'information' | 'organization') || null
  )
  const [data, setData] = useState<ChataData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isNavigating, setIsNavigating] = useState(false)

  // Only show loading indicator after 200ms delay to avoid flash
  const showLoadingIndicator = useDelayedLoading(loading, 200)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/chatas/slug/${slug}`)

        if (!response.ok) {
          throw new Error('Chata not found')
        }

        const result = await response.json()
        setData(result)

        // Set default view based on what's enabled (priority: information > organization > finance)
        if (currentView === null) {
          const hasInfo = result.chata.informationEnabled === true
          const hasOrg =
            result.chata.bedroomOrganizationEnabled === true ||
            result.chata.sharedCarsEnabled === true
          if (hasInfo) {
            setCurrentView('information')
          } else if (hasOrg) {
            setCurrentView('organization')
          } else {
            setCurrentView('finance')
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chata')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [slug, currentView])

  const handleViewChange = (view: 'finance' | 'information' | 'organization') => {
    startTransition(() => {
      setCurrentView(view)
    })
    // Update URL without reload
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    window.history.pushState({}, '', url)
  }

  const handleSwitchChata = () => {
    setIsNavigating(true)
    router.push('/')
  }

  // Show skeleton immediately when navigating to chata selector (no delay - user expects feedback)
  if (isNavigating) {
    return <ChataSelectorSkeleton />
  }

  // Show skeleton during initial loading - keeps the layout stable
  if (loading && !data) {
    // Use current view for navigation, or fall back to URL param / default for initial load
    const skeletonView = currentView || (searchParams.get('view') as 'finance' | 'information' | 'organization') || 'information'
    const skeletonColors = getThemeColors(initialThemeColor)

    return (
      <>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              :root {
                --color-primary: ${skeletonColors.primary};
                --color-primary-dark: ${skeletonColors.primaryDark};
                --color-primary-light: ${skeletonColors.primaryLight};
              }
            `,
          }}
        />
        <div className="min-h-screen relative">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
          <div className="relative z-10 max-w-app mx-auto px-5 py-10">
            {showLoadingIndicator ? (
              <>
                <HeaderSkeleton />
                <ContentSkeleton view={skeletonView} />
              </>
            ) : null}
          </div>
        </div>
      </>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen relative">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
        <div className="relative z-10 max-w-app mx-auto px-5 py-10">
          <div className="text-center text-white py-20">
            <h1 className="text-4xl font-bold mb-4">Chata nenalezena</h1>
            <p className="text-lg mb-8">{error}</p>
            {allowSwitch && (
              <button
                onClick={handleSwitchChata}
                className="bg-primary hover:bg-primary-dark text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                Zpět na výběr chaty
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const { chata, participants, expenses, prepayments, stats } = data
  const hasInformation = chata.informationEnabled === true
  const hasOrganization =
    chata.bedroomOrganizationEnabled === true || chata.sharedCarsEnabled === true
  const activeView = currentView || (hasInformation ? 'information' : hasOrganization ? 'organization' : 'finance')

  return (
    <ThemeProvider chata={chata}>
      <div className="min-h-screen relative">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />

        <div className="relative z-10 max-w-app mx-auto px-5 py-10">
          <Header
            chataName={chata.name}
            location={chata.location}
            bankerName={typeof chata.banker === 'object' && chata.banker ? chata.banker.name : undefined}
            currentView={activeView}
            onViewChange={handleViewChange}
            showInformationTab={hasInformation}
            showOrganizationTab={hasOrganization}
            onSwitchChata={allowSwitch ? handleSwitchChata : undefined}
          />

          {/* Content area with smooth transition */}
          <div
            className={`transition-opacity duration-150 ${isPending ? 'opacity-70' : 'opacity-100'}`}
          >
            {activeView === 'finance' ? (
              <FinanceView
                chata={chata}
                participants={participants}
                expenses={expenses}
                prepayments={prepayments}
                stats={stats}
              />
            ) : activeView === 'organization' ? (
              <OrganizationView chata={chata} />
            ) : (
              <InformationView chata={chata} />
            )}
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}
