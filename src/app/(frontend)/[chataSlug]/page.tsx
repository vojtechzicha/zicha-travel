'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { Header } from '../components/Header'
import { FinanceView } from '../components/FinanceView'
import { InformationView } from '../components/InformationView'
import type { Chata, Participant, Expense, Prepayment } from '@/payload-types'
import type { ChataStats } from '@/utils/calculateStats'

interface ChataData {
  chata: Chata
  participants: Participant[]
  expenses: Expense[]
  prepayments: Prepayment[]
  stats: ChataStats
}

export default function ChataPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const chataSlug = params.chataSlug as string

  const [currentView, setCurrentView] = useState<'finance' | 'information' | null>(
    (searchParams.get('view') as 'finance' | 'information') || null
  )
  const [data, setData] = useState<ChataData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/chatas/slug/${chataSlug}`)

        if (!response.ok) {
          throw new Error('Chata not found')
        }

        const result = await response.json()
        setData(result)

        // Set default view based on whether information is enabled
        if (currentView === null) {
          const hasInfo = result.chata.informationEnabled === true
          setCurrentView(hasInfo ? 'information' : 'finance')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chata')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [chataSlug, currentView])

  const handleViewChange = (view: 'finance' | 'information') => {
    setCurrentView(view)
    // Optionally update URL without reload
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    window.history.pushState({}, '', url)
  }

  const handleSwitchChata = () => {
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen relative">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />
        <div className="relative z-10 max-w-app mx-auto px-5 py-10">
          <div className="text-center text-white py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-lg">Načítání...</p>
          </div>
        </div>
      </div>
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
            <button
              onClick={handleSwitchChata}
              className="bg-primary hover:bg-primary-dark text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Zpět na výběr chaty
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { chata, participants, expenses, prepayments, stats } = data
  const hasInformation = chata.informationEnabled === true
  const activeView = currentView || (hasInformation ? 'information' : 'finance')

  return (
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
          onSwitchChata={handleSwitchChata}
        />

        {activeView === 'finance' ? (
          <FinanceView
            chata={chata}
            participants={participants}
            expenses={expenses}
            prepayments={prepayments}
            stats={stats}
          />
        ) : (
          <InformationView chata={chata} />
        )}
      </div>
    </div>
  )
}
