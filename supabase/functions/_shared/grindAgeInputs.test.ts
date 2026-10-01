import { describe, expect, it } from 'vitest'
import { addDays, ageInYears, minutesOfDay, sleepConsistency, strengthMinutesPerWeek, weekStartOf } from './grindAgeInputs'
import type { HealthWorkout } from './types'

describe('weekStartOf', () => {
  it('returns the Monday on or before the day', () => {
    expect(weekStartOf('2026-10-01')).toBe('2026-09-28') // Thursday
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28') // Monday
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28') // Sunday
  })
})

describe('addDays / ageInYears', () => {
  it('moves across month boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('gives decimal years', () => {
    expect(ageInYears('1996-10-01', '2026-10-01')).toBeCloseTo(30, 1)
  })
})

describe('minutesOfDay', () => {
  it('reads the clock of the given zone', () => {
    expect(minutesOfDay('2026-09-30T16:30:00Z', 'Asia/Yangon')).toBe(23 * 60) // UTC+6:30
    expect(minutesOfDay('2026-09-30T00:00:00Z', 'UTC')).toBe(0)
  })
})

describe('sleepConsistency', () => {
  const night = (bed: string, wake: string) => ({ start: bed, end: wake })

  it('is 0 for identical nights', () => {
    const nights = Array.from({ length: 6 }, () => night('2026-09-20T23:00:00Z', '2026-09-21T07:00:00Z'))
    expect(sleepConsistency(nights, 'UTC')).toBe(0)
  })

  it('treats 23:30 and 00:30 as an hour apart', () => {
    const nights = [
      night('2026-09-20T23:30:00Z', '2026-09-21T07:00:00Z'),
      night('2026-09-22T00:30:00Z', '2026-09-22T07:00:00Z'),
      night('2026-09-22T23:30:00Z', '2026-09-23T07:00:00Z'),
      night('2026-09-24T00:30:00Z', '2026-09-24T07:00:00Z'),
      night('2026-09-24T23:30:00Z', '2026-09-25T07:00:00Z'),
      night('2026-09-26T00:30:00Z', '2026-09-26T07:00:00Z'),
    ]
    // Bedtimes alternate 23:30 / 00:30 → SD 30 min; wake times constant → SD 0
    expect(sleepConsistency(nights, 'UTC')).toBeCloseTo(15, 5)
  })

  it('needs at least five nights', () => {
    const nights = Array.from({ length: 4 }, () => night('2026-09-20T23:00:00Z', '2026-09-21T07:00:00Z'))
    expect(sleepConsistency(nights, 'UTC')).toBeNull()
  })
})

describe('strengthMinutesPerWeek', () => {
  const workout = (end: string, durationMin: number, exerciseType: string): HealthWorkout => ({
    id: end,
    start: end,
    end,
    durationMin,
    activity: exerciseType,
    calories: null,
    avgHr: null,
    maxHr: null,
    zoneMinutes: null,
    exerciseType,
  })

  it('scales strength minutes in the 30-day window to a week', () => {
    const workouts = [
      workout('2026-09-30T10:00:00Z', 30, 'STRENGTH_TRAINING'),
      workout('2026-09-20T10:00:00Z', 30, 'WEIGHTLIFTING'),
    ]
    expect(strengthMinutesPerWeek(workouts, '2026-10-01', 'UTC')).toBeCloseTo((60 / 30) * 7, 5)
  })

  it('is 0 when there are sessions but none are strength', () => {
    expect(strengthMinutesPerWeek([workout('2026-09-30T10:00:00Z', 45, 'RUNNING')], '2026-10-01', 'UTC')).toBe(0)
  })

  it('ignores strength sessions older than 30 days', () => {
    expect(strengthMinutesPerWeek([workout('2026-08-01T10:00:00Z', 60, 'STRENGTH_TRAINING')], '2026-10-01', 'UTC')).toBe(0)
  })
})
