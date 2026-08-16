import { describe, it, expect } from 'vitest'
import { isPastRetention, MONTH_MS } from '@/utils/retention'

describe('isPastRetention', () => {
  const now = Date.parse('2026-08-16T00:00:00Z')

  it('is false without a date', () => {
    expect(isPastRetention(null, 12, now)).toBe(false)
    expect(isPastRetention(undefined, 12, now)).toBe(false)
    expect(isPastRetention('not-a-date', 12, now)).toBe(false)
  })

  it('is false before the period passes', () => {
    expect(isPastRetention(new Date(now - 11 * MONTH_MS), 12, now)).toBe(false)
  })

  it('is true once the period passed', () => {
    expect(isPastRetention(new Date(now - 12 * MONTH_MS), 12, now)).toBe(true)
    expect(isPastRetention('2024-01-01T00:00:00Z', 12, now)).toBe(true)
  })
})
