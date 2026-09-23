import { describe, expect, it } from 'vitest'
import { daysBetween, dueTypes, evaluate, isRestWorkout, needsHealthData, type RuleContext } from './notifyRules'

const base: RuleContext = {
  localDay: '2026-09-18',
  localHour: 19,
  prefs: {},
  logDates: [],
  trainingLogDates: [],
  lastSent: {},
  fitbitStatus: 'connected',
  health: null,
  name: null,
}

const ctx = (over: Partial<RuleContext>): RuleContext => ({ ...base, ...over })

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-09-15', '2026-09-18')).toBe(3)
    expect(daysBetween('2026-09-18', '2026-09-18')).toBe(0)
  })

  it('crosses month and year boundaries', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
  })
})

describe('dueTypes — the cheap gate', () => {
  it('is empty when nothing is switched on', () => {
    expect(dueTypes(ctx({ prefs: {} }))).toEqual([])
  })

  it('only returns types whose local hour window is open', () => {
    // streak_risk is an evening rule
    expect(dueTypes(ctx({ prefs: { streak_risk: true }, localHour: 19 }))).toContain('streak_risk')
    expect(dueTypes(ctx({ prefs: { streak_risk: true }, localHour: 9 }))).not.toContain('streak_risk')
  })

  it('respects the per-type cooldown', () => {
    const prefs = { inactivity: true }
    const open = ctx({ prefs, localHour: 10, lastSent: { inactivity: '2026-09-10' } })
    const recent = ctx({ prefs, localHour: 10, lastSent: { inactivity: '2026-09-17' } })
    expect(dueTypes(open)).toContain('inactivity')
    expect(dueTypes(recent)).not.toContain('inactivity')
  })

  it('never returns a type already sent today', () => {
    const prefs = { streak_risk: true }
    expect(dueTypes(ctx({ prefs, lastSent: { streak_risk: '2026-09-18' } }))).toEqual([])
  })
})

describe('needsHealthData', () => {
  it('is true only for rules that read Fitbit', () => {
    expect(needsHealthData(['step_goal'])).toBe(true)
    expect(needsHealthData(['recovery_milestone'])).toBe(true)
    // Checks Fitbit for a session today before asking "rest day?"
    expect(needsHealthData(['rest_day'])).toBe(true)
    expect(needsHealthData(['streak_risk', 'inactivity'])).toBe(false)
    // fitbit_expired reads the connection row, not the Google API
    expect(needsHealthData(['fitbit_expired'])).toBe(false)
    expect(needsHealthData([])).toBe(false)
  })
})

describe('fitbit_expired', () => {
  const prefs = { fitbit_expired: true }

  it('fires when the connection has expired', () => {
    const out = evaluate(ctx({ prefs, localHour: 10, fitbitStatus: 'expired' }))
    expect(out.map((n) => n.type)).toEqual(['fitbit_expired'])
    expect(out[0].body).toMatch(/reconnect/i)
  })

  it('stays quiet while the connection is healthy', () => {
    expect(evaluate(ctx({ prefs, localHour: 10, fitbitStatus: 'connected' }))).toEqual([])
  })

  it('stays quiet for someone who never connected Fitbit', () => {
    expect(evaluate(ctx({ prefs, localHour: 10, fitbitStatus: 'none' }))).toEqual([])
  })

  it('does not wake anyone at 4am', () => {
    expect(evaluate(ctx({ prefs, localHour: 4, fitbitStatus: 'expired' }))).toEqual([])
  })
})

