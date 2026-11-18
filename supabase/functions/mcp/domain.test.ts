// Run with `npx vitest run supabase/functions/mcp` (same as the other _shared tests).
import { describe, expect, it } from 'vitest'
import {
  activityToWorkoutType,
  addDays,
  bestOneRepMax,
  calcStreakStats,
  convertSets,
  durationMinutes,
  durationText,
  estimatedOneRepMax,
  focusLabel,
  formatVsAverage,
  gramsOrNull,
  isRest,
  loadStatus,
  loadSummary,
  newPrKinds,
  parseFocusAreas,
  parseSetsDetail,
  personalBests,
  prEvents,
  roundDurationToOptions,
  sanitizeSearch,
  serializeFocusAreas,
  startOfWeek,
  wholeYears,
  zoneOffsetMinutes,
  type HistoryPoint,
} from './domain.ts'

describe('dates', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('finds the week start for both settings', () => {
    // 2026-09-17 is a Thursday
    expect(startOfWeek('2026-09-17', 1)).toBe('2026-09-14')
    expect(startOfWeek('2026-09-17', 0)).toBe('2026-09-13')
    expect(startOfWeek('2026-09-13', 0)).toBe('2026-09-13') // a Sunday
    expect(startOfWeek('2026-09-13', 1)).toBe('2026-09-07')
  })
  it('computes zone offsets', () => {
    expect(zoneOffsetMinutes('Asia/Yangon', '2026-09-18')).toBe(390)
    expect(zoneOffsetMinutes('UTC', '2026-09-18')).toBe(0)
    expect(zoneOffsetMinutes('America/New_York', '2026-01-15')).toBe(-300)
    expect(zoneOffsetMinutes('America/New_York', '2026-07-15')).toBe(-240)
  })
  it('counts whole years', () => {
    expect(wholeYears('1990-06-15', '2026-06-14')).toBe(35)
    expect(wholeYears('1990-06-15', '2026-06-15')).toBe(36)
  })
})

