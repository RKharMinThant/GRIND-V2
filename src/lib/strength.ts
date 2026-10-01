import type { LiftSet } from '../types/database'
import { maxWeight, volumeOf, type LiftHistoryPoint } from './overload'

export type WeightUnit = 'kg' | 'lb'
export type PrKind = 'oneRepMax' | 'heaviest' | 'volume'

export type PrEvent = {
  liftName: string
  kind: PrKind
  value: number
  unit: WeightUnit
  recorded_at: string
}

export type PersonalBests = {
  oneRepMax: { value: number; recorded_at: string } | null
  heaviest: { value: number; reps: number; recorded_at: string } | null
  volume: { value: number; recorded_at: string } | null
}

const KG_PER_LB = 0.45359237
/** Epley is unreliable for high-rep sets, so reps above this are treated as this many. */
const EPLEY_REP_CAP = 12

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step
}

/** Convert a weight between kg and lb (1 lb = 0.45359237 kg). */
export function toUnit(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  return from === 'lb' ? value * KG_PER_LB : value / KG_PER_LB
}

/**
 * Estimated one-rep max via Epley: weight × (1 + reps / 30), rounded to 0.5.
 * Epley drifts badly for high-rep sets, so reps are capped at 12 for the estimate.
 */
export function estimatedOneRepMax(set: LiftSet): number {
  if (set.reps <= 0 || set.weight <= 0) return 0
  if (set.reps === 1) return set.weight
  const reps = Math.min(set.reps, EPLEY_REP_CAP)
  return roundTo(set.weight * (1 + reps / 30), 0.5)
}

export function bestOneRepMax(sets: LiftSet[]): number {
  return sets.reduce((best, s) => Math.max(best, estimatedOneRepMax(s)), 0)
}

/** Convert every set's weight between units, rounded to 0.1. */
export function convertSets(sets: LiftSet[], from: WeightUnit, to: WeightUnit): LiftSet[] {
  if (from === to) return sets
  return sets.map((s) => ({ reps: s.reps, weight: roundTo(toUnit(s.weight, from, to), 0.1) }))
}

type Metrics = { oneRepMax: number; heaviest: number; heaviestReps: number; volume: number }

function metricsOf(sets: LiftSet[]): Metrics {
  let heaviest = 0
  let heaviestReps = 0
  for (const s of sets) {
    if (s.weight > heaviest || (s.weight === heaviest && s.reps > heaviestReps)) {
      heaviest = s.weight
      heaviestReps = s.reps
    }
  }
  return {
    oneRepMax: bestOneRepMax(sets),
    heaviest,
    heaviestReps,
    volume: roundTo(volumeOf(sets), 0.1),
  }
}

function pointMetrics(p: LiftHistoryPoint, unit: WeightUnit): Metrics {
  const from: WeightUnit = p.unit === 'lb' ? 'lb' : 'kg'
  return metricsOf(convertSets(p.sets_detail, from, unit))
}

function byTime(history: LiftHistoryPoint[]): LiftHistoryPoint[] {
  return [...history].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
}

/** Best of each category across a lift's history, compared in `unit`. Earliest entry wins ties. */
export function personalBests(history: LiftHistoryPoint[], unit: WeightUnit): PersonalBests {
  const bests: PersonalBests = { oneRepMax: null, heaviest: null, volume: null }
  for (const p of byTime(history)) {
    const m = pointMetrics(p, unit)
    if (m.oneRepMax > 0 && m.oneRepMax > (bests.oneRepMax?.value ?? 0)) {
      bests.oneRepMax = { value: m.oneRepMax, recorded_at: p.recorded_at }
    }
    if (m.heaviest > 0 && m.heaviest > (bests.heaviest?.value ?? 0)) {
      bests.heaviest = { value: m.heaviest, reps: m.heaviestReps, recorded_at: p.recorded_at }
    }
    if (m.volume > 0 && m.volume > (bests.volume?.value ?? 0)) {
      bests.volume = { value: m.volume, recorded_at: p.recorded_at }
    }
  }
  return bests
}

/**
 * PRs set along a lift's history (oldest to newest). An entry must strictly beat
 * every earlier entry; the first entry has nothing to beat, so it is never a PR.
 */
export function prEvents(
  liftName: string,
  history: LiftHistoryPoint[],
  unit: WeightUnit,
): PrEvent[] {
  const events: PrEvent[] = []
  let best: { oneRepMax: number; heaviest: number; volume: number } | null = null
  for (const p of byTime(history)) {
    const m = pointMetrics(p, unit)
    if (best) {
      const kinds: [PrKind, number, number][] = [
        ['oneRepMax', m.oneRepMax, best.oneRepMax],
        ['heaviest', m.heaviest, best.heaviest],
        ['volume', m.volume, best.volume],
      ]
      for (const [kind, value, prior] of kinds) {
        if (value > prior) {
          events.push({ liftName, kind, value, unit, recorded_at: p.recorded_at })
        }
      }
      best = {
        oneRepMax: Math.max(best.oneRepMax, m.oneRepMax),
        heaviest: Math.max(best.heaviest, m.heaviest),
        volume: Math.max(best.volume, m.volume),
      }
    } else {
      best = { oneRepMax: m.oneRepMax, heaviest: m.heaviest, volume: m.volume }
    }
  }
  return events
}

/** Newest first. */
export function recentPrs(events: PrEvent[], limit = 8): PrEvent[] {
  return [...events]
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
    .slice(0, limit)
}

/** Which categories `newSets` (in `unit`) would beat versus all previous entries. */
export function newPrKinds(
  previousHistory: LiftHistoryPoint[],
  newSets: LiftSet[],
  unit: WeightUnit,
): PrKind[] {
  if (previousHistory.length === 0) return []
  const prior = personalBests(previousHistory, unit)
  const m = metricsOf(newSets)
  const kinds: PrKind[] = []
  if (m.oneRepMax > (prior.oneRepMax?.value ?? 0)) kinds.push('oneRepMax')
  if (m.heaviest > (prior.heaviest?.value ?? 0)) kinds.push('heaviest')
  if (m.volume > (prior.volume?.value ?? 0)) kinds.push('volume')
  return kinds
}

const KIND_PRIORITY: PrKind[] = ['oneRepMax', 'heaviest', 'volume']

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}

/** One-line toast for PRs just achieved by `sets`: the most meaningful kind, plus "+N more". */
export function formatPrToast(
  liftName: string,
  kinds: PrKind[],
  sets: LiftSet[],
  unit: WeightUnit,
): string | null {
  const top = KIND_PRIORITY.find((k) => kinds.includes(k))
  if (!top) return null
  const detail =
    top === 'oneRepMax'
      ? `1RM est. ${fmt(bestOneRepMax(sets))} ${unit}`
      : top === 'heaviest'
        ? `Heaviest ${fmt(maxWeight(sets))} ${unit}`
        : `Volume ${Math.round(volumeOf(sets)).toLocaleString('en-US')} ${unit}`
  const more = kinds.length > 1 ? ` · +${kinds.length - 1} more` : ''
  return `New PR · ${liftName} · ${detail}${more}`
}
