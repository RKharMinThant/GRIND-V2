import type { DailyActivity } from '../health/types'
import { addDays, toLocalDateString } from './dates'
import type { LiftHistoryPoint } from './overload'
import { convertSets, type WeightUnit } from './strength'
import { volumeOf } from './overload'

// The server's weekly report uses these same definitions — keep them in step.
// "This week" = the 7 days ending today. Baseline = average weekly total over the 4 weeks before.

export type LoadStatus = 'building' | 'ramping' | 'lighter' | 'steady'

export type LoadSummary = {
  thisWeek: number
  baseline: number
  /** thisWeek ÷ baseline; null while there is no baseline yet */
  ratio: number | null
  status: LoadStatus
}

export const RAMPING_ABOVE = 1.5
export const LIGHTER_BELOW = 0.8

export const LOAD_STATUS_TEXT: Record<LoadStatus, string> = {
  building: 'Building your baseline',
  ramping: 'Ramping up fast — ease in to avoid overreaching',
  lighter: 'Lighter than usual',
  steady: 'In your usual range',
}

export const LOAD_STATUS_CHIP: Record<LoadStatus, string> = {
  building: 'Building',
  ramping: 'Ramping up',
  lighter: 'Lighter',
  steady: 'Steady',
}

/** Total lifting volume per local date, in `unit`. */
export function liftingVolumeByDay(history: LiftHistoryPoint[], unit: WeightUnit): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const p of history) {
    const at = new Date(p.recorded_at)
    if (Number.isNaN(at.getTime())) continue
    const from: WeightUnit = p.unit === 'lb' ? 'lb' : 'kg'
    const volume = volumeOf(convertSets(p.sets_detail, from, unit))
    const date = toLocalDateString(at)
    byDay.set(date, (byDay.get(date) ?? 0) + volume)
  }
  return byDay
}

/** Fat burn + cardio + peak zone minutes per date. Days without zone data are left out. */
export function zoneMinutesByDay(activity: DailyActivity[]): Map<string, number> {
  const byDay = new Map<string, number>()
  for (const day of activity) {
    if (!day.azm) continue
    byDay.set(day.date, day.azm.fatBurn + day.azm.cardio + day.azm.peak)
  }
  return byDay
}

function sumDays(byDay: Map<string, number>, today: string, from: number, to: number): number {
  let total = 0
  for (let i = from; i <= to; i++) total += byDay.get(addDays(today, -i)) ?? 0
  return total
}

export function loadStatus(ratio: number | null): LoadStatus {
  if (ratio === null) return 'building'
  if (ratio > RAMPING_ABOVE) return 'ramping'
  if (ratio < LIGHTER_BELOW) return 'lighter'
  return 'steady'
}

/**
 * This week (days 0–6 back) against the average week of the `baselineDays` before it
 * (days 7 … 6 + baselineDays back). Pass fewer than 28 when the data covers less.
 */
export function loadSummary(byDay: Map<string, number>, today: string, baselineDays = 28): LoadSummary {
  const thisWeek = sumDays(byDay, today, 0, 6)
  const baseline = sumDays(byDay, today, 7, 6 + baselineDays) / (baselineDays / 7)
  const ratio = baseline > 0 ? thisWeek / baseline : null
  return { thisWeek, baseline, ratio, status: loadStatus(ratio) }
}

/** "+18%" / "-12%" / "0%" for the ratio, or null with no baseline. */
export function formatVsAverage(ratio: number | null): string | null {
  if (ratio === null) return null
  const pct = Math.round((ratio - 1) * 100)
  return `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${Math.abs(pct)}%`
}
