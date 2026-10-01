import { describe, expect, it } from 'vitest'
import { computeReadiness, readinessNotification, zoneOf } from './readiness'
import type { ReadinessScore } from './types'

const DATE = '2026-09-30'
const day = (back: number) => new Date(Date.parse(`${DATE}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10)

/** `count` days before DATE alternating between a and b: mean (a+b)/2, SD |a−b|/2. */
function history(count: number, a: number, b: number) {
  const m = new Map<string, number>()
  for (let i = 1; i <= count; i++) m.set(day(i), i % 2 ? a : b)
  return m
}

// HRV mean 55 / SD 5 · resting HR mean 60 / SD 2
const hrvHistory = (count = 14) => history(count, 50, 60)
const rhrHistory = (count = 14) => history(count, 58, 62)

function compute(over: { hrv?: number | null; rhr?: number | null; sleep?: number | null; days?: number } = {}) {
  const hrv = hrvHistory(over.days)
  const rhr = rhrHistory(over.days)
  if (over.hrv !== null) hrv.set(DATE, over.hrv ?? 55)
  if (over.rhr !== null) rhr.set(DATE, over.rhr ?? 60)
  return computeReadiness({
    date: DATE,
    hrvByDate: hrv,
    rhrByDate: rhr,
    sleepMinutesLastNight: over.sleep === undefined ? 450 : over.sleep,
  })
}

describe('computeReadiness', () => {
  it('scores a normal night at z ≈ 0', () => {
    const r = compute()
    expect(r.status).toBe('ok')
    expect(r.hrv).toEqual({ value: 55, baseline: 55, score: 50 })
    expect(r.restingHr).toEqual({ value: 60, baseline: 60, score: 50 })
    expect(r.sleep).toEqual({ value: 450, baseline: 450, score: 100 })
    // (50 × .5 + 50 × .25 + 100 × .25) = 62.5
    expect(r.score).toBe(63)
    expect(r.zone).toBe('yellow')
    expect(r.baselineDays).toBe(14)
  })

  it('is green with high HRV, low resting HR and a full night', () => {
    const r = compute({ hrv: 70, rhr: 55, sleep: 480 })
    expect(r.hrv.score).toBe(100)
    expect(r.restingHr.score).toBe(100)
    expect(r.score).toBe(100)
    expect(r.zone).toBe('green')
  })

  it('is red after a poor night', () => {
    const r = compute({ hrv: 40, rhr: 68, sleep: 240 })
    expect(r.hrv.score).toBe(0)
    expect(r.restingHr.score).toBe(0)
    expect(r.sleep.score).toBe(53)
    expect(r.score).toBe(13)
    expect(r.zone).toBe('red')
  })

  it('stays in building until a baseline has 7 values', () => {
    const r = compute({ days: 6 })
    expect(r.status).toBe('building')
    expect(r.score).toBeNull()
    expect(r.zone).toBeNull()
    expect(r.hrv).toEqual({ value: 55, baseline: null, score: null })
    expect(r.restingHr.score).toBeNull()
    expect(r.sleep.score).toBe(100)
    expect(r.baselineDays).toBe(6)
  })

  it('scores from one component when the other baseline is still short', () => {
    const rhr = rhrHistory(5)
    rhr.set(DATE, 60)
    const hrv = hrvHistory(10)
    hrv.set(DATE, 55)
    const r = computeReadiness({ date: DATE, hrvByDate: hrv, rhrByDate: rhr, sleepMinutesLastNight: 450 })
    expect(r.status).toBe('ok')
    expect(r.restingHr.score).toBeNull()
    expect(r.score).toBe(67) // (50 × .5 + 100 × .25) / .75
    expect(r.baselineDays).toBe(10)
  })

  it('reweights when HRV is missing', () => {
    const r = compute({ hrv: null })
    expect(r.hrv.value).toBeNull()
    expect(r.hrv.score).toBeNull()
    expect(r.hrv.baseline).toBe(55)
    expect(r.score).toBe(75) // (50 × .25 + 100 × .25) / .5
  })

  it('reweights when sleep is missing', () => {
    const r = compute({ sleep: null })
    expect(r.sleep).toEqual({ value: null, baseline: 450, score: null })
    expect(r.score).toBe(50)
  })

  it('has no score, but is not building, when last night has no HRV or resting HR', () => {
    const r = compute({ hrv: null, rhr: null })
    expect(r.status).toBe('ok')
    expect(r.score).toBeNull()
    expect(r.zone).toBeNull()
  })

  it('caps the sleep score at 100', () => {
    expect(compute({ sleep: 600 }).sleep.score).toBe(100)
    expect(compute({ sleep: 600 }).sleep.value).toBe(600)
  })

  it('uses only the 30 days before the date', () => {
    const hrv = hrvHistory(14)
    hrv.set(day(40), 500) // too old
    hrv.set(DATE, 55)
    const r = computeReadiness({ date: DATE, hrvByDate: hrv, rhrByDate: rhrHistory(14), sleepMinutesLastNight: 450 })
    expect(r.hrv.baseline).toBe(55)
    expect(r.baselineDays).toBe(14)
  })

  it('caps baselineDays at 30', () => {
    expect(compute({ days: 45 }).baselineDays).toBe(30)
  })

  it('floors the HRV spread so a flat baseline does not explode', () => {
    const flat = new Map<string, number>()
    for (let i = 1; i <= 10; i++) flat.set(day(i), 50)
    flat.set(DATE, 52)
    const r = computeReadiness({ date: DATE, hrvByDate: flat, rhrByDate: new Map(), sleepMinutesLastNight: null })
    // SD 0 → floor max(0, 2.5, 1) = 2.5 → z 0.8 → 70
    expect(r.hrv.score).toBe(70)
  })
})

describe('zoneOf', () => {
  it('splits at 67 and 34', () => {
    expect(zoneOf(67)).toBe('green')
    expect(zoneOf(66)).toBe('yellow')
    expect(zoneOf(34)).toBe('yellow')
    expect(zoneOf(33)).toBe('red')
    expect(zoneOf(0)).toBe('red')
    expect(zoneOf(100)).toBe('green')
  })
})

const readiness = (over: Partial<ReadinessScore> = {}): ReadinessScore => ({
  date: DATE,
  status: 'ok',
  score: 82,
  zone: 'green',
  hrv: { value: 68, baseline: 55, score: 85 },
  restingHr: { value: 61, baseline: 62, score: 55 },
  sleep: { value: 432, baseline: 450, score: 96 },
  baselineDays: 30,
  ...over,
})

describe('readinessNotification', () => {
  it('writes the green copy with a name', () => {
    const n = readinessNotification(readiness(), 'Andy')
    expect(n.title).toBe('Andy, readiness 82 · Green')
    expect(n.body).toBe('HRV above your normal · RHR 61 · slept 7h 12m. Good day to push.')
    expect(n.tag).toBe('grind-readiness')
    expect(n.url).toBe('/app')
  })

  it('drops the name when there is none', () => {
    expect(readinessNotification(readiness(), null).title).toBe('Readiness 82 · Green')
  })

  it('writes the yellow copy', () => {
    const n = readinessNotification(
      readiness({ score: 55, zone: 'yellow', hrv: { value: 56, baseline: 55, score: 52 } }),
      null,
    )
    expect(n.title).toBe('Readiness 55 · Yellow')
    expect(n.body).toBe('HRV near your normal · RHR 61 · slept 7h 12m. Train as planned — listen to your body.')
  })

  it('writes the red copy', () => {
    const n = readinessNotification(
      readiness({
        score: 21,
        zone: 'red',
        hrv: { value: 41, baseline: 55, score: 10 },
        sleep: { value: 300, baseline: 450, score: 67 },
      }),
      'Andy',
    )
    expect(n.title).toBe('Andy, readiness 21 · Red')
    expect(n.body).toBe('HRV below your normal · RHR 61 · slept 5h. Recovery is low — go easy today.')
  })

  it('omits facts that are missing', () => {
    const n = readinessNotification(
      readiness({
        restingHr: { value: null, baseline: 62, score: null },
        sleep: { value: null, baseline: 450, score: null },
      }),
      null,
    )
    expect(n.body).toBe('HRV above your normal. Good day to push.')

    const noHrv = readinessNotification(
      readiness({ hrv: { value: null, baseline: null, score: null }, sleep: { value: 45, baseline: 450, score: 10 } }),
      null,
    )
    expect(noHrv.body).toBe('RHR 61 · slept 45m. Good day to push.')
  })
})
