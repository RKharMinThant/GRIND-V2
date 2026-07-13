import { addDays, monthKey, toLocalDateString } from './dates'

export type StreakStats = {
  current: number
  best: number
  totalDays: number
  monthDays: number
  hasToday: boolean
}

/**
 * Unique sorted log dates (desc), then compute streaks/stats.
 *
 * Current streak = length of the consecutive day run that includes "today"
 * (or yesterday if today isn't logged yet — grace for evening).
 * Counts both past and future consecutive days so logging today + tomorrow
 * still shows 2, and best/current stay intuitive.
 */
export function calcStreakStats(logDates: string[], today = toLocalDateString()): StreakStats {
  const unique = [...new Set(logDates.filter(Boolean))].sort().reverse()
  const dateSet = new Set(unique)
  const hasToday = dateSet.has(today)
  const totalDays = unique.length
  const thisMonth = monthKey(today)
  const monthDays = unique.filter((d) => d.startsWith(thisMonth)).length

  if (!unique.length) {
    return { current: 0, best: 0, totalDays: 0, monthDays: 0, hasToday: false }
  }

  // Best streak: scan unique dates descending (newest → oldest)
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of unique) {
    if (prev === null) {
      run = 1
    } else if (addDays(prev, -1) === d) {
      run += 1
    } else {
      run = 1
    }
    best = Math.max(best, run)
    prev = d
  }

  // Anchor: today if logged, otherwise yesterday (streak still "alive")
  const anchor = hasToday ? today : addDays(today, -1)
  if (!dateSet.has(anchor)) {
    return { current: 0, best, totalDays, monthDays, hasToday }
  }

  // Walk backward from anchor
  let current = 0
  let cursor = anchor
  while (dateSet.has(cursor)) {
    current += 1
    cursor = addDays(cursor, -1)
  }

  // Walk forward from day after anchor (covers logs dated ahead that continue the run)
  cursor = addDays(anchor, 1)
  while (dateSet.has(cursor)) {
    current += 1
    cursor = addDays(cursor, 1)
  }

  // Current can never exceed best; keep best honest if we only just formed a run
  best = Math.max(best, current)

  return { current, best, totalDays, monthDays, hasToday }
}

export function countByDate(logDates: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const d of logDates) {
    map.set(d, (map.get(d) ?? 0) + 1)
  }
  return map
}
