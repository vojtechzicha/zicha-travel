'use client'

import { ArrowLeft, BedDouble, Info, Users, Wallet } from 'lucide-react'
import { DynamicIcon } from './DynamicIcon'

interface HeaderProps {
  chataName: string
  location?: string
  bankerName?: string
  currentView?: 'finance' | 'information' | 'organization' | 'participants'
  onViewChange?: (view: 'finance' | 'information' | 'organization' | 'participants') => void
  showInformationTab?: boolean
  showOrganizationTab?: boolean
  showParticipantsTab?: boolean
  onSwitchChata?: () => void
}

export function Header({
  chataName,
  location,
  bankerName,
  currentView = 'finance',
  onViewChange,
  showInformationTab = false,
  showOrganizationTab = false,
  showParticipantsTab = false,
  onSwitchChata,
}: HeaderProps) {
  return (
    <header className="text-center mb-10 text-white">
      <div className="inline-block bg-white/10 p-4 rounded-full mb-3 backdrop-blur-sm border border-white/20 shadow-lg">
        <DynamicIcon className="text-primary-light" size={48} />
      </div>
      <h1 className="font-serif text-4xl md:text-5xl font-black tracking-tight mb-1 text-shadow-heading">
        {chataName}
      </h1>
      {(location || bankerName) && (
        <p className="text-white/80 text-lg text-shadow-subheading">
          {location}
          {location && bankerName && ' • '}
          {bankerName && <>Pokladník: <strong>{bankerName}</strong></>}
        </p>
      )}

      {/* Header actions */}
      {(showInformationTab || showOrganizationTab || showParticipantsTab || onSwitchChata) && (
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

          {(showInformationTab || showOrganizationTab || showParticipantsTab) && onViewChange && (
            <div className="flex gap-1 p-1.5 rounded-xl backdrop-blur-md bg-white/15 border border-white/20">
              {showInformationTab && (
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
              )}
              {showOrganizationTab && (
                <button
                  onClick={() => onViewChange('organization')}
                  className={`
                    flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm transition-all
                    ${
                      currentView === 'organization'
                        ? 'bg-primary text-white shadow-lg shadow-primary/40'
                        : 'text-white/80 hover:text-white hover:bg-white/15'
                    }
                  `}
                >
                  <BedDouble size={16} />
                  Organizace
                </button>
              )}
              {showParticipantsTab && (
                <button
                  onClick={() => onViewChange('participants')}
                  className={`
                    flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm transition-all
                    ${
                      currentView === 'participants'
                        ? 'bg-primary text-white shadow-lg shadow-primary/40'
                        : 'text-white/80 hover:text-white hover:bg-white/15'
                    }
                  `}
                >
                  <Users size={16} />
                  Účastníci
                </button>
              )}
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
