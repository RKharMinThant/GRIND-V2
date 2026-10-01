import { describe, expect, it } from 'vitest'
import { summarizeWeek, weeklyReportBody, type WeeklyInput, type WeeklySummary } from './weeklyReport'

// Sun 2026-09-20: this week is 09-14 … 09-20, last week is 09-07 … 09-13
const localDay = '2026-09-20'

const base: WeeklyInput = { localDay, goal: 4, logs: [], lifts: [], azm: null, grindAges: [] }
const input = (over: Partial<WeeklyInput>): WeeklyInput => ({ ...base, ...over })

let n = 0
const lift = (date: string, sets: [number, number][], over: Partial<WeeklyInput['lifts'][number]> = {}) => ({
  liftId: 'bench',
  // Strictly increasing, so rows order the way they were written
  recordedAt: `${date}T10:00:${String(n++).padStart(2, '0')}Z`,
  date,
  sets: sets.map(([reps, weight]) => ({ reps, weight })),
  unit: 'kg',
  ...over,
})

describe('summarizeWeek — sessions', () => {
  it('counts distinct training days and ignores rest days', () => {
    const logs = [
      { date: '2026-09-14', workout: 'Push day' },
      { date: '2026-09-14', workout: 'Pull day' },
      { date: '2026-09-15', workout: 'Rest' },
      { date: '2026-09-16', workout: 'rest day' },
      { date: '2026-09-17', workout: 'Legs' },
    ]
    expect(summarizeWeek(input({ logs })).sessions).toBe(2)
  })

  it('buckets the window edges: localDay−6 is in, localDay−7 is out', () => {
    const logs = [
      { date: '2026-09-13', workout: 'Legs' }, // last week
      { date: '2026-09-14', workout: 'Push' }, // first day of this week
      { date: '2026-09-20', workout: 'Pull' }, // today
      { date: '2026-09-21', workout: 'Future' }, // not yet
    ]
    expect(summarizeWeek(input({ logs })).sessions).toBe(2)
  })

  it('carries the goal through', () => {
    expect(summarizeWeek(input({ goal: 5 })).goal).toBe(5)
  })
})

describe('summarizeWeek — volume', () => {
  it('sums reps × weight in each week', () => {
    const lifts = [
      lift('2026-09-15', [[10, 50], [10, 50]]), // 1000
      lift('2026-09-18', [[5, 100]]), // 500
      lift('2026-09-08', [[10, 60]]), // 600, last week
    ]
    const s = summarizeWeek(input({ lifts }))
    expect(s.volumeKg).toBe(1500)
    expect(s.lastVolumeKg).toBe(600)
  })

  it('converts lb to kg', () => {
    const s = summarizeWeek(input({ lifts: [lift('2026-09-15', [[10, 100]], { unit: 'lb' })] }))
    expect(s.volumeKg).toBeCloseTo(453.59237, 4)
  })

  it('puts the edges in the right week', () => {
    const lifts = [
      lift('2026-09-14', [[1, 100]]), // this week
      lift('2026-09-13', [[1, 10]]), // last week, last day
      lift('2026-09-07', [[1, 20]]), // last week, first day
      lift('2026-09-06', [[1, 999]]), // two weeks ago: neither
    ]
    const s = summarizeWeek(input({ lifts }))
    expect(s.volumeKg).toBe(100)
    expect(s.lastVolumeKg).toBe(30)
  })
})

