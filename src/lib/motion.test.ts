import { describe, expect, it } from 'vitest'
import { cubicBezier, easeOut, formatFixed, roundTo } from './motion'

describe('easeOut', () => {
  it('pins the endpoints', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(-1)).toBe(0)
    expect(easeOut(2)).toBe(1)
  })

  it('is fast at the start and settles at the end', () => {
    expect(easeOut(0.2)).toBeGreaterThan(0.5)
    expect(easeOut(0.9)).toBeGreaterThan(0.99)
  })

  it('never decreases', () => {
    let prev = 0
    for (let t = 0; t <= 1; t += 0.05) {
      const y = easeOut(t)
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = y
    }
  })
})

describe('cubicBezier', () => {
  it('is the identity for a linear curve', () => {
    const linear = cubicBezier(0, 0, 1, 1)
    expect(linear(0.25)).toBeCloseTo(0.25, 4)
    expect(linear(0.75)).toBeCloseTo(0.75, 4)
  })
})

describe('formatFixed', () => {
  it('uses a fixed number of decimals with a dot separator', () => {
    expect(formatFixed(3, 1)).toBe('3.0')
    expect(formatFixed(31.64, 1)).toBe('31.6')
    expect(formatFixed(7.6)).toBe('8')
  })

  it('groups thousands only for whole numbers', () => {
    expect(formatFixed(12450)).toBe('12,450')
    expect(formatFixed(-12450)).toBe('-12,450')
    expect(formatFixed(999)).toBe('999')
    expect(formatFixed(1234.5, 1)).toBe('1234.5')
  })
})

describe('roundTo', () => {
  it('rounds to the requested decimals', () => {
    expect(roundTo(1.2345, 2)).toBe(1.23)
    expect(roundTo(1.5)).toBe(2)
  })

  it('never returns negative zero', () => {
    expect(Object.is(roundTo(-0.0004, 2), 0)).toBe(true)
  })

  it('keeps real negatives', () => {
    expect(roundTo(-1.234, 1)).toBe(-1.2)
  })
})
