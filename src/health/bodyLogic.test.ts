import { describe, expect, it } from 'vitest'
import { formatKm, lastNDays, meanDelta, stepGoalProgress } from './bodyLogic'

describe('stepGoalProgress', () => {
  it.each([
    [null, 10000, 0],
    [0, 10000, 0],
    [7500, 10000, 0.75],
    [15000, 10000, 1],
    [500, 0, 0],
  ])('%s / %s → %s', (steps, goal, out) => expect(stepGoalProgress(steps, goal)).toBe(out))
})

describe('lastNDays', () => {
  it('returns n slots oldest → newest, null where missing', () => {
    const series = [
      { date: '2026-09-14', v: 1 },
      { date: '2026-09-16', v: 3 },
      { date: '2026-09-10', v: 0 },
    ]
    expect(lastNDays(series, 4, '2026-09-17')).toEqual([
      { date: '2026-09-14', v: 1 },
      null,
      { date: '2026-09-16', v: 3 },
      null,
    ])
  })
})

describe('meanDelta', () => {
  it('compares the last value with the mean of the previous ones', () => {
    expect(meanDelta([60, 62, 64, 58])).toBe(-4)
    expect(meanDelta([50])).toBeNull()
    expect(meanDelta([])).toBeNull()
  })
})

describe('formatKm', () => {
  it('formats kilometres', () => {
    expect(formatKm(5.34)).toBe('5.3 km')
    expect(formatKm(12)).toBe('12.0 km')
    expect(formatKm(null)).toBe('—')
  })
})
