import { GlassCard } from './GlassCard'
import { Calendar, MapPin, Info } from 'lucide-react'
import { formatDateWithDay } from '@/lib/formatCurrency'
import type { Chata } from '@/payload-types'

interface InformationViewProps {
  chata: Chata
}

export function InformationView({ chata }: InformationViewProps) {
  // Check if information is enabled
  if (!chata.informationEnabled) {
    return (
      <div className="max-w-4xl mx-auto">
        <GlassCard padding="large">
          <div className="text-center py-8">
            <Info className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-600 text-lg">
              Informace o této chatě nejsou k dispozici.
            </p>
          </div>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Dates */}
      {(chata.tripDateFrom || chata.tripDateTo) && (
        <GlassCard padding="medium">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="text-primary" size={24} />
            <h3 className="font-serif text-2xl font-bold text-gray-900">
              Termín
            </h3>
          </div>
          <div className="space-y-2">
            {chata.tripDateFrom && (
              <div>
                <span className="text-gray-600">Od: </span>
                <span className="font-semibold">
                  {formatDateWithDay(chata.tripDateFrom)}
                </span>
              </div>
            )}
            {chata.tripDateTo && (
              <div>
                <span className="text-gray-600">Do: </span>
                <span className="font-semibold">
                  {formatDateWithDay(chata.tripDateTo)}
                </span>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Destination */}
      {(chata.destinationName || chata.destinationLocation || chata.destinationDescription) && (
        <GlassCard padding="medium">
          <div className="flex items-center gap-3 mb-4">
            <MapPin className="text-primary" size={24} />
            <h3 className="font-serif text-2xl font-bold text-gray-900">
              Destinace
            </h3>
          </div>
          {chata.destinationName && (
            <h4 className="text-xl font-semibold text-gray-900 mb-2">
              {chata.destinationName}
            </h4>
          )}
          {chata.destinationLocation && (
            <p className="text-gray-600 mb-3">{chata.destinationLocation}</p>
          )}
          {chata.destinationDescription && (
            <p className="text-gray-800 mb-4">{chata.destinationDescription}</p>
          )}
          {chata.destinationLinks && chata.destinationLinks.length > 0 && (
            <div className="space-y-2">
              {chata.destinationLinks.map((link, index) => (
                <a
                  key={index}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-primary hover:text-primary-dark underline"
                >
                  {link.title || link.url}
                </a>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Transportation */}
      {(chata.carRoutes || chata.parking) && (
        <GlassCard padding="medium">
          <h3 className="font-serif text-2xl font-bold text-gray-900 mb-4">
            Doprava
          </h3>

          {/* Car routes */}
          {chata.carRoutes && chata.carRoutes.length > 0 && (
            <div className="mb-6">
              <h4 className="font-semibold text-lg text-gray-900 mb-3">
                Autem
              </h4>
              <div className="space-y-3">
                {chata.carRoutes.map((route, index) => (
                  <div key={index} className="bg-white/50 p-3 rounded-lg">
                    <div className="font-medium text-gray-900">{route.from}</div>
                    <div className="text-sm text-gray-600">
                      {route.duration} • {route.distance}
                    </div>
                    {route.route && (
                      <div className="text-sm text-gray-800 mt-1">
                        {route.route}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parking */}
          {chata.parking && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="font-semibold text-gray-900 mb-1">Parkování</div>
              <div className="text-gray-800">{chata.parking}</div>
            </div>
          )}
        </GlassCard>
      )}

      {/* Bedrooms */}
      {chata.bedrooms && chata.bedrooms.length > 0 && (
        <GlassCard padding="medium">
          <h3 className="font-serif text-2xl font-bold text-gray-900 mb-4">
            Ubytování
          </h3>
          <div className="space-y-4">
            {chata.bedrooms.map((bedroom, index) => (
              <div key={index} className="bg-white/50 p-4 rounded-lg">
                <h4 className="font-semibold text-lg text-gray-900 mb-2">
                  {bedroom.name}
                </h4>
                {bedroom.beds && bedroom.beds.length > 0 && (
                  <div className="space-y-2">
                    {bedroom.beds.map((bed, bedIndex) => {
                      const occupantNames = bed.occupants
                        ?.map((o) => (typeof o === 'object' && o !== null ? o.name : ''))
                        .filter((n) => n) || []
                      return (
                        <div key={bedIndex} className="text-sm">
                          <span className="text-gray-600">{bed.type}: </span>
                          <span className="text-gray-900">
                            {occupantNames.length > 0
                              ? occupantNames.join(', ')
                              : 'Volné'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Basic Info */}
      {chata.basicInfo && chata.basicInfo.length > 0 && (
        <GlassCard padding="medium">
          <h3 className="font-serif text-2xl font-bold text-gray-900 mb-4">
            Důležité informace
          </h3>
          <ul className="space-y-2">
            {chata.basicInfo.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span className="text-gray-800">{item.info}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </div>
  )
}
