import type { ReadinessScore, ReadinessZone } from './types'

/** What the Home card says per zone (colours live in CSS: .readiness.green / .yellow / .red). */
export const ZONE_INFO: Record<ReadinessZone, { word: string; line: string }> = {
  green: { word: 'Green', line: 'Good day to push' },
  yellow: { word: 'Yellow', line: 'Train as planned — listen to your body' },
  red: { word: 'Red', line: 'Recovery is low — go easy today' },
}

export type ReadinessView =
  /** Not enough history yet */
  | { kind: 'building'; days: number }
  /** Scored: show the ring */
  | { kind: 'score'; score: number; zone: ReadinessZone }
  /** Ok but nothing to score (no HRV and no resting HR last night), or no readiness at all */
  | { kind: 'none' }

export function readinessView(r: ReadinessScore | null): ReadinessView {
  if (!r) return { kind: 'none' }
  if (r.status === 'building') return { kind: 'building', days: r.baselineDays }
  if (r.score == null || r.zone == null) return { kind: 'none' }
  return { kind: 'score', score: r.score, zone: r.zone }
}

/** Last night minus its baseline, rounded; null when either is missing. */
export function deltaVsBaseline(value: number | null, baseline: number | null): number | null {
  if (value == null || baseline == null) return null
  return Math.round(value - baseline)
}
