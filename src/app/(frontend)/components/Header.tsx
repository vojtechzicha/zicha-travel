'use client'

import { Mountain } from 'lucide-react'

interface HeaderProps {
  chataName: string
  location?: string
  currentView?: 'finance' | 'information'
  onViewChange?: (view: 'finance' | 'information') => void
  showInformationTab?: boolean
  onSwitchChata?: () => void
}

export function Header({
  chataName,
  location,
  currentView = 'finance',
  onViewChange,
  showInformationTab = false,
  onSwitchChata,
}: HeaderProps) {
  return (
    <header className="text-center mb-10 text-white animate-slideDown">
      <div className="inline-block bg-white/10 p-4 rounded-full mb-3 backdrop-blur-sm border border-white/20">
        <Mountain className="text-white" size={40} />
      </div>
      <h1 className="font-serif text-5xl md:text-6xl font-black tracking-tight drop-shadow-lg mb-2">
        {chataName}
      </h1>
      {location && (
        <p className="text-white/80 text-lg mb-6">{location}</p>
      )}

      {/* View toggle tabs */}
      {(showInformationTab || onSwitchChata) && (
        <div className="flex gap-2 justify-center items-center flex-wrap mt-6">
          {showInformationTab && onViewChange && (
            <>
              <button
                onClick={() => onViewChange('finance')}
                className={`
                  px-5 py-2.5 rounded-xl font-semibold transition-all
                  ${
                    currentView === 'finance'
                      ? 'bg-primary text-white shadow-lg shadow-primary/40'
                      : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                  }
                `}
              >
                Finance
              </button>
              <button
                onClick={() => onViewChange('information')}
                className={`
                  px-5 py-2.5 rounded-xl font-semibold transition-all
                  ${
                    currentView === 'information'
                      ? 'bg-primary text-white shadow-lg shadow-primary/40'
                      : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm'
                  }
                `}
              >
                Informace
              </button>
            </>
          )}

          {onSwitchChata && (
            <button
              onClick={onSwitchChata}
              className="px-5 py-2.5 rounded-xl font-semibold transition-all bg-white/20 text-white hover:bg-white/30 backdrop-blur-sm"
            >
              Změnit chatu
            </button>
          )}
        </div>
      )}
    </header>
  )
}
