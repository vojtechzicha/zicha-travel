import type { AppLocale } from '@/i18n/config'

// Amounts stay in CZK for every language — the trips are Czech, the bank
// accounts are Czech. Only the formatting locale changes: "1 200 Kč" in
// Czech, "CZK 1,200" in English. Components pass useLocale() / getLocale();
// the default keeps untouched call sites rendering exactly as before.
const INTL_TAG: Record<AppLocale, string> = {
  cs: 'cs-CZ',
  en: 'en-GB',
}

function intlTag(locale?: AppLocale): string {
  return INTL_TAG[locale ?? 'cs']
}

/**
 * Format a number as CZK in the given app locale.
 */
export function formatCurrency(amount: number, locale?: AppLocale): string {
  return new Intl.NumberFormat(intlTag(locale), {
    style: 'currency',
    currency: 'CZK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Format a date, e.g. "5. srpna 2026" / "5 August 2026".
 */
export function formatDate(date: string | Date, locale?: AppLocale): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/**
 * Format a date with day of week.
 */
export function formatDateWithDay(date: string | Date, locale?: AppLocale): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(intlTag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/**
 * Compact date, e.g. "5. 8." / "05/08" — used in the expense card's
 * "added by you" footer. Deliberately date only: an expense carries just a
 * day (the composer edits the date, the time of day is whatever the row
 * happened to be stamped with), so showing a time would promise a precision
 * nobody can set.
 */
export function formatShortDate(date: string | Date, locale?: AppLocale): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(intlTag(locale), {
    day: 'numeric',
    month: 'numeric',
  }).format(d)
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part.charAt(0).toUpperCase())
    .join('')
    .substring(0, 2)
}

/**
 * Generate a color for an avatar based on name
 */
export function getAvatarColor(name: string): string {
  const colors = [
    'bg-red-500',
    'bg-blue-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
  ]

  // Simple hash function to get consistent color for a name
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }

  return colors[Math.abs(hash) % colors.length]
}
