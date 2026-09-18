import { describe, expect, it } from 'vitest'
import { localParts } from './localTime'

describe('localParts', () => {
  it('converts an instant into the local day and hour', () => {
    // 2026-09-18T12:30Z — Yangon is UTC+6:30, so 19:00 the same day
    const now = new Date('2026-09-18T12:30:00Z')
    expect(localParts(now, 'Asia/Yangon')).toEqual({ day: '2026-09-18', hour: 19 })
    expect(localParts(now, 'UTC')).toEqual({ day: '2026-09-18', hour: 12 })
  })

  it('rolls the date back for zones behind UTC', () => {
    const now = new Date('2026-09-18T02:00:00Z')
    // New York is UTC-4 in September — still the previous evening
    expect(localParts(now, 'America/New_York')).toEqual({ day: '2026-09-17', hour: 22 })
  })

  it('rolls the date forward for zones ahead of UTC', () => {
    const now = new Date('2026-09-18T22:00:00Z')
    expect(localParts(now, 'Asia/Tokyo')).toEqual({ day: '2026-09-19', hour: 7 })
  })

  it('reports midnight as hour 0, not 24', () => {
    const now = new Date('2026-09-18T00:30:00Z')
    expect(localParts(now, 'UTC').hour).toBe(0)
  })

  it('falls back to UTC when the stored zone is nonsense', () => {
    // A bad zone must not take down the whole scheduled run
    const now = new Date('2026-09-18T12:30:00Z')
    expect(localParts(now, 'Not/AZone')).toEqual({ day: '2026-09-18', hour: 12 })
    expect(localParts(now, '')).toEqual({ day: '2026-09-18', hour: 12 })
  })
})
