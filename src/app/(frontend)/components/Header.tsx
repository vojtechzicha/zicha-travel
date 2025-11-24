'use client'

import { Mountain, ArrowLeft, Info, Wallet } from 'lucide-react'

interface HeaderProps {
  chataName: string
  location?: string
  bankerName?: string
  currentView?: 'finance' | 'information'
  onViewChange?: (view: 'finance' | 'information') => void
  showInformationTab?: boolean
  onSwitchChata?: () => void
}

export function Header({
  chataName,
  location,
  bankerName,
  currentView = 'finance',
  onViewChange,
  showInformationTab = false,
  onSwitchChata,
}: HeaderProps) {
  return (
    <header className="text-center mb-10 text-white">
      <div className="inline-block bg-white/10 p-4 rounded-full mb-3 backdrop-blur-sm border border-white/20 shadow-lg">
        <Mountain className="text-primary-light" size={48} />
      </div>
      <h1 className="font-serif text-4xl md:text-5xl font-black tracking-tight mb-1" style={{ textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)' }}>
        {chataName}
      </h1>
      {(location || bankerName) && (
        <p className="text-white/80 text-lg" style={{ textShadow: '0 1px 4px rgba(0, 0, 0, 0.5)' }}>
          {location}
          {location && bankerName && ' • '}
          {bankerName && <>Pokladník: <strong>{bankerName}</strong></>}
        </p>
      )}

      {/* Header actions */}
      {(showInformationTab || onSwitchChata) && (
        <div className="flex gap-5 justify-center items-center flex-wrap mt-5">
          {onSwitchChata && (
            <button
              onClick={onSwitchChata}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm border border-white/30 hover:-translate-y-0.5"
            >
              <ArrowLeft size={16} />
              Změnit chatu
            </button>
          )}

          {showInformationTab && onViewChange && (
            <div className="flex gap-1 p-1.5 rounded-xl backdrop-blur-md bg-white/15 border border-white/20">
              <button
                onClick={() => onViewChange('information')}
                className={`
                  flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm transition-all
                  ${
                    currentView === 'information'
                      ? 'bg-primary text-white shadow-lg shadow-primary/40'
                      : 'text-white/80 hover:text-white hover:bg-white/15'
                  }
                `}
              >
                <Info size={16} />
                Informace
              </button>
              <button
                onClick={() => onViewChange('finance')}
                className={`
                  flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm transition-all
                  ${
                    currentView === 'finance'
                      ? 'bg-primary text-white shadow-lg shadow-primary/40'
                      : 'text-white/80 hover:text-white hover:bg-white/15'
                  }
                `}
              >
                <Wallet size={16} />
                Finance
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