describe('streak_risk', () => {
  const prefs = { streak_risk: true }

  it('fires in the evening when a live streak has nothing logged today', () => {
    const out = evaluate(
      ctx({ prefs, localHour: 19, logDates: ['2026-09-15', '2026-09-16', '2026-09-17'] }),
    )
    expect(out.map((n) => n.type)).toEqual(['streak_risk'])
    expect(out[0].body).toContain('3-day')
  })

  it('stays quiet once today is logged', () => {
    const logs = ['2026-09-16', '2026-09-17', '2026-09-18']
    expect(evaluate(ctx({ prefs, localHour: 19, logDates: logs }))).toEqual([])
  })

  it('stays quiet when the streak is already broken', () => {
    // Nothing yesterday, so there is no chain left to save
    expect(evaluate(ctx({ prefs, localHour: 19, logDates: ['2026-09-14'] }))).toEqual([])
  })

  it('ignores a single day — one session is not a streak worth saving', () => {
    expect(evaluate(ctx({ prefs, localHour: 19, logDates: ['2026-09-17'] }))).toEqual([])
  })

  it('counts duplicate logs on one day as a single day', () => {
    const logs = ['2026-09-17', '2026-09-17', '2026-09-16']
    const out = evaluate(ctx({ prefs, localHour: 19, logDates: logs }))
    expect(out[0].body).toContain('2-day')
  })
})

describe('inactivity', () => {
  const prefs = { inactivity: true }

  it('fires after three quiet days', () => {
    const out = evaluate(ctx({ prefs, localHour: 10, logDates: ['2026-09-15'] }))
    expect(out.map((n) => n.type)).toEqual(['inactivity'])
    expect(out[0].body).toContain('3 days')
  })

  it('stays quiet after only two', () => {
    expect(evaluate(ctx({ prefs, localHour: 10, logDates: ['2026-09-16'] }))).toEqual([])
  })

  it('greets someone who has never logged anything', () => {
    const out = evaluate(ctx({ prefs, localHour: 10, logDates: [] }))
    expect(out.map((n) => n.type)).toEqual(['inactivity'])
    expect(out[0].body).toMatch(/first session/i)
  })

  it('cannot fire alongside streak_risk', () => {
    // Three days idle means no streak to warn about, whatever the hour
    const prefsBoth = { inactivity: true, streak_risk: true }
    const out = evaluate(ctx({ prefs: prefsBoth, localHour: 19, logDates: ['2026-09-15'] }))
    expect(out.map((n) => n.type)).not.toContain('streak_risk')
  })
})

describe('step_goal', () => {
  const prefs = { step_goal: true }
  const health = {
    stepsToday: 7600,
    stepGoal: 10000,
    sleepMinutes: null,
    bestSleepMinutes: null,
    restingHeartRate: null,
    restingHeartRateBaseline: null,
    exerciseDates: null,
  }

  it('fires when the goal is close but not met', () => {
    const out = evaluate(ctx({ prefs, localHour: 19, health }))
    expect(out.map((n) => n.type)).toEqual(['step_goal'])
    expect(out[0].body).toContain('2,400')
    expect(out[0].body).toContain('10,000')
  })

  it('stays quiet once the goal is already met', () => {
    expect(evaluate(ctx({ prefs, localHour: 19, health: { ...health, stepsToday: 10200 } }))).toEqual([])
  })

  it('stays quiet when the goal is out of reach — that is nagging, not helping', () => {
    expect(evaluate(ctx({ prefs, localHour: 19, health: { ...health, stepsToday: 1200 } }))).toEqual([])
  })

  it('stays quiet when Fitbit returned nothing', () => {
    expect(evaluate(ctx({ prefs, localHour: 19, health: { ...health, stepsToday: null } }))).toEqual([])
    expect(evaluate(ctx({ prefs, localHour: 19, health: null }))).toEqual([])
  })
})

