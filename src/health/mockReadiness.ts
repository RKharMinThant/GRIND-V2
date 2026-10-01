import { addDays } from '../lib/dates'
import { datesInRange, nightFor } from './mockSeed'
import type { ReadinessScore, ReadinessZone } from './types'

const SLEEP_NEED_MIN = 450
const BASELINE_DAYS = 30

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)

/** Demo readiness: last night against the seeded 30 nights before it. Deterministic per date. */
export function mockReadiness(date: string): ReadinessScore {
  const night = nightFor(date)
  const prev = datesInRange(addDays(date, -BASELINE_DAYS), addDays(date, -1)).map(nightFor)
  const hrvBase = mean(prev.map((p) => p.hrvMs))
  const rhrBase = mean(prev.map((p) => p.restingHr))

  const hrv = clamp(75 + ((night.hrvMs - hrvBase) / hrvBase) * 150)
  const rhr = clamp(75 - ((night.restingHr - rhrBase) / rhrBase) * 300)
  const sleep = clamp((night.sleepMin / SLEEP_NEED_MIN) * 100)
  const score = clamp(hrv * 0.5 + rhr * 0.25 + sleep * 0.25)
  const zone: ReadinessZone = score >= 67 ? 'green' : score >= 34 ? 'yellow' : 'red'

  return {
    date,
    status: 'ok',
    score,
    zone,
    hrv: { value: night.hrvMs, baseline: hrvBase, score: hrv },
    restingHr: { value: night.restingHr, baseline: rhrBase, score: rhr },
    sleep: { value: night.sleepMin, baseline: SLEEP_NEED_MIN, score: sleep },
    baselineDays: BASELINE_DAYS,
  }
}
