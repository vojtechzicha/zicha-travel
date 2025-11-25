'use client'

import { useState } from 'react'
import {
  Calendar,
  MapPin,
  Info,
  ArrowRight,
  Car,
  Train,
  Bed,
  ExternalLink,
  Mountain,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { Chata, Media } from '@/payload-types'

interface InformationViewProps {
  chata: Chata
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

function getDayOfWeek(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('cs-CZ', { weekday: 'long' })
}

function getDuration(from: string, to: string): string {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const nights = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
  return `${nights} ${nights === 1 ? 'noc' : nights < 5 ? 'noci' : 'nocí'}`
}

export function InformationView({ chata }: InformationViewProps) {
  const [expandedTransport, setExpandedTransport] = useState<number[]>([])

  const toggleTransport = (idx: number) => {
    if (expandedTransport.includes(idx)) {
      setExpandedTransport(expandedTransport.filter((i) => i !== idx))
    } else {
      setExpandedTransport([...expandedTransport, idx])
    }
  }

  // Check if information is enabled
  if (!chata.informationEnabled) {
    return (
      <div className="information-view">
        <div className="text-center py-8">
          <Info className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600 text-lg">Informace o této chatě nejsou k dispozici.</p>
        </div>
      </div>
    )
  }

  const chataName = chata.shortName || chata.name

  return (
    <div className="information-view">
      {/* Hero Section with Dates */}
      {(chata.tripDateFrom || chata.tripDateTo) && (
        <div className="info-hero">
          <div className="info-hero-content">
            <Calendar size={48} className="text-primary-light" />
            <h2>Kdy jedeme?</h2>
            <div className="dates-display">
              {chata.tripDateFrom && (
                <div className="date-box">
                  <span className="date-label">Příjezd</span>
                  <span className="date-weekday">{getDayOfWeek(chata.tripDateFrom)}</span>
                  <span className="date-value">{formatDate(chata.tripDateFrom)}</span>
                </div>
              )}
              {chata.tripDateFrom && chata.tripDateTo && <ArrowRight size={32} className="text-primary" />}
              {chata.tripDateTo && (
                <div className="date-box">
                  <span className="date-label">Odjezd</span>
                  <span className="date-weekday">{getDayOfWeek(chata.tripDateTo)}</span>
                  <span className="date-value">{formatDate(chata.tripDateTo)}</span>
                </div>
              )}
            </div>
            {chata.tripDateFrom && chata.tripDateTo && (
              <p className="duration-text">{getDuration(chata.tripDateFrom, chata.tripDateTo)}</p>
            )}
          </div>
        </div>
      )}

      {/* Destination Section */}
      {(chata.destinationName || chata.destinationLocation || chata.destinationDescription) && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5 pb-3 border-b-[3px] border-gray-100">
            <MapPin size={24} className="text-primary" />
            <h3 className="font-serif text-3xl m-0 text-gray-900 font-bold">Kam jedeme?</h3>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-md border-l-[5px] border-primary">
            {chata.destinationName && (
              <h4 className="font-serif text-3xl m-0 mb-4 text-gray-900">{chata.destinationName}</h4>
            )}
            {chata.destinationLocation && (
              <p className="location-text">
                <MapPin size={16} /> {chata.destinationLocation}
              </p>
            )}
            {chata.destinationDescription && (
              <p className="destination-desc">{chata.destinationDescription}</p>
            )}
            {chata.destinationLinks && chata.destinationLinks.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-1">
                {chata.destinationLinks.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold transition-all hover:bg-primary-dark hover:-translate-y-0.5 shadow-md"
                  >
                    <ExternalLink size={16} /> {link.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Photo Gallery */}
      {chata.photos && chata.photos.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5 pb-3 border-b-[3px] border-gray-100">
            <Mountain size={24} className="text-primary" />
            <h3 className="font-serif text-3xl m-0 text-gray-900 font-bold">Jak to tam vypadá</h3>
          </div>
          <div className="photo-gallery">
            {chata.photos.map((photoItem, idx) => {
              const photo = photoItem.photo as Media
              const photoUrl = photo?.url
              if (!photoUrl) return null
              return (
                <div key={idx} className="photo-item">
                  <img src={photoUrl} alt={photo?.alt || `${chataName} fotka ${idx + 1}`} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Basic Information */}
      {chata.basicInfo && chata.basicInfo.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5 pb-3 border-b-[3px] border-gray-100">
            <Info size={24} className="text-primary" />
            <h3 className="font-serif text-3xl m-0 text-gray-900 font-bold">Důležité informace</h3>
          </div>
          <ul className="info-list">
            {chata.basicInfo.map((item, idx) => (
              <li key={idx}>{item.info}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Transportation */}
      {(chata.carRoutes?.length || chata.publicTransportOptions?.length || chata.parking) && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5 pb-3 border-b-[3px] border-gray-100">
            <Car size={24} className="text-primary" />
            <h3 className="font-serif text-3xl m-0 text-gray-900 font-bold">Doprava</h3>
          </div>

          {/* Car Routes */}
          {chata.carRoutes && chata.carRoutes.length > 0 && (
            <div className="mb-9 last:mb-0">
              <h4 className="transport-subtitle">
                <Car size={20} /> Autem
              </h4>
              <div className="car-routes-grid">
                {chata.carRoutes.map((route, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-primary">
                    <div className="route-header">
                      <strong>{route.from}</strong>
                      <span className="route-duration">{route.duration}</span>
                    </div>
                    {route.distance && <div className="route-distance">{route.distance}</div>}
                    <div className="route-path">{route.route}</div>
                  </div>
                ))}
              </div>
              {chata.parking && (
                <div className="parking-note">
                  <strong>Parkování:</strong> {chata.parking}
                </div>
              )}
            </div>
          )}

          {/* Public Transport */}
          {chata.publicTransportOptions && chata.publicTransportOptions.length > 0 && (
            <div className="mb-9 last:mb-0">
              <h4 className="transport-subtitle">
                <Train size={20} /> Veřejnou dopravou
              </h4>
              {chata.publicTransportOptions.map((option, idx) => {
                const isExpanded = expandedTransport.includes(idx)
                const connections = option.connections || []
                const firstDeparture = connections[0]?.departure
                const lastArrival = connections[connections.length - 1]?.arrival

                return (
                  <div key={idx} className="bg-white p-6 rounded-2xl shadow-md mb-5 last:mb-0">
                    <div
                      className="option-header clickable"
                      onClick={() => toggleTransport(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          toggleTransport(idx)
                        }
                      }}
                    >
                      <div className="option-header-main">
                        <strong>{option.title}</strong>
                        {firstDeparture && lastArrival && (
                          <span className="time-range">
                            {firstDeparture} → {lastArrival}
                          </span>
                        )}
                        {option.totalDuration && (
                          <span className="total-duration">{option.totalDuration}</span>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={24} color="#6b7280" />
                      ) : (
                        <ChevronDown size={24} color="#6b7280" />
                      )}
                    </div>
                    {isExpanded && (
                      <div className="connections-list animate-slideDown">
                        {connections.map((conn, connIdx) => (
                          <div key={connIdx} className="connection-item">
                            <div className="connection-type">
                              {conn.type === 'vlak' ? <Train size={16} /> : <Car size={16} />}
                              <span className="connection-number">{conn.number}</span>
                            </div>
                            <div className="connection-route">
                              <div className="connection-station">
                                <strong>{conn.from}</strong>
                                <span className="connection-time">{conn.departure}</span>
                              </div>
                              <div className="connection-arrow">→</div>
                              <div className="connection-station">
                                <strong>{conn.to}</strong>
                                <span className="connection-time">{conn.arrival}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {option.notes && <div className="transport-notes">{option.notes}</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Bedroom Assignments */}
      {chata.bedrooms && chata.bedrooms.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-5 pb-3 border-b-[3px] border-gray-100">
            <Bed size={24} className="text-primary" />
            <h3 className="font-serif text-3xl m-0 text-gray-900 font-bold">Ubytování - rozdělení pokojů</h3>
          </div>
          <div className="bedrooms-grid">
            {chata.bedrooms.map((bedroom, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl shadow-md border-t-4 border-primary">
                <h4 className="font-serif text-xl m-0 mb-5 text-gray-900 flex items-center gap-2">
                  {bedroom.name}
                </h4>
                {bedroom.beds && bedroom.beds.length > 0 && (
                  <div className="beds-list">
                    {bedroom.beds.map((bed, bedIdx) => {
                      const occupantNames =
                        bed.occupants
                          ?.map((o) => (typeof o === 'object' && o !== null ? o.name : ''))
                          .filter((n) => n) || []
                      return (
                        <div key={bedIdx} className="bed-item">
                          <div className="bed-type">
                            <Bed size={16} /> {bed.type}
                          </div>
                          <div className="bed-occupants">
                            {occupantNames.length > 0 ? (
                              occupantNames.map((occupant, occIdx) => (
                                <span key={occIdx} className="bg-primary text-white px-3 py-1 rounded-md text-sm font-semibold">
                                  {occupant}
                                </span>
                              ))
                            ) : (
                              <span className="bg-gray-200 text-gray-500 px-3 py-1 rounded-md text-sm font-semibold">Volné</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