describe('calcStreakStats', () => {
  it('is zero with no logs', () => {
    expect(calcStreakStats([], '2026-09-17')).toEqual({ current: 0, best: 0, totalDays: 0, monthDays: 0, hasToday: false })
  })
  it('counts a run that includes today', () => {
    const s = calcStreakStats(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-01'], '2026-09-17')
    expect(s).toMatchObject({ current: 3, best: 3, totalDays: 4, monthDays: 4, hasToday: true })
  })
  it('keeps the streak alive through yesterday', () => {
    const s = calcStreakStats(['2026-09-15', '2026-09-16'], '2026-09-17')
    expect(s).toMatchObject({ current: 2, hasToday: false })
  })
  it('breaks after a missed day but keeps the best run', () => {
    const s = calcStreakStats(['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-15'], '2026-09-17')
    expect(s).toMatchObject({ current: 0, best: 3 })
  })
  it('counts future-dated days that continue the run', () => {
    expect(calcStreakStats(['2026-09-17', '2026-09-18'], '2026-09-17').current).toBe(2)
  })
  it('ignores duplicate dates', () => {
    expect(calcStreakStats(['2026-09-17', '2026-09-17'], '2026-09-17').totalDays).toBe(1)
  })
})

describe('log vocabulary', () => {
  it('recognises rest days', () => {
    expect(isRest('Rest')).toBe(true)
    expect(isRest('  rest day ')).toBe(true)
    expect(isRest('Restoration')).toBe(false)
    expect(isRest(null)).toBe(false)
  })
  it('round-trips focus areas', () => {
    expect(serializeFocusAreas(['Chest', 'Triceps', 'Chest'])).toBe('Chest,Triceps')
    expect(serializeFocusAreas([])).toBeNull()
    expect(parseFocusAreas('Chest, Triceps,,')).toEqual(['Chest', 'Triceps'])
    expect(focusLabel(['Chest', 'Triceps'])).toBe('Chest · Triceps')
  })
  it('rounds grams to 0.1', () => {
    expect(gramsOrNull(25.26)).toBe(25.3)
    expect(gramsOrNull(null)).toBeNull()
  })
  it('formats durations', () => {
    expect(durationText(80)).toBe('1h 20m')
    expect(durationText(45)).toBe('45m')
    expect(durationText(120)).toBe('2h')
    expect(durationText(null)).toBeNull()
    expect(durationMinutes('1h 20m')).toBe(80)
    expect(durationMinutes('45m')).toBe(45)
    expect(durationMinutes('')).toBeNull()
  })
  it('rounds durations to the form options', () => {
    expect(roundDurationToOptions(52)).toBe(50)
    expect(roundDurationToOptions(95)).toBe(95)
    expect(roundDurationToOptions(900)).toBe(775)
    expect(roundDurationToOptions(0)).toBe(0)
  })
  it('maps Fitbit activities to workout types, first rule wins', () => {
    expect(activityToWorkoutType('Weights')).toBe('Strength')
    expect(activityToWorkoutType('Interval run')).toBe('HIIT')
    expect(activityToWorkoutType('Run')).toBe('Cardio')
    expect(activityToWorkoutType('Bike')).toBe('Cycle')
    expect(activityToWorkoutType('Swim')).toBe('Swim')
    expect(activityToWorkoutType('Yoga')).toBe('Flexibility')
    expect(activityToWorkoutType('Golf')).toBe('Other')
  })
  it('strips PostgREST syntax from search text', () => {
    expect(sanitizeSearch("bench),notes.ilike.*x* o'neil")).toBe("bench notes ilike x o'neil")
    expect(sanitizeSearch('%,()*')).toBe('')
  })
})

describe('lifts', () => {
  it('estimates 1RM with Epley, capped at 12 reps', () => {
    expect(estimatedOneRepMax({ reps: 1, weight: 100 })).toBe(100)
    expect(estimatedOneRepMax({ reps: 5, weight: 100 })).toBe(116.5)
    expect(estimatedOneRepMax({ reps: 30, weight: 50 })).toBe(estimatedOneRepMax({ reps: 12, weight: 50 }))
    expect(estimatedOneRepMax({ reps: 0, weight: 50 })).toBe(0)
    expect(bestOneRepMax([{ reps: 5, weight: 100 }, { reps: 1, weight: 110 }])).toBe(116.5)
  })
  it('converts units rounded to 0.1', () => {
    expect(convertSets([{ reps: 5, weight: 100 }], 'lb', 'kg')[0].weight).toBeCloseTo(45.4, 5)
    expect(convertSets([{ reps: 5, weight: 100 }], 'kg', 'kg')).toEqual([{ reps: 5, weight: 100 }])
  })
  it('parses sets with a legacy fallback', () => {
    expect(parseSetsDetail([{ reps: 5, weight: 60 }])).toEqual([{ reps: 5, weight: 60 }])
    expect(parseSetsDetail(null, { sets: 2, reps: 8, weight: 40 })).toEqual([
      { reps: 8, weight: 40 },
      { reps: 8, weight: 40 },
    ])
    expect(parseSetsDetail(null)).toEqual([])
  })

  const pt = (at: string, reps: number, weight: number, unit = 'kg'): HistoryPoint => ({
    sets_detail: [{ reps, weight }],
    unit,
    recorded_at: at,
  })
  const hist = [
    pt('2026-09-01T10:00:00Z', 5, 100),
    pt('2026-09-08T10:00:00Z', 5, 100), // ties: no PR
    pt('2026-09-15T10:00:00Z', 5, 105),
  ]
  it('never counts the first entry or a tie as a PR', () => {
    const events = prEvents(hist, 'kg')
    expect(events.every((e) => e.recorded_at === '2026-09-15T10:00:00Z')).toBe(true)
    expect(events.map((e) => e.kind).sort()).toEqual(['heaviest', 'oneRepMax', 'volume'])
  })
  it('finds personal bests, earliest wins ties', () => {
    const b = personalBests(hist.slice(0, 2), 'kg')
    expect(b.heaviest).toEqual({ value: 100, reps: 5, recorded_at: '2026-09-01T10:00:00Z' })
  })
  it('compares across units', () => {
    // 225 lb is about 102 kg, which beats 100 kg
    expect(prEvents([pt('2026-09-01T00:00:00Z', 5, 100), pt('2026-09-02T00:00:00Z', 5, 225, 'lb')], 'kg').length).toBeGreaterThan(0)
  })
  it('reports the PRs new sets would set', () => {
    expect(newPrKinds([], [{ reps: 5, weight: 200 }], 'kg')).toEqual([])
    expect(newPrKinds(hist, [{ reps: 5, weight: 110 }], 'kg').sort()).toEqual(['heaviest', 'oneRepMax', 'volume'])
    expect(newPrKinds(hist, [{ reps: 5, weight: 100 }], 'kg')).toEqual([])
  })
})

describe('training load', () => {
  const week = (today: string, from: number, to: number, v: number) => {
    const m = new Map<string, number>()
    for (let i = from; i <= to; i++) m.set(addDays(today, -i), v)
    return m
  }
  const today = '2026-09-17'
  it('is building with no baseline', () => {
    const s = loadSummary(week(today, 0, 6, 100), today)
    expect(s.ratio).toBeNull()
    expect(s.status).toBe('building')
  })
  it('classifies the ratio', () => {
    expect(loadStatus(1.51)).toBe('ramping')
    expect(loadStatus(1.5)).toBe('steady')
    expect(loadStatus(0.79)).toBe('lighter')
    expect(loadStatus(0.8)).toBe('steady')
  })
  it('compares this week with the average of the prior 4', () => {
    const m = new Map([...week(today, 0, 6, 200), ...week(today, 7, 34, 100)])
    const s = loadSummary(m, today)
    expect(s.thisWeek).toBe(1400)
    expect(s.baseline).toBe(700)
    expect(s.ratio).toBe(2)
    expect(s.status).toBe('ramping')
  })
  it('formats the delta', () => {
    expect(formatVsAverage(1.18)).toBe('+18%')
    expect(formatVsAverage(0.88)).toBe('-12%')
    expect(formatVsAverage(1)).toBe('0%')
    expect(formatVsAverage(null)).toBeNull()
  })
})
