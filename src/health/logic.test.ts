import { describe, expect, it } from 'vitest'
import {
  activityToWorkoutType,
  formatSleep,
  pickHealthFields,
  readiness,
  relativeSync,
  roundDurationToOptions,
  stepTier,
  unlinkedWorkouts,
  workoutLocalDate,
  workoutToHealthFields,
} from './logic'
import { EMPTY_HEALTH_FIELDS, type HealthRecovery, type HealthWorkout } from './types'

const rec = (p: Partial<HealthRecovery>): HealthRecovery => ({
  date: '2026-09-17',
  sleepMin: 450,
  stages: null,
  restingHr: 58,
  restingHrAvg: 58,
  hrvMs: 50,
  hrvAvg: 50,
  ...p,
})
const localIso = (y: number, m: number, d: number, h = 7) => new Date(y, m - 1, d, h, 0).toISOString()
const wk = (id: string, start: string): HealthWorkout => ({
  id,
  start,
  end: start,
  durationMin: 50,
  activity: 'Weights',
  calories: 400,
  avgHr: 125,
  maxHr: 160,
  zoneMinutes: { fatBurn: 20, cardio: 10, peak: 2 },
})

describe('readiness', () => {
  it('unknown when null or all metrics null', () => {
    expect(readiness(null)).toBe('unknown')
    expect(readiness(rec({ sleepMin: null, restingHr: null, hrvMs: null }))).toBe('unknown')
  })
  it('good at the boundaries', () => {
    expect(readiness(rec({ sleepMin: 360, hrvMs: 42.5, restingHr: 63 }))).toBe('good')
  })
  it('low on short sleep', () => expect(readiness(rec({ sleepMin: 359 }))).toBe('low'))
  it('low on HRV below 85% of average', () => expect(readiness(rec({ hrvMs: 42 }))).toBe('low'))
  it('low on resting HR more than 5 above average', () =>
    expect(readiness(rec({ restingHr: 64 }))).toBe('low'))
  it('ignores a metric whose average is missing', () =>
    expect(readiness(rec({ hrvMs: 10, hrvAvg: null }))).toBe('good'))
})

describe('activityToWorkoutType', () => {
  it.each([
    ['Weights', 'Strength'],
    ['Strength training', 'Strength'],
    ['Outdoor Run', 'Cardio'],
    ['Walk', 'Cardio'],
    ['Treadmill', 'Cardio'],
    ['HIIT', 'HIIT'],
    ['Circuit training', 'HIIT'],
    ['Yoga', 'Flexibility'],
    ['Swim', 'Swim'],
    ['Spinning', 'Cycle'],
    ['Bike', 'Cycle'],
    ['Tennis', 'Other'],
  ])('%s → %s', (a, t) => expect(activityToWorkoutType(a)).toBe(t))
})

describe('stepTier', () => {
  it.each([
    [0, ''],
    [4999, ''],
    [5000, 'l1'],
    [7999, 'l1'],
    [8000, 'l2'],
    [11999, 'l2'],
    [12000, 'l3'],
  ])('%i → %s', (s, t) => expect(stepTier(s)).toBe(t))
})

describe('workoutLocalDate', () => {
  it('uses the local date of start', () =>
    expect(workoutLocalDate({ start: localIso(2026, 9, 16, 23) })).toBe('2026-09-16'))
})

describe('unlinkedWorkouts', () => {
  const today = '2026-09-17'
  const a = wk('a', localIso(2026, 9, 17, 7))
  const b = wk('b', localIso(2026, 9, 16, 18))
  const c = wk('c', localIso(2026, 9, 15, 7))
  const d = wk('d', localIso(2026, 9, 17, 17))
  it('keeps today/yesterday, excludes linked and dismissed, newest first', () => {
    const out = unlinkedWorkouts(
      [a, b, c, d],
      [{ health_workout_id: 'a' }, { health_workout_id: null }],
      [],
      today,
    )
    expect(out.map((w) => w.id)).toEqual(['d', 'b'])
    expect(unlinkedWorkouts([a, b, d], [], ['d'], today).map((w) => w.id)).toEqual(['a', 'b'])
  })
})

describe('roundDurationToOptions', () => {
  it.each([
    [52, 0, 50],
    [58, 1, 0],
    [95, 1, 35],
    [0, 0, 0],
    [900, 12, 55],
  ])('%i min → %ih %im', (m, h, mm) =>
    expect(roundDurationToOptions(m)).toEqual({ hours: h, minutes: mm }),
  )
})

describe('workoutToHealthFields', () => {
  it('maps workout stats to log columns', () => {
    expect(workoutToHealthFields(wk('x', localIso(2026, 9, 17)), 'demo')).toEqual({
      health_source: 'demo',
      health_workout_id: 'x',
      calories_kcal: 400,
      avg_hr: 125,
      max_hr: 160,
      hr_zone_minutes: { fatBurn: 20, cardio: 10, peak: 2 },
    })
  })
})

describe('pickHealthFields', () => {
  it('fills missing keys with null and ignores other fields', () => {
    expect(pickHealthFields({})).toEqual(EMPTY_HEALTH_FIELDS)
    const picked = pickHealthFields({ avg_hr: 120, workout: 'Legs' } as never)
    expect(picked).toEqual({ ...EMPTY_HEALTH_FIELDS, avg_hr: 120 })
  })
})

describe('formatSleep', () => {
  it('formats minutes', () => {
    expect(formatSleep(432)).toBe('7h 12m')
    expect(formatSleep(45)).toBe('45m')
  })
})

describe('relativeSync', () => {
  const now = new Date(2026, 8, 17, 12, 0)
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  it.each([
    [null, 'never'],
    [ago(20_000), 'just now'],
    [ago(120_000), '2 min ago'],
    [ago(3 * 3_600_000), '3 h ago'],
    [ago(2 * 86_400_000), '2 d ago'],
  ])('%s → %s', (iso, label) => expect(relativeSync(iso, now)).toBe(label))
})
