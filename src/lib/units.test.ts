import { describe, expect, it } from 'vitest'
import { formatDistance, kmToMiles } from './units'

describe('kmToMiles', () => {
  it('converts', () => {
    expect(kmToMiles(6.9)).toBeCloseTo(4.29, 2)
    expect(kmToMiles(0)).toBe(0)
  })
})

describe('formatDistance', () => {
  it('formats in the chosen unit', () => {
    expect(formatDistance(6.9, 'km')).toBe('6.9 km')
    expect(formatDistance(6.9, 'mi')).toBe('4.3 mi')
    expect(formatDistance(null, 'km')).toBe('—')
    expect(formatDistance(12, 'km')).toBe('12.0 km')
  })
})
