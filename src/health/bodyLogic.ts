import { addDays } from '../lib/dates'

/** Share of the step goal reached, clamped to 0..1. */
export function stepGoalProgress(steps: number | null, goal: number): number {
  if (steps == null || goal <= 0) return 0
  return Math.min(1, Math.max(0, steps / goal))
}

/** The last `n` calendar days ending at `endDate`, oldest → newest; `null` where there's no entry. */
export function lastNDays<T extends { date: string }>(series: T[], n: number, endDate: string): (T | null)[] {
  const byDate = new Map(series.map((item) => [item.date, item]))
  return Array.from({ length: n }, (_, i) => byDate.get(addDays(endDate, i - n + 1)) ?? null)
}

/** Latest value minus the mean of the earlier values, rounded. */
export function meanDelta(values: number[]): number | null {
  if (values.length < 2) return null
  const previous = values.slice(0, -1)
  const mean = previous.reduce((a, b) => a + b, 0) / previous.length
  return Math.round(values[values.length - 1] - mean)
}

export function formatKm(km: number | null): string {
  return km == null ? '—' : `${km.toFixed(1)} km`
}

/** Local clock time, e.g. "11:52 PM". */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
