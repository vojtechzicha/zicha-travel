'use client'

import { useTranslations } from 'next-intl'
import { ArrowLeft, BedDouble, Info, Moon, Sun, Users, Wallet } from 'lucide-react'
import { DynamicIcon } from './DynamicIcon'
import type { AppTheme } from '../utils/useAppTheme'

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
  theme?: AppTheme
  onToggleTheme?: () => void
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
  theme = 'light',
  onToggleTheme,
}: HeaderProps) {
  const t = useTranslations('chata.header')

  // Design pills: the ACTIVE tab is a solid white chip with dark text, the
  // rest are translucent chips on the photo backdrop (same in both themes —
  // the backdrop is always the darkened photo).
  const tabClass = (view: NonNullable<HeaderProps['currentView']>) =>
    `flex items-center gap-2 px-3 sm:px-5 py-2.5 rounded-full font-semibold text-[13px] transition-all ${
      currentView === view
        ? 'bg-white text-gray-900 shadow-lg font-bold'
        : 'bg-white/10 border border-white/20 text-white/85 hover:bg-white/20 hover:text-white'
    }`

  const tabs: Array<{
    view: NonNullable<HeaderProps['currentView']>
    show: boolean
    icon: React.ReactNode
    label: string
  }> = [
    {
      view: 'information',
      show: showInformationTab,
      icon: <Info size={15} aria-hidden="true" />,
      label: t('tabInformation'),
    },
    {
      view: 'organization',
      show: showOrganizationTab,
      icon: <BedDouble size={15} aria-hidden="true" />,
      label: t('tabOrganization'),
    },
    {
      view: 'finance',
      show: true,
      icon: <Wallet size={15} aria-hidden="true" />,
      label: t('tabFinance'),
    },
    {
      view: 'participants',
      show: showParticipantsTab,
      icon: <Users size={15} aria-hidden="true" />,
      label: t('tabParticipants'),
    },
  ]
  const visibleTabs = tabs.filter((tab) => tab.show)

  return (
    <header className="text-center mb-10 text-white">
      {/* top row: back link left, theme toggle right */}
      {(onSwitchChata || onToggleTheme) && (
        <div className="flex items-center justify-between mb-4 -mt-3">
          {onSwitchChata ? (
            <button
              onClick={onSwitchChata}
              className="flex items-center gap-1.5 text-white/75 hover:text-white text-sm font-medium transition-colors"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              {t('switchChata')}
            </button>
          ) : (
            <span />
          )}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
              title={theme === 'dark' ? t('themeLight') : t('themeDark')}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/20 text-white/85 hover:bg-white/20 hover:text-white transition-colors"
            >
              {theme === 'dark' ? (
                <Sun size={16} aria-hidden="true" />
              ) : (
                <Moon size={16} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      )}

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
          {bankerName && (
            <>
              {t('banker')} <strong>{bankerName}</strong>
            </>
          )}
        </p>
      )}

      {visibleTabs.length > 1 && onViewChange && (
        <div className="flex flex-wrap gap-2 justify-center items-center mt-5">
          {visibleTabs.map((tab) => (
            <button key={tab.view} onClick={() => onViewChange(tab.view)} className={tabClass(tab.view)}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
