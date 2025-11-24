import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { GlassCard } from './GlassCard'
import { CottageIcon } from './CottageIcon'
import { InlineSvgIcon } from './InlineSvgIcon'
import type { Chata, Icon, Media } from '@/payload-types'

// Helper to get icon URL from chata
function getChataIconUrl(chata: Chata): string | null {
  if (chata.icon && typeof chata.icon === 'object') {
    const icon = chata.icon as Icon
    if (icon.svg && typeof icon.svg === 'object') {
      const media = icon.svg as Media
      return media.url || null
    }
  }
  return null
}

// Get the chata's theme color or default
function getChataColor(chata: Chata): string {
  return chata.themeColor || '#d97706'
}

// Render icon for a chata card with its specific color
function ChataCardIcon({ chata, size = 32 }: { chata: Chata; size?: number }) {
  const iconUrl = getChataIconUrl(chata)
  const color = getChataColor(chata)

  if (iconUrl) {
    return (
      <InlineSvgIcon
        url={iconUrl}
        size={size}
        color={color}
        fallback={<CottageIcon size={size} style={{ color }} />}
      />
    )
  }

  return <CottageIcon size={size} style={{ color }} />
}

interface ChataSelectorProps {
  chatas: Chata[]
}

export function ChataSelector({ chatas }: ChataSelectorProps) {
  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900/80 backdrop-blur-sm z-0 pointer-events-none" />

      <div className="relative z-10 max-w-app mx-auto px-5 py-10">
        <header className="text-center mb-12 text-white animate-slideDown">
          <div className="inline-block bg-white/10 p-4 rounded-full mb-3 backdrop-blur-sm border border-white/20">
            <CottageIcon className="text-white" size={48} />
          </div>
          <h1 className="font-serif text-5xl md:text-6xl font-black tracking-tight drop-shadow-lg mb-2">
            Aplikace Chata
          </h1>
          <p className="text-white/80 text-lg">Vyberte si chatu</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {chatas.map((chata) => {
            const themeColor = getChataColor(chata)
            return (
              <Link key={chata.id} href={`/${chata.slug}`}>
                <GlassCard
                  padding="medium"
                  className="h-full hover:scale-105 hover:shadow-2xl transition-all cursor-pointer"
                >
                  <div className="flex flex-col items-center text-center">
                    <div
                      className="p-3 rounded-full mb-3"
                      style={{ backgroundColor: `${themeColor}15` }}
                    >
                      <ChataCardIcon chata={chata} size={32} />
                    </div>
                    <h2 className="font-serif text-2xl font-bold text-gray-900 mb-2">
                      {chata.name}
                    </h2>
                    {chata.location && (
                      <div className="flex items-center gap-1 text-gray-600 text-sm">
                        <MapPin size={14} />
                        <span>{chata.location}</span>
                      </div>
                    )}
                  </div>
                </GlassCard>
              </Link>
            )
          })}
        </div>

        {chatas.length === 0 && (
          <GlassCard padding="large" className="max-w-md mx-auto text-center">
            <p className="text-gray-600 text-lg">
              Zatím nejsou k dispozici žádné chaty.
            </p>
          </GlassCard>
        )}
      </div>
    </div>
  )
}