describe('recovery_milestone', () => {
  const prefs = { recovery_milestone: true }
  const health = {
    stepsToday: null,
    stepGoal: 10000,
    sleepMinutes: 498,
    bestSleepMinutes: 470,
    restingHeartRate: 58,
    restingHeartRateBaseline: 59,
    exerciseDates: null,
  }

  it('celebrates the best sleep of the month', () => {
    const out = evaluate(ctx({ prefs, localHour: 9, health }))
    expect(out.map((n) => n.type)).toEqual(['recovery_milestone'])
    expect(out[0].body).toMatch(/8h 18m/)
  })

  it('reports a resting heart rate trending down', () => {
    const lowRhr = { ...health, sleepMinutes: 400, bestSleepMinutes: 470, restingHeartRate: 55, restingHeartRateBaseline: 59 }
    const out = evaluate(ctx({ prefs, localHour: 9, health: lowRhr }))
    expect(out[0].body).toMatch(/resting heart rate/i)
    expect(out[0].body).toContain('55')
  })

  it('stays quiet on an ordinary night', () => {
    const ordinary = { ...health, sleepMinutes: 400, bestSleepMinutes: 470, restingHeartRate: 59 }
    expect(evaluate(ctx({ prefs, localHour: 9, health: ordinary }))).toEqual([])
  })

  it('ignores a short night even if it beats the recent best', () => {
    // Beating a bad month is not a milestone
    const short = { ...health, sleepMinutes: 350, bestSleepMinutes: 340 }
    expect(evaluate(ctx({ prefs, localHour: 9, health: short }))).toEqual([])
  })

  it('stays quiet without a baseline to compare against', () => {
    const noBaseline = { ...health, sleepMinutes: 400, bestSleepMinutes: null, restingHeartRateBaseline: null }
    expect(evaluate(ctx({ prefs, localHour: 9, health: noBaseline }))).toEqual([])
  })
})

describe('independence', () => {
  it('sends several types at once when they all apply', () => {
    // The user asked for types to fire independently rather than one-per-day
    const out = evaluate(
      ctx({
        prefs: { fitbit_expired: true, step_goal: true },
        localHour: 19,
        fitbitStatus: 'expired',
        health: {
          stepsToday: 8000,
          stepGoal: 10000,
          sleepMinutes: null,
          bestSleepMinutes: null,
          restingHeartRate: null,
          restingHeartRateBaseline: null,
          exerciseDates: null,
        },
      }),
    )
    expect(out.map((n) => n.type).sort()).toEqual(['fitbit_expired', 'step_goal'])
  })

  it('gives every notification a tag so repeats collapse instead of stacking', () => {
    const out = evaluate(ctx({ prefs: { inactivity: true }, localHour: 10, logDates: [] }))
    expect(out[0].tag).toBeTruthy()
    expect(out[0].url).toMatch(/^\/app/)
  })
})

describe('rest_day', () => {
  // localDay is Fri 2026-09-18; the three days before it are 15, 16, 17
  const trained = ['2026-09-15', '2026-09-16', '2026-09-17']
  const prefs = { rest_day: true }
  const restCtx = (over: Partial<RuleContext> = {}) =>
    ctx({ prefs, localHour: 23, logDates: trained, trainingLogDates: trained, ...over })
  const fitbit = (exerciseDates: string[]) => ({
    stepsToday: null,
    stepGoal: 10000,
    sleepMinutes: null,
    bestSleepMinutes: null,
    restingHeartRate: null,
    restingHeartRateBaseline: null,
    exerciseDates,
  })

  it('asks after three training days with nothing today', () => {
    const out = evaluate(restCtx())
    expect(out.map((n) => n.type)).toEqual(['rest_day'])
    expect(out[0].title).toBe('Rest day today?')
    expect(out[0].body).toContain('3 sessions in a row')
  })

  it('uses the first name when there is one', () => {
    expect(evaluate(restCtx({ name: 'Andy' }))[0].title).toBe('Andy, rest day today?')
  })

  it('mentions the streak that logging the rest keeps alive', () => {
    const logs = ['2026-09-13', '2026-09-14', ...trained]
    expect(evaluate(restCtx({ logDates: logs }))[0].body).toContain('5-day streak')
  })

  it('carries the date in the link, so tapping after midnight logs the right day', () => {
    expect(evaluate(restCtx())[0].url).toBe('/app?rest=2026-09-18')
  })

  it('only fires in the 11pm hour, after the usual finish time', () => {
    expect(evaluate(restCtx({ localHour: 22 }))).toEqual([])
    expect(evaluate(restCtx({ localHour: 23 }))).toHaveLength(1)
  })

  it('stays quiet after only two training days', () => {
    const two = ['2026-09-16', '2026-09-17']
    expect(evaluate(restCtx({ logDates: two, trainingLogDates: two }))).toEqual([])
  })

  it('does not count a logged rest day as training', () => {
    // The 16th was already a rest day, so the 18th is not the end of a 3-day block
    expect(evaluate(restCtx({ trainingLogDates: ['2026-09-15', '2026-09-17'] }))).toEqual([])
  })

  it('stays quiet once anything is logged today', () => {
    const logs = [...trained, '2026-09-18']
    expect(evaluate(restCtx({ logDates: logs }))).toEqual([])
  })

  it('stays quiet when Fitbit recorded a session today — you trained after all', () => {
    expect(evaluate(restCtx({ health: fitbit(['2026-09-18']) }))).toEqual([])
  })

  it('counts a Fitbit session as training even if you forgot to log it', () => {
    // Only two days logged; Fitbit saw the third
    const out = evaluate(
      restCtx({
        logDates: ['2026-09-15', '2026-09-16'],
        trainingLogDates: ['2026-09-15', '2026-09-16'],
        health: fitbit(['2026-09-17']),
      }),
    )
    expect(out.map((n) => n.type)).toEqual(['rest_day'])
  })

  it('still works from logs alone when Fitbit is not connected', () => {
    expect(evaluate(restCtx({ health: null, fitbitStatus: 'none' }))).toHaveLength(1)
  })
})

