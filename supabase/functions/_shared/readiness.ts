// Daily readiness (0–100): last night's HRV, resting heart rate and sleep against the
// user's own 30-day baseline. Pure, so the scoring and the copy are testable without Google.

import { personal } from './personal.ts'
import type { ReadinessComponent, ReadinessScore, ReadinessZone } from './types.ts'

const BASELINE_DAYS = 30
/** A component needs this many baseline days before it earns a score. */
const MIN_BASELINE_VALUES = 7
/** Minutes of sleep that count as a full night. */
const SLEEP_NEED_MIN = 450
const WEIGHTS = { hrv: 0.5, restingHr: 0.25, sleep: 0.25 }

export type ReadinessInput = {
  /** Local day the night ended (YYYY-MM-DD) */
  date: string
  hrvByDate: Map<string, number>
  rhrByDate: Map<string, number>
  sleepMinutesLastNight: number | null
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function addDaysIso(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)
}

type Baseline = { count: number; mean: number; sd: number }

/** Up to 30 days strictly before `date` that have a value. */
function baselineOf(byDate: Map<string, number>, date: string): Baseline {
  const vals: number[] = []
  for (let i = 1; i <= BASELINE_DAYS; i++) {
    const v = byDate.get(addDaysIso(date, -i))
    if (v != null) vals.push(v)
  }
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  const variance = vals.length ? vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length : 0
  return { count: vals.length, mean, sd: Math.sqrt(variance) }
}

type Scored = { component: ReadinessComponent; raw: number | null; z: number | null; hasBaseline: boolean }

function scoreAgainstBaseline(value: number | null, base: Baseline, lowerIsBetter: boolean): Scored {
  const hasBaseline = base.count >= MIN_BASELINE_VALUES
  const display = value == null ? null : Math.round(value)
  if (!hasBaseline) {
    return { component: { value: display, baseline: null, score: null }, raw: null, z: null, hasBaseline }
  }
  const baseline = Math.round(base.mean * 10) / 10
  if (value == null) {
    return { component: { value: null, baseline, score: null }, raw: null, z: null, hasBaseline }
  }
  const z = lowerIsBetter
    ? (base.mean - value) / Math.max(base.sd, 1)
    : (value - base.mean) / Math.max(base.sd, base.mean * 0.05, 1)
  const raw = clamp(50 + 25 * z, 0, 100)
  return { component: { value: display, baseline, score: Math.round(raw) }, raw, z, hasBaseline }
}

export function zoneOf(score: number): ReadinessZone {
  return score >= 67 ? 'green' : score >= 34 ? 'yellow' : 'red'
}

export function computeReadiness(input: ReadinessInput): ReadinessScore {
  const { date, sleepMinutesLastNight } = input
  const hrvBase = baselineOf(input.hrvByDate, date)
  const rhrBase = baselineOf(input.rhrByDate, date)

  const hrv = scoreAgainstBaseline(input.hrvByDate.get(date) ?? null, hrvBase, false)
  const rhr = scoreAgainstBaseline(input.rhrByDate.get(date) ?? null, rhrBase, true)

  const sleepRaw =
    sleepMinutesLastNight == null ? null : clamp((sleepMinutesLastNight / SLEEP_NEED_MIN) * 100, 0, 100)
  const sleep: ReadinessComponent = {
    value: sleepMinutesLastNight == null ? null : Math.round(sleepMinutesLastNight),
    baseline: SLEEP_NEED_MIN,
    score: sleepRaw == null ? null : Math.round(sleepRaw),
  }

  const baselineDays = Math.min(BASELINE_DAYS, Math.max(hrvBase.count, rhrBase.count))

  let score: number | null = null
  if (hrv.raw != null || rhr.raw != null) {
    const parts: [number, number][] = []
    if (hrv.raw != null) parts.push([hrv.raw, WEIGHTS.hrv])
    if (rhr.raw != null) parts.push([rhr.raw, WEIGHTS.restingHr])
    if (sleepRaw != null) parts.push([sleepRaw, WEIGHTS.sleep])
    const weight = parts.reduce((a, [, w]) => a + w, 0)
    score = Math.round(parts.reduce((a, [s, w]) => a + s * w, 0) / weight)
  }

  const building = score == null && !hrv.hasBaseline && !rhr.hasBaseline

  return {
    date,
    status: building ? 'building' : 'ok',
    score,
    zone: score == null ? null : zoneOf(score),
    hrv: hrv.component,
    restingHr: rhr.component,
    sleep,
    baselineDays,
  }
}

export type ReadinessNotification = { title: string; body: string; tag: string; url: string }

const ADVICE: Record<ReadinessZone, string> = {
  green: 'Good day to push.',
  yellow: 'Train as planned — listen to your body.',
  red: 'Recovery is low — go easy today.',
}

function sleepText(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** HRV against the user's normal; "near" is within half a standard deviation. */
function hrvDriver(hrv: ReadinessComponent): string | null {
  if (hrv.score == null) return null
  // score = 50 + 25z, so ±0.5 SD is 62.5 / 37.5
  if (hrv.score > 62.5) return 'HRV above your normal'
  if (hrv.score < 37.5) return 'HRV below your normal'
  return 'HRV near your normal'
}

export function readinessNotification(r: ReadinessScore, name: string | null): ReadinessNotification {
  const zone = r.zone ?? 'yellow'
  const label = zone.charAt(0).toUpperCase() + zone.slice(1)
  const score = r.score ?? 0

  const facts = [
    hrvDriver(r.hrv),
    r.restingHr.value != null ? `RHR ${r.restingHr.value}` : null,
    r.sleep.value != null ? `slept ${sleepText(r.sleep.value)}` : null,
  ].filter((p): p is string => p !== null)

  return {
    title: personal(name, (n) => `${n}, readiness ${score} · ${label}`, `Readiness ${score} · ${label}`),
    body: facts.length ? `${facts.join(' · ')}. ${ADVICE[zone]}` : ADVICE[zone],
    tag: 'grind-readiness',
    url: '/app',
  }
}
