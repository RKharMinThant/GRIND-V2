import { addDays, startOfWeekSunday, toLocalDateString, weekSessionCount } from './dates'
import { parseFocusAreas } from '../types/database'
import type { Log } from '../types/database'
import { parseDuration } from './duration'

export type FocusStat = { label: string; count: number; pct: number }
export type TypeStat = { label: string; count: number }
export type WeekBar = { key: string; label: string; count: number }

export type ProgressInsights = {
  weekSessions: number
  weekGoal: number
  weekPct: number
  proteinTotal: number
  creatineDays: number
  totalMinutes: number
  topFocuses: FocusStat[]
  topTypes: TypeStat[]
  last4Weeks: WeekBar[]
  restDays: number
}

export function buildProgressInsights(logs: Log[], weeklyGoal: number): ProgressInsights {
  const today = toLocalDateString()
  const weekSessions = weekSessionCount(
    logs.map((l) => l.log_date),
    today,
  )
  const weekGoal = Math.max(1, weeklyGoal)
  const weekPct = Math.min(100, Math.round((weekSessions / weekGoal) * 100))

  let proteinTotal = 0
  let creatineDays = 0
  let totalMinutes = 0
  let restDays = 0
  const focusCounts = new Map<string, number>()
  const typeCounts = new Map<string, number>()

  for (const log of logs) {
    if (log.protein_g != null) proteinTotal += Number(log.protein_g) || 0
    if (log.creatine_g != null && Number(log.creatine_g) > 0) creatineDays += 1

    const d = parseDuration(log.duration)
    totalMinutes += d.hours * 60 + d.minutes

    const focuses = parseFocusAreas(log.focus_areas)
    if (!focuses.length) {
      const w = log.workout?.trim().toLowerCase()
      if (w === 'rest' || w === 'rest day') restDays += 1
    }
    for (const f of focuses) {
      focusCounts.set(f, (focusCounts.get(f) ?? 0) + 1)
    }
    if (log.workout_type) {
      typeCounts.set(log.workout_type, (typeCounts.get(log.workout_type) ?? 0) + 1)
    }
  }

  const focusTotal = [...focusCounts.values()].reduce((a, b) => a + b, 0) || 1
  const topFocuses: FocusStat[] = [...focusCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / focusTotal) * 100),
    }))

  const topTypes: TypeStat[] = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }))

  // Last 4 weeks including current (Sun–Sat buckets)
  const last4Weeks: WeekBar[] = []
  const thisWeekStart = startOfWeekSunday(today)
  for (let w = 3; w >= 0; w--) {
    const start = addDays(thisWeekStart, -7 * w)
    const end = addDays(start, 6)
    let count = 0
    const set = new Set(logs.map((l) => l.log_date))
    for (let i = 0; i < 7; i++) {
      if (set.has(addDays(start, i))) count += 1
    }
    const label =
      w === 0
        ? 'This week'
        : w === 1
          ? 'Last week'
          : start.slice(5) // MM-DD
    last4Weeks.push({ key: start, label, count })
    void end
  }

  return {
    weekSessions,
    weekGoal,
    weekPct,
    proteinTotal: Math.round(proteinTotal),
    creatineDays,
    totalMinutes,
    topFocuses,
    topTypes,
    last4Weeks,
    restDays,
  }
}

export function formatMinutes(total: number): string {
  if (total <= 0) return '0m'
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}
