import { describe, expect, it } from 'vitest'
import { currentWeekStart } from './grindAge'

describe('currentWeekStart', () => {
  it('returns the same day for a Monday', () => {
    expect(currentWeekStart('2026-10-05')).toBe('2026-10-05')
  })

  it('goes back to the previous Monday from a Sunday', () => {
    expect(currentWeekStart('2026-10-04')).toBe('2026-09-28')
  })

  it('handles a mid-week day', () => {
    expect(currentWeekStart('2026-10-01')).toBe('2026-09-28')
  })

  it('crosses a month boundary', () => {
    expect(currentWeekStart('2026-03-01')).toBe('2026-02-23')
  })

  it('crosses a year boundary', () => {
    expect(currentWeekStart('2027-01-01')).toBe('2026-12-28')
  })
})
