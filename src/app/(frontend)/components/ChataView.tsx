'use client'

import { useEffect, useState, useTransition, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Header } from './Header'
import { FinanceView } from './FinanceView'
import { FinanceOverview } from './FinanceOverview'
import { InformationView } from './InformationView'
import { OrganizationView } from './OrganizationView'
import { ParticipantsView } from './ParticipantsView'
import { HeaderSkeleton, ContentSkeleton, ChataSelectorSkeleton } from './Skeleton'
import { ThemeProvider } from './ThemeProvider'
import { getThemeColors } from '@/utils/themeColors'
import { setAnalyticsContext, track, trackPageview, type AnalyticsRole } from '@/lib/analytics'
import type { Chata, Participant, Expense, Prepayment, JointAccount } from '@/payload-types'
import type { ChataStats } from '@/utils/calculateStats'
import type { FinanceViewer, LockedParticipant } from '@/lib/financeAccess'
import type { ViewerClaim } from '@/lib/claimRequests'

interface ChataData {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  prepayments: Prepayment[]
  jointAccounts?: JointAccount[]
  stats: ChataStats
  viewer?: FinanceViewer
  locked?: LockedParticipant[]
  pendingClaims?: number[]
  viewerClaims?: ViewerClaim[]
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
  const t = useTranslations('chata.chataView')
  const router = useRouter()
  const searchParams = useSearchParams()

  // If participant param is present but no view, default to finance
  type ViewName = 'finance' | 'information' | 'organization' | 'participants' | 'finance-overview'
  const initialView = searchParams.get('view') as ViewName | null
  const [currentView, setCurrentView] = useState<ViewName | null>(
    initialView || (searchParams.get('participant') ? 'finance' : null)
  )
  const [data, setData] = useState<ChataData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isNavigating, setIsNavigating] = useState(false)

  // Parse participant ID from URL
  const urlParticipantParam = searchParams.get('participant')
  const urlParticipantId = urlParticipantParam ? parseInt(urlParticipantParam, 10) : null

  const handleParticipantChange = useCallback((participantId: number | null) => {
    const url = new URL(window.location.href)
    if (participantId != null) {
      url.searchParams.set('participant', String(participantId))
    } else {
      url.searchParams.delete('participant')
    }
    window.history.replaceState({}, '', url)
  }, [])

  // Only show loading indicator after 200ms delay to avoid flash
  const showLoadingIndicator = useDelayedLoading(loading, 200)

  // Ambient analytics context: chata slug + coarse role — no identifiers
  useEffect(() => {
    if (!data) return
    const viewerRole = data.viewer?.role
    const role: AnalyticsRole =
      viewerRole === 'superadmin' || viewerRole === 'admin'
        ? viewerRole
        : data.viewer?.authenticated
          ? 'user'
          : 'anonymous'
    setAnalyticsContext({ chata: data.chata.slug ?? slug, role })
  }, [data, slug])

  // Silent reload keeps the current UI (no skeleton) — used after a
  // participant authors/edits/deletes an expense from the frontend
  const loadData = useCallback(
    async (opts?: { silent?: boolean }): Promise<ChataData | null> => {
      try {
        if (!opts?.silent) {
          setLoading(true)
          setError(null)
        }
        const response = await fetch(`/api/chatas/slug/${slug}`)
        if (!response.ok) {
          throw new Error('Chata not found')
        }
        const result = (await response.json()) as ChataData
        setData(result)
        return result
      } catch (err) {
        if (!opts?.silent) {
          setError(err instanceof Error ? err.message : 'Failed to load chata')
        }
        return null
      } finally {
        if (!opts?.silent) {
          setLoading(false)
        }
      }
    },
    [slug]
  )

  useEffect(() => {
    async function fetchData() {
      const result = await loadData()
      if (result) {
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
      }
    }

    fetchData()
  }, [slug, currentView, loadData])

  const handleViewChange = (view: ViewName) => {
    startTransition(() => {
      setCurrentView(view)
    })
    // Update URL without reload
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    // Remove participant param when leaving finance view
    if (view !== 'finance') {
      url.searchParams.delete('participant')
    }
    window.history.pushState({}, '', url)
    // pushState bypasses the Next router, so AnalyticsProvider's pathname
    // effect never sees this navigation — count it manually
    track('view_opened', { view })
    trackPageview()
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
    const rawSkeletonView = currentView || (searchParams.get('view') as ViewName) || 'information'
    const skeletonView = rawSkeletonView === 'finance-overview' ? 'finance' : rawSkeletonView
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
            <h1 className="text-4xl font-bold mb-4">{t('notFound')}</h1>
            <p className="text-lg mb-8">{error}</p>
            {allowSwitch && (
              <button
                onClick={handleSwitchChata}
                className="bg-primary hover:bg-primary-dark text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                {t('backToSelection')}
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
  const hasParticipants = participants.length > 2
  const activeView = currentView || (hasInformation ? 'information' : hasOrganization ? 'organization' : 'finance')
  // The overview is a sub-view of Finance — the Finance tab stays highlighted
  const headerView = activeView === 'finance-overview' ? 'finance' : activeView

  return (
    <ThemeProvider chata={chata}>
      <div className="min-h-screen relative">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />

        <div className="relative z-10 max-w-app mx-auto px-5 py-10">
          <Header
            chataName={chata.name}
            location={chata.location}
            bankerName={typeof chata.banker === 'object' && chata.banker ? chata.banker.name : undefined}
            currentView={headerView}
            onViewChange={handleViewChange}
            showInformationTab={hasInformation}
            showOrganizationTab={hasOrganization}
            showParticipantsTab={hasParticipants}
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
                jointAccounts={data.jointAccounts}
                stats={stats}
                viewer={data.viewer}
                locked={data.locked}
                pendingClaims={data.pendingClaims}
                viewerClaims={data.viewerClaims}
                urlParticipantId={urlParticipantId}
                onParticipantChange={handleParticipantChange}
                onOpenOverview={() => handleViewChange('finance-overview')}
                onDataChanged={async () => {
                  await loadData({ silent: true })
                }}
              />
            ) : activeView === 'finance-overview' ? (
              <FinanceOverview
                chata={chata}
                participants={participants}
                expenses={expenses}
                stats={stats}
                onBack={() => handleViewChange('finance')}
              />
            ) : activeView === 'organization' ? (
              <OrganizationView chata={chata} />
            ) : activeView === 'participants' ? (
              <ParticipantsView chata={chata} participants={participants} />
            ) : (
              <InformationView chata={chata} />
            )}
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}