describe('summarizeWeek — PRs', () => {
  it("does not count a lift's first-ever row", () => {
    expect(summarizeWeek(input({ lifts: [lift('2026-09-15', [[5, 100]])] })).prs).toBe(0)
  })

  it('counts a row whose estimated 1RM strictly beats every earlier row', () => {
    const lifts = [lift('2026-08-01', [[5, 100]]), lift('2026-09-15', [[5, 105]])]
    expect(summarizeWeek(input({ lifts })).prs).toBe(1)
  })

  it('does not count a tie', () => {
    const lifts = [lift('2026-08-01', [[5, 100]]), lift('2026-09-15', [[5, 100]])]
    expect(summarizeWeek(input({ lifts })).prs).toBe(0)
  })

  it('compares against the best earlier row, not just the previous one', () => {
    const lifts = [
      lift('2026-07-01', [[5, 120]]),
      lift('2026-08-01', [[5, 100]]),
      lift('2026-09-15', [[5, 110]]), // beats the last row but not the 120
    ]
    expect(summarizeWeek(input({ lifts })).prs).toBe(0)
  })

  it('counts a lift once even when it beats its best twice in a week', () => {
    const lifts = [
      lift('2026-08-01', [[5, 100]]),
      lift('2026-09-15', [[5, 105]]),
      lift('2026-09-18', [[5, 110]]),
    ]
    expect(summarizeWeek(input({ lifts })).prs).toBe(1)
  })

  it('counts each lift that set a PR separately', () => {
    const lifts = [
      lift('2026-08-01', [[5, 100]]),
      lift('2026-09-15', [[5, 105]]),
      lift('2026-09-18', [[5, 110]]),
      lift('2026-08-02', [[5, 60]], { liftId: 'squat' }),
      lift('2026-09-16', [[5, 70]], { liftId: 'squat' }),
    ]
    expect(summarizeWeek(input({ lifts })).prs).toBe(2)
  })

  it('rounds to the nearest 0.5 kg first, so a smaller gain is not a PR', () => {
    // 100 x 5 = 116.67 and 100.05 x 5 = 116.73 both round to 116.5: a 0.06 kg gain is below the 0.5 kg step
    const lifts = [lift('2026-08-01', [[5, 100]]), lift('2026-09-15', [[5, 100.05]])]
    expect(summarizeWeek(input({ lifts })).prs).toBe(0)
  })

  it('compares in kg across units', () => {
    // 225 lb x 5 is about 103 kg x 5, which beats 100 kg x 5
    const lifts = [lift('2026-08-01', [[5, 100]]), lift('2026-09-15', [[5, 225]], { unit: 'lb' })]
    expect(summarizeWeek(input({ lifts })).prs).toBe(1)
  })

  it('uses Epley with reps capped at 12, and a single is the weight itself', () => {
    // 100 x 1 = 100; 80 x 5 = 93.3 does not beat it; 80 x 20 caps at 12 = 112 does
    const lifts = [lift('2026-08-01', [[1, 100]]), lift('2026-09-15', [[5, 80]]), lift('2026-09-16', [[20, 80]])]
    expect(summarizeWeek(input({ lifts })).prs).toBe(1)
  })

  it('never counts a PR from an earlier week', () => {
    const lifts = [lift('2026-08-01', [[5, 100]]), lift('2026-09-08', [[5, 120]])]
    expect(summarizeWeek(input({ lifts })).prs).toBe(0)
  })

  it('treats empty or zero sets as 0', () => {
    const lifts = [lift('2026-08-01', [[5, 100]]), lift('2026-09-15', [[0, 200]])]
    expect(summarizeWeek(input({ lifts })).prs).toBe(0)
  })
})

