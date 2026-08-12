'use client'

// Trip weather strip (design: "Počasí na místě") — Open-Meteo daily
// forecast, keyless and CORS-open. Renders nothing until data is in and
// silently disappears on any failure: the module is strictly optional and
// only mounts when the chata has coordinates and the trip is near enough
// (Open-Meteo forecasts ~16 days ahead).

import { useEffect, useState } from 'react'
import type { AppLocale } from '@/i18n/config'

interface TripWeatherProps {
  lat: number
  lng: number
  /** first day to show, ISO */
  from: string
  /** last day to show, ISO */
  to: string
  locale: AppLocale
}

interface DayForecast {
  date: string
  code: number
  max: number
  min: number
  precipitation: number
}

const FORECAST_HORIZON_DAYS = 15

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Clamp the requested range to [today, today + horizon]; null = nothing to show. */
export function weatherRange(from: string, to: string, now = new Date()): { start: string; end: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + FORECAST_HORIZON_DAYS)
  const fromDay = new Date(from)
  const toDay = new Date(to)
  const start = fromDay > today ? fromDay : today
  const end = toDay < horizon ? toDay : horizon
  if (start > end) return null
  return { start: isoDay(start), end: isoDay(end) }
}

/** WMO weather code → simple icon kind. */
function iconKind(code: number): 'sun' | 'partly' | 'cloud' | 'rain' | 'snow' | 'storm' {
  if (code === 0) return 'sun'
  if (code <= 2) return 'partly'
  if (code === 3 || code === 45 || code === 48) return 'cloud'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'rain'
}

function WeatherIcon({ code }: { code: number }) {
  const kind = iconKind(code)
  const sun = <circle cx="12" cy="12" r="5" fill="#f59e0b" />
  const smallSun = <circle cx="9" cy="9" r="4" fill="#f59e0b" />
  const cloud = (
    <ellipse cx="14" cy="15" rx="7" ry="4.5" className="fill-slate-300 dark:fill-slate-600" />
  )
  const bigCloud = (
    <ellipse cx="12" cy="10" rx="7" ry="4.5" className="fill-slate-400 dark:fill-slate-500" />
  )
  const drops = (
    <>
      <path d="M9 17v3" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 17v3" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
    </>
  )
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="mx-auto my-1">
      {kind === 'sun' && sun}
      {kind === 'partly' && (
        <>
          {smallSun}
          {cloud}
        </>
      )}
      {kind === 'cloud' && bigCloud}
      {kind === 'rain' && (
        <>
          {bigCloud}
          {drops}
        </>
      )}
      {kind === 'snow' && (
        <>
          {bigCloud}
          <circle cx="9" cy="18.5" r="1.2" className="fill-sky-300" />
          <circle cx="14" cy="18.5" r="1.2" className="fill-sky-300" />
        </>
      )}
      {kind === 'storm' && (
        <>
          {bigCloud}
          <path d="M11 14l-2 4h3l-1.5 4" stroke="#f59e0b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export function TripWeather({ lat, lng, from, to, locale }: TripWeatherProps) {
  const [days, setDays] = useState<DayForecast[] | null>(null)

  useEffect(() => {
    const range = weatherRange(from, to)
    if (!range) return
    const controller = new AbortController()
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
      `&timezone=Europe%2FPrague&start_date=${range.start}&end_date=${range.end}`
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        const time: string[] = data?.daily?.time ?? []
        const parsed = time.map((date, i) => ({
          date,
          code: Number(data.daily.weather_code?.[i] ?? 3),
          max: Math.round(Number(data.daily.temperature_2m_max?.[i] ?? 0)),
          min: Math.round(Number(data.daily.temperature_2m_min?.[i] ?? 0)),
          precipitation: Number(data.daily.precipitation_sum?.[i] ?? 0),
        }))
        if (parsed.length > 0) setDays(parsed)
      })
      .catch(() => {
        // optional module — no error state, it just does not render
      })
    return () => controller.abort()
  }, [lat, lng, from, to])

  if (!days) return null

  const dayFormat = new Intl.DateTimeFormat(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  })

  return (
    <div className="flex gap-1.5 sm:gap-2.5 overflow-x-auto pb-1">
      {days.map((day) => {
        const rainy = day.precipitation >= 0.5
        return (
          <div
            key={day.date}
            className={`flex-1 min-w-[72px] text-center rounded-xl border px-1 py-2.5 ${
              rainy
                ? 'bg-sky-50 border-sky-100 dark:bg-sky-400/[0.07] dark:border-sky-400/15'
                : 'bg-gray-50 border-gray-100 dark:bg-white/[0.04] dark:border-white/[0.06]'
            }`}
          >
            <div
              className={`text-[11px] font-semibold ${
                rainy
                  ? 'text-sky-700 dark:text-sky-300'
                  : 'text-gray-500 dark:text-slate-400'
              }`}
            >
              {dayFormat.format(new Date(day.date)).replace(' ', ' ')}
            </div>
            <WeatherIcon code={day.code} />
            <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100">
              {day.max}°{' '}
              <span className="font-medium text-gray-400 dark:text-slate-500">/ {day.min}°</span>
            </div>
            {rainy && (
              <div className="text-[11px] text-sky-700 dark:text-sky-300">
                {day.precipitation.toLocaleString(locale === 'cs' ? 'cs-CZ' : 'en-GB', {
                  maximumFractionDigits: 1,
                })}{' '}
                mm
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
