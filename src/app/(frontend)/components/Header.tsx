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

// Design header ("Detail chaty — finál"): top bar with the back link, then a
// LEFT-aligned title row — theme-colored icon box beside the serif name and
// subtitle — with the tab pills on the right (desktop) or wrapped below
// (mobile). The active pill is solid white with dark text.
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

  // Mobile: equal-width pills in a 2-column grid (Jen's feedback — the
  // wrapped auto-width pills looked lopsided); desktop: inline pills.
  const tabClass = (view: NonNullable<HeaderProps['currentView']>) =>
    `flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full font-semibold text-[13px] transition-all whitespace-nowrap ${
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
    <header className="mb-6 sm:mb-8 text-white max-w-5xl mx-auto">
      {/* top bar: back link left, theme toggle right */}
      <div className="flex items-center justify-between mb-4 sm:mb-5">
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

      {/* title row: icon box + name left, tabs right (desktop) / below (mobile) */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          <div className="bg-primary rounded-[11px] sm:rounded-[14px] p-2 sm:p-2.5 shadow-lg shadow-primary/40 shrink-0">
            <DynamicIcon className="text-white" size={26} />
          </div>
          <div className="min-w-0">
            <h1 className="font-serif text-xl sm:text-[32px] font-black tracking-tight leading-tight text-shadow-heading">
              {chataName}
            </h1>
            {(location || bankerName) && (
              <p className="text-white/75 text-xs sm:text-sm text-shadow-subheading truncate">
                {location}
                {location && bankerName && ' · '}
                {bankerName && (
                  <>
                    {t('banker')} <strong className="text-white/90">{bankerName}</strong>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {visibleTabs.length > 1 && onViewChange && (
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2 shrink-0">
            {visibleTabs.map((tab) => (
              <button
                key={tab.view}
                onClick={() => onViewChange(tab.view)}
                className={tabClass(tab.view)}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
