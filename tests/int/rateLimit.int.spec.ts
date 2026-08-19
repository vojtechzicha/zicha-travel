import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, resetRateLimits } from '@/lib/rateLimit'

describe('checkRateLimit', () => {
  beforeEach(() => resetRateLimits())

  const opts = { limit: 3, windowMs: 60_000 }

  it('allows up to the limit inside one window', () => {
    const t = 1_000_000
    expect(checkRateLimit('k', opts, t).allowed).toBe(true)
    expect(checkRateLimit('k', opts, t + 1).allowed).toBe(true)
    expect(checkRateLimit('k', opts, t + 2).allowed).toBe(true)
    expect(checkRateLimit('k', opts, t + 3).allowed).toBe(false)
  })

  it('reports the seconds until the window resets', () => {
    const t = 1_000_000
    for (let i = 0; i < 3; i++) checkRateLimit('k', opts, t)
    const refused = checkRateLimit('k', opts, t + 30_000)
    expect(refused.allowed).toBe(false)
    expect(refused.retryAfterSeconds).toBe(30)
  })

  it('resets after the window passes', () => {
    const t = 1_000_000
    for (let i = 0; i < 4; i++) checkRateLimit('k', opts, t)
    expect(checkRateLimit('k', opts, t + 60_001).allowed).toBe(true)
  })

  it('keys are independent', () => {
    const t = 1_000_000
    for (let i = 0; i < 4; i++) checkRateLimit('a', opts, t)
    expect(checkRateLimit('b', opts, t).allowed).toBe(true)
  })
})
