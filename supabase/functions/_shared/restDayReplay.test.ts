// Regression replay of the week of 18–24 Sep 2026 (Asia/Dubai), from real data.
//
// What went wrong: an everyday 35-minute walk on the 23rd — a logged rest day — counted
// as training, so the 24th looked like the rest day after a 3-day block. "Rest day?"
// then went out at 23:01 while a strength session (21:47–23:47) was still in progress.

import { describe, expect, it } from 'vitest'
import { localParts } from './localTime'
import { evaluate, type RuleContext } from './notifyRules'
import type { HealthWorkout } from './types'
import { isTrainingSession } from './workoutNotification'

const TZ = 'Asia/Dubai'

const session = (endUtc: string, exerciseType: string, durationMin: number): HealthWorkout => ({
  id: `${exerciseType}-${endUtc}`,
  start: endUtc,
  end: endUtc,
  durationMin,
  activity: exerciseType,
  calories: null,
  avgHr: null,
  maxHr: null,
  zoneMinutes: null,
  exerciseType,
})

// Exactly what Google returned, as of 23:01 on the 24th (the 24th's session ended at 23:47)
const sessionsSeenBy2301On24th = [
  session('2026-09-23T14:35:56Z', 'WALKING', 35),
  session('2026-09-22T18:55:54Z', 'STRENGTH_TRAINING', 143),
  session('2026-09-22T16:33:06Z', 'WALKING', 1),
  session('2026-09-22T14:32:09Z', 'WALKING', 37),
  session('2026-09-21T18:40:38Z', 'INCLINE_WALK', 37),
  session('2026-09-21T18:03:37Z', 'STRENGTH_TRAINING', 91),
  session('2026-09-21T14:22:39Z', 'WALKING', 28),
  session('2026-09-21T04:14:39Z', 'WALKING', 25),
  session('2026-09-20T16:31:02Z', 'RUNNING', 42),
  session('2026-09-20T15:43:20Z', 'WALKING', 30),
  session('2026-09-19T20:07:56Z', 'WALKING', 31),
  session('2026-09-19T16:19:46Z', 'WALKING', 27),
  session('2026-09-18T14:31:23Z', 'WALKING', 29),
]

/** The dispatcher's derivation: training sessions only, dated on the user's clock. */
const exerciseDates = (sessions: HealthWorkout[]) => [
  ...new Set(sessions.filter((w) => isTrainingSession(w)).map((w) => localParts(new Date(w.end), TZ).day)),
]

const ctx = (over: Partial<RuleContext>): RuleContext => ({
  localDay: '2026-09-24',
  localHour: 23,
  prefs: { rest_day: true, streak_risk: true },
  logDates: [],
  trainingLogDates: [],
  lastSent: {},
  fitbitStatus: 'connected',
  health: null,
  name: 'andy',
  ...over,
})

const health = (sessions: HealthWorkout[]) => ({
  stepsToday: null,
  stepGoal: 10000,
  sleepMinutes: null,
  bestSleepMinutes: null,
  restingHeartRate: null,
  restingHeartRateBaseline: null,
  exerciseDates: exerciseDates(sessions),
})

describe('replay: week of 18–24 Sep 2026', () => {
  it('does not count the everyday walks as training days', () => {
    // 23 Sep had only a walk; 18 and 19 Sep only walks
    expect(exerciseDates(sessionsSeenBy2301On24th).sort()).toEqual(['2026-09-20', '2026-09-21', '2026-09-22'])
  })

  it('does not ask "rest day?" on the 24th — the day after a logged rest day', () => {
    const out = evaluate(
      ctx({
        logDates: ['2026-09-17', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'],
        trainingLogDates: ['2026-09-20', '2026-09-21', '2026-09-22'],
        health: health(sessionsSeenBy2301On24th),
      }),
    )
    expect(out.map((n) => n.type)).not.toContain('rest_day')
  })

  it('does ask on the 23rd, the real rest day after training on the 20th, 21st and 22nd', () => {
    const seenOn23rd = sessionsSeenBy2301On24th.filter((w) => localParts(new Date(w.end), TZ).day <= '2026-09-23')
    const out = evaluate(
      ctx({
        localDay: '2026-09-23',
        logDates: ['2026-09-17', '2026-09-20', '2026-09-21', '2026-09-22'],
        trainingLogDates: ['2026-09-20', '2026-09-21', '2026-09-22'],
        health: health(seenOn23rd),
      }),
    )
    expect(out.map((n) => n.type)).toEqual(['rest_day'])
    expect(out[0].title).toBe('andy, rest day today?')
    expect(out[0].url).toBe('/app?rest=2026-09-23')
  })
})
