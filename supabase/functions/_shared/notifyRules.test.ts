import { describe, expect, it } from 'vitest'
import { daysBetween, dueTypes, evaluate, needsHealthData, type RuleContext } from './notifyRules'

const base: RuleContext = {
  localDay: '2026-09-18',
  localHour: 19,
  prefs: {},
  logDates: [],
  lastSent: {},
  fitbitStatus: 'connected',
  health: null,
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
