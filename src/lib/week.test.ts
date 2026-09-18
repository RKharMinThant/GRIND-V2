import { describe, expect, it } from 'vitest'
import { startOfWeek, weekdayLabels, weekSessionCount } from './dates'

// 2026-09-18 is a Friday
describe('startOfWeek', () => {
  it('handles both week starts', () => {
    expect(startOfWeek('2026-09-18', 0)).toBe('2026-09-13')
    expect(startOfWeek('2026-09-18', 1)).toBe('2026-09-14')
    // On the start day itself
    expect(startOfWeek('2026-09-13', 0)).toBe('2026-09-13')
    expect(startOfWeek('2026-09-14', 1)).toBe('2026-09-14')
    // Sunday with a Monday week start belongs to the previous week
    expect(startOfWeek('2026-09-20', 1)).toBe('2026-09-14')
  })
})

describe('weekSessionCount', () => {
  const dates = ['2026-09-13', '2026-09-14', '2026-09-18']
  it('counts unique days in the current week', () => {
    expect(weekSessionCount(dates, '2026-09-18', 0)).toBe(3)
    // Monday weeks exclude Sunday the 13th
    expect(weekSessionCount(dates, '2026-09-18', 1)).toBe(2)
  })
})

describe('weekdayLabels', () => {
  it('rotates for the week start', () => {
    expect(weekdayLabels(0)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
    expect(weekdayLabels(1)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  })
})
