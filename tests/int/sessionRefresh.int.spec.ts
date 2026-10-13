import { describe, it, expect } from 'vitest'
import { REFRESH_MIN_AGE_SECONDS, shouldRefreshSessionToken } from '@/lib/auth/sessionRefresh'
import { sessionDurationSeconds } from '@/lib/auth/session'

const NOW_MS = Date.parse('2026-08-30T12:00:00Z')
const nowSeconds = Math.floor(NOW_MS / 1000)
const userLife = sessionDurationSeconds('user')

const token = (ageSeconds: number, life = userLife) => ({
  iat: nowSeconds - ageSeconds,
  exp: nowSeconds - ageSeconds + life,
})

describe('sessionDurationSeconds', () => {
  it('keeps frontend accounts signed in for a year, admins for two hours', () => {
    expect(sessionDurationSeconds('user')).toBe(365 * 24 * 60 * 60)
    expect(sessionDurationSeconds('admin')).toBe(2 * 60 * 60)
    expect(sessionDurationSeconds('superadmin')).toBe(2 * 60 * 60)
    expect(sessionDurationSeconds(undefined)).toBe(2 * 60 * 60)
  })
})

describe('shouldRefreshSessionToken', () => {
  it('leaves a freshly issued token alone', () => {
    expect(shouldRefreshSessionToken(token(0), NOW_MS)).toBe(false)
    expect(shouldRefreshSessionToken(token(REFRESH_MIN_AGE_SECONDS - 1), NOW_MS)).toBe(false)
  })

  it('refreshes once the token is old enough', () => {
    expect(shouldRefreshSessionToken(token(REFRESH_MIN_AGE_SECONDS), NOW_MS)).toBe(true)
    expect(shouldRefreshSessionToken(token(60 * 60 * 24 * 30), NOW_MS)).toBe(true)
  })

  it('refreshes an admin token during an active session', () => {
    const adminLife = sessionDurationSeconds('admin')
    expect(shouldRefreshSessionToken(token(30 * 60, adminLife), NOW_MS)).toBe(true)
  })

  it('never refreshes an expired token', () => {
    expect(
      shouldRefreshSessionToken({ iat: nowSeconds - userLife - 60, exp: nowSeconds - 60 }, NOW_MS),
    ).toBe(false)
  })

  it('refuses tokens without timestamps', () => {
    expect(shouldRefreshSessionToken({}, NOW_MS)).toBe(false)
    expect(shouldRefreshSessionToken({ iat: nowSeconds }, NOW_MS)).toBe(false)
    expect(shouldRefreshSessionToken({ exp: nowSeconds + 100 }, NOW_MS)).toBe(false)
  })
})