describe('streak_risk on a predicted rest day', () => {
  const trained = ['2026-09-15', '2026-09-16', '2026-09-17']

  it('is replaced by the rest-day check-in while that is switched on', () => {
    const out = evaluate(
      ctx({
        prefs: { streak_risk: true, rest_day: true },
        localHour: 19,
        logDates: trained,
        trainingLogDates: trained,
      }),
    )
    expect(out).toEqual([])
  })

  it('still warns when the rest-day check-in is off, so nothing goes quiet by surprise', () => {
    const out = evaluate(
      ctx({ prefs: { streak_risk: true }, localHour: 19, logDates: trained, trainingLogDates: trained }),
    )
    expect(out.map((n) => n.type)).toEqual(['streak_risk'])
  })

  it('still warns on an ordinary training day', () => {
    const two = ['2026-09-16', '2026-09-17']
    const out = evaluate(
      ctx({ prefs: { streak_risk: true, rest_day: true }, localHour: 19, logDates: two, trainingLogDates: two }),
    )
    expect(out.map((n) => n.type)).toEqual(['streak_risk'])
  })
})

describe('personal touch', () => {
  it('names the user in every title when a name is known', () => {
    const named = evaluate(ctx({ name: 'Andy', prefs: { inactivity: true }, localHour: 10, logDates: ['2026-09-10'] }))
    expect(named[0].title).toBe('Back to it, Andy')
  })

  it('reads naturally without a name', () => {
    const plain = evaluate(ctx({ prefs: { inactivity: true }, localHour: 10, logDates: ['2026-09-10'] }))
    expect(plain[0].title).toBe('Back to it')
  })

  it('never leaves a dangling comma or placeholder', () => {
    const out = evaluate(
      ctx({ prefs: { fitbit_expired: true, streak_risk: true }, localHour: 19, fitbitStatus: 'expired', logDates: ['2026-09-16', '2026-09-17'], trainingLogDates: ['2026-09-16', '2026-09-17'] }),
    )
    for (const n of out) {
      expect(n.title).not.toMatch(/^,|, $|null|undefined/)
    }
  })
})

describe('isRestWorkout', () => {
  it('matches how the app records a rest day', () => {
    // Mirrors isRestLog in src/types/database.ts
    expect(isRestWorkout('Rest')).toBe(true)
    expect(isRestWorkout(' rest day ')).toBe(true)
    expect(isRestWorkout('Push day')).toBe(false)
    expect(isRestWorkout('Restorative yoga')).toBe(false)
    expect(isRestWorkout(null)).toBe(false)
  })
})
