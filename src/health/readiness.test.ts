import { describe, expect, it } from 'vitest'
import { deltaVsBaseline, readinessView, ZONE_INFO } from './readiness'
import { mockReadiness } from './mockReadiness'
import type { ReadinessScore } from './types'

const comp = { value: 50, baseline: 50, score: 70 }
const base: ReadinessScore = {
  date: '2026-09-25',
  status: 'ok',
  score: 80,
  zone: 'green',
  hrv: comp,
  restingHr: comp,
  sleep: comp,
  baselineDays: 30,
}

describe('readinessView', () => {
  it('shows the ring for a scored day', () => {
    expect(readinessView(base)).toEqual({ kind: 'score', score: 80, zone: 'green' })
  })

  it('shows the baseline message while building', () => {
    expect(readinessView({ ...base, status: 'building', score: null, zone: null, baselineDays: 3 })).toEqual({
      kind: 'building',
      days: 3,
    })
  })

  it('hides the ring when ok but unscored, or when there is no readiness', () => {
    expect(readinessView({ ...base, score: null, zone: null })).toEqual({ kind: 'none' })
    expect(readinessView(null)).toEqual({ kind: 'none' })
  })
})

describe('deltaVsBaseline', () => {
  it('rounds the difference and tolerates missing numbers', () => {
    expect(deltaVsBaseline(58, 61.4)).toBe(-3)
    expect(deltaVsBaseline(null, 60)).toBeNull()
    expect(deltaVsBaseline(60, null)).toBeNull()
  })
})

describe('zones', () => {
  it('names the zones Primed, Steady and Recover', () => {
    expect([ZONE_INFO.green.word, ZONE_INFO.yellow.word, ZONE_INFO.red.word]).toEqual(['Primed', 'Steady', 'Recover'])
  })

  it('carries the agreed advice lines', () => {
    expect(ZONE_INFO.green.line).toBe('Good day to push')
    expect(ZONE_INFO.red.line).toBe('Recovery is low — go easy today')
  })
})

describe('mockReadiness', () => {
  it('is deterministic, in range, and zoned consistently', () => {
    const a = mockReadiness('2026-09-25')
    expect(mockReadiness('2026-09-25')).toEqual(a)
    expect(a.status).toBe('ok')
    expect(a.baselineDays).toBe(30)
    expect(a.score).toBeGreaterThanOrEqual(0)
    expect(a.score).toBeLessThanOrEqual(100)
    expect(a.zone).toBe(a.score! >= 67 ? 'green' : a.score! >= 34 ? 'yellow' : 'red')
  })
})
