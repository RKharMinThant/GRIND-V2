import { describe, expect, it } from 'vitest'
import { isTrainingSession, workoutNotification } from './workoutNotification'
import type { HealthWorkout } from './types'

const workout = (over: Partial<HealthWorkout> = {}): HealthWorkout => ({
  id: 'exercise/abc123',
  start: '2026-09-22T20:40:00Z',
  end: '2026-09-22T21:28:00Z',
  durationMin: 48,
  activity: 'Strength training',
  calories: 312,
  avgHr: 128,
  maxHr: 161,
  zoneMinutes: null,
  exerciseType: 'STRENGTH_TRAINING',
  ...over,
})

describe('workoutNotification', () => {
  it('summarises a finished session', () => {
    const n = workoutNotification(workout(), 21)
    expect(n).not.toBeNull()
    expect(n!.title).toBe('Nice work')
    expect(n!.body).toMatch(/^Strength training · /)
    expect(n!.body).toContain('48 min')
    expect(n!.body).toContain('312 cal')
    expect(n!.body).toContain('128 bpm')
  })

  it('drops metrics Fitbit did not report rather than printing blanks', () => {
    const n = workoutNotification(workout({ calories: null, avgHr: null }), 21)
    expect(n!.body).toContain('48 min')
    expect(n!.body).not.toContain('cal')
    expect(n!.body).not.toContain('bpm')
    expect(n!.body).not.toContain('·  ')
  })

  it('invites you to log it, since that is the point', () => {
    expect(workoutNotification(workout(), 21)!.body).toMatch(/log/i)
  })

  it('deep-links to the workout so the log sheet can pre-fill', () => {
    const n = workoutNotification(workout(), 21)
    expect(n!.url).toBe('/app?workout=exercise%2Fabc123')
  })

  it('tags per workout, so two sessions in a night do not collapse into one banner', () => {
    const a = workoutNotification(workout({ id: 'exercise/1' }), 21)
    const b = workoutNotification(workout({ id: 'exercise/2' }), 21)
    expect(a!.tag).not.toBe(b!.tag)
  })

  it('ignores a short auto-detected walk', () => {
    // Fitbit logs brief activity on its own; notifying for that is noise
    expect(workoutNotification(workout({ durationMin: 9, activity: 'Walk' }), 21)).toBeNull()
  })

  it('honours a custom minimum duration', () => {
    expect(workoutNotification(workout({ durationMin: 9 }), 21, { minDurationMin: 5 })).not.toBeNull()
  })

  it('stays silent overnight', () => {
    // A 3am sync must not buzz the phone
    expect(workoutNotification(workout(), 3)).toBeNull()
    expect(workoutNotification(workout(), 5)).toBeNull()
    expect(workoutNotification(workout(), 6)).not.toBeNull()
    expect(workoutNotification(workout(), 23)).not.toBeNull()
  })

  it('handles a session with no recognised activity name', () => {
    const n = workoutNotification(workout({ activity: '' }), 21)
    expect(n!.body).toMatch(/^Workout · 48 min/)
  })

  it('puts your name in the title', () => {
    expect(workoutNotification(workout(), 21, { name: 'Andy' })!.title).toBe('Nice work, Andy')
  })
})

describe('isTrainingSession — what counts as a workout', () => {
  it('counts deliberate sessions', () => {
    expect(isTrainingSession(workout({ exerciseType: 'STRENGTH_TRAINING' }))).toBe(true)
    expect(isTrainingSession(workout({ exerciseType: 'RUNNING', durationMin: 42 }))).toBe(true)
    // A treadmill incline walk is chosen on purpose, unlike the walk home
    expect(isTrainingSession(workout({ exerciseType: 'INCLINE_WALK', durationMin: 37 }))).toBe(true)
  })

  it('does not count an everyday walk, however long', () => {
    // The daily ~30-minute walks were turning rest days into "training" days
    expect(isTrainingSession(workout({ exerciseType: 'WALKING', durationMin: 35 }))).toBe(false)
  })

  it('still ignores anything too short to be a session', () => {
    expect(isTrainingSession(workout({ exerciseType: 'STRENGTH_TRAINING', durationMin: 9 }))).toBe(false)
  })

  it('treats an unknown type as training rather than silently dropping it', () => {
    expect(isTrainingSession(workout({ exerciseType: null }))).toBe(true)
  })
})

describe('workoutNotification skips walks', () => {
  it('sends nothing for the walk home', () => {
    expect(workoutNotification(workout({ exerciseType: 'WALKING', activity: 'Walk', durationMin: 35 }), 18)).toBeNull()
  })
})