describe('summarizeWeek — zone minutes and GRIND Age', () => {
  it('sums the three zones over this week only', () => {
    const azm = [
      { date: '2026-09-13', fatBurn: 100, cardio: 100, peak: 100 }, // last week
      { date: '2026-09-14', fatBurn: 30, cardio: 20, peak: 5 },
      { date: '2026-09-20', fatBurn: 10, cardio: 0, peak: 0 },
    ]
    expect(summarizeWeek(input({ azm })).zoneMinutes).toBe(65)
  })

  it('is null without Fitbit data, 0 for an empty week of it', () => {
    expect(summarizeWeek(input({ azm: null })).zoneMinutes).toBeNull()
    expect(summarizeWeek(input({ azm: [] })).zoneMinutes).toBe(0)
  })

  // Mondays: this week 09-14, last week 09-07, two weeks ago 08-31
  const reading = (weekStart: string, grindAge: number) => ({ weekStart, grindAge })

  it('is this week minus last week, to 0.1', () => {
    expect(
      summarizeWeek(input({ grindAges: [reading('2026-09-14', 31.4), reading('2026-09-07', 31.6)] })).grindAgeChange,
    ).toBe(-0.2)
    expect(
      summarizeWeek(input({ grindAges: [reading('2026-09-14', 31.65), reading('2026-09-07', 31.4)] })).grindAgeChange,
    ).toBe(0.3)
  })

  it('is null with fewer than two readings', () => {
    expect(summarizeWeek(input({ grindAges: [] })).grindAgeChange).toBeNull()
    expect(summarizeWeek(input({ grindAges: [reading('2026-09-14', 31.4)] })).grindAgeChange).toBeNull()
  })

  it('is null when the readings are not in consecutive weeks', () => {
    expect(
      summarizeWeek(input({ grindAges: [reading('2026-09-14', 31.4), reading('2026-08-31', 31.6)] })).grindAgeChange,
    ).toBeNull()
  })

  it("is null when the latest reading is not this week's", () => {
    expect(
      summarizeWeek(input({ grindAges: [reading('2026-09-07', 31.4), reading('2026-08-31', 31.6)] })).grindAgeChange,
    ).toBeNull()
  })
})

describe('weeklyReportBody', () => {
  const s = (over: Partial<WeeklySummary> = {}): WeeklySummary => ({
    sessions: 4,
    goal: 4,
    volumeKg: 0,
    lastVolumeKg: 0,
    prs: 0,
    zoneMinutes: null,
    grindAgeChange: null,
    ...over,
  })

  it('shows everything on one line', () => {
    expect(
      weeklyReportBody(s({ volumeKg: 5400, lastVolumeKg: 5000, prs: 2, zoneMinutes: 410, grindAgeChange: -0.2 })),
    ).toBe('4/4 sessions · volume +8% · 2 PRs · 410 zone min · GRIND Age −0.2')
  })

  it('always shows sessions, and nothing else when there is nothing else', () => {
    expect(weeklyReportBody(s({ sessions: 1, goal: 3 }))).toBe('1/3 sessions')
  })

  it('shows a drop with a real minus sign', () => {
    expect(weeklyReportBody(s({ volumeKg: 4500, lastVolumeKg: 5000 }))).toBe('4/4 sessions · volume −10%')
  })

  it('shows flat volume as ±0%', () => {
    expect(weeklyReportBody(s({ volumeKg: 5000, lastVolumeKg: 5000 }))).toBe('4/4 sessions · volume ±0%')
  })

  it('shows the total when there is no last week to compare against', () => {
    expect(weeklyReportBody(s({ volumeKg: 12340 }))).toBe('4/4 sessions · volume 12,340 kg')
  })

  it('leaves volume out when neither week has any', () => {
    expect(weeklyReportBody(s())).not.toContain('volume')
  })

  it('pluralises PRs and omits zero', () => {
    expect(weeklyReportBody(s({ prs: 1 }))).toBe('4/4 sessions · 1 PR')
    expect(weeklyReportBody(s({ prs: 2 }))).toBe('4/4 sessions · 2 PRs')
    expect(weeklyReportBody(s({ prs: 0 }))).not.toContain('PR')
  })

  it('omits zone minutes when Fitbit gave none, keeps a real zero', () => {
    expect(weeklyReportBody(s({ zoneMinutes: null }))).not.toContain('zone')
    expect(weeklyReportBody(s({ zoneMinutes: 0 }))).toContain('0 zone min')
  })

  it('formats GRIND Age to one decimal and omits no change', () => {
    expect(weeklyReportBody(s({ grindAgeChange: 0.4 }))).toBe('4/4 sessions · GRIND Age +0.4')
    expect(weeklyReportBody(s({ grindAgeChange: -1 }))).toBe('4/4 sessions · GRIND Age −1.0')
    expect(weeklyReportBody(s({ grindAgeChange: 0 }))).not.toContain('GRIND')
    expect(weeklyReportBody(s({ grindAgeChange: 0.04 }))).not.toContain('GRIND')
  })
})
