// Which notifications a user should get right now.
//
// Pure on purpose: no database, no clock, no network. The dispatcher gathers the
// context and this decides, so "your streak ends tonight" can be tested without
// waiting until 7pm. Type ids are the contract with src/lib/push.ts.

export type NotificationType =
  | 'fitbit_expired'
  | 'inactivity'
  | 'streak_risk'
  | 'step_goal'
  | 'recovery_milestone'

export type NotificationPrefs = Partial<Record<NotificationType, boolean>>

export type HealthSnapshot = {
  stepsToday: number | null
  stepGoal: number
  /** Last night's asleep minutes. */
  sleepMinutes: number | null
  /** Best night in the preceding 30 days, for comparison. */
  bestSleepMinutes: number | null
  restingHeartRate: number | null
  /** Average resting heart rate over the preceding 30 days. */
  restingHeartRateBaseline: number | null
}

export type RuleContext = {
  /** The user's local date as YYYY-MM-DD. */
  localDay: string
  /** The user's local hour, 0–23. */
  localHour: number
  prefs: NotificationPrefs
  /** Log dates in any order; duplicates are fine. */
  logDates: string[]
  /** Local day each type was last sent on. */
  lastSent: Partial<Record<NotificationType, string>>
  fitbitStatus: 'connected' | 'expired' | 'none'
  /** Only loaded when a Fitbit rule is actually due; null otherwise. */
  health: HealthSnapshot | null
}

export type Notification = {
  type: NotificationType
  title: string
  body: string
  tag: string
  url: string
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)
}

/** Consecutive logged days ending on `end` (0 when `end` itself has no log). */
function streakEndingOn(dates: Set<string>, end: string): number {
  let count = 0
  let cursor = end
  while (dates.has(cursor)) {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
}

function lastLogDay(dates: Set<string>): string | null {
  let latest: string | null = null
  for (const d of dates) if (!latest || d > latest) latest = d
  return latest
}

const number = (n: number) => n.toLocaleString('en-US')

function formatSleep(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

type Rule = {
  type: NotificationType
  /** Inclusive local-hour window; outside it the rule stays silent. */
  hours: [number, number]
  /** Minimum whole days between two sends of this type. */
  cooldownDays: number
  /** True when the rule needs a live Fitbit read, which the dispatcher pays for. */
  needsHealth: boolean
  build: (ctx: RuleContext) => Omit<Notification, 'type' | 'tag' | 'url'> | null
}

export const RULES: Rule[] = [
  {
    type: 'fitbit_expired',
    // Actionable all day, but nobody wants this at 4am
    hours: [8, 21],
    cooldownDays: 3,
    needsHealth: false,
    build: (ctx) =>
      ctx.fitbitStatus === 'expired'
        ? {
            title: 'Fitbit disconnected',
            body: 'Sleep, steps and heart rate have stopped updating. Reconnect in Settings — it takes a tap.',
          }
        : null,
  },
  {
    type: 'streak_risk',
    hours: [18, 21],
    cooldownDays: 1,
    needsHealth: false,
    build: (ctx) => {
      const dates = new Set(ctx.logDates.filter(Boolean))
      if (dates.has(ctx.localDay)) return null
      const streak = streakEndingOn(dates, addDays(ctx.localDay, -1))
      // One session is not yet a chain worth protecting
      if (streak < 2) return null
      return {
        title: 'Streak on the line',
        body: `Your ${streak}-day streak ends at midnight. Anything logged tonight keeps it alive.`,
      }
    },
  },
  {
    type: 'inactivity',
    hours: [9, 11],
    cooldownDays: 3,
    needsHealth: false,
    build: (ctx) => {
      const dates = new Set(ctx.logDates.filter(Boolean))
      const last = lastLogDay(dates)
      if (!last) {
        return {
          title: 'Ready when you are',
          body: 'Log your first session and GRIND starts tracking the rest.',
        }
      }
      const idle = daysBetween(last, ctx.localDay)
      if (idle < 3) return null
      return {
        title: 'Back to it',
        body: `${idle} days since your last session. A short one still counts.`,
      }
    },
  },
  {
    type: 'step_goal',
    // Late enough to know how the day went, early enough to do something about it
    hours: [18, 20],
    cooldownDays: 1,
    needsHealth: true,
    build: (ctx) => {
      const h = ctx.health
      if (!h || h.stepsToday == null || h.stepGoal <= 0) return null
      const ratio = h.stepsToday / h.stepGoal
      // Below 60% the goal is out of reach, and a reminder is just nagging
      if (ratio < 0.6 || ratio >= 1) return null
      const remaining = h.stepGoal - h.stepsToday
      return {
        title: 'Goal within reach',
        body: `${number(remaining)} steps to go — you're at ${number(h.stepsToday)} of ${number(h.stepGoal)}.`,
      }
    },
  },
  {
    type: 'recovery_milestone',
    hours: [8, 10],
    cooldownDays: 7,
    needsHealth: true,
    build: (ctx) => {
      const h = ctx.health
      if (!h) return null

      // Best sleep in a month, but only if it was a genuinely good night
      if (h.sleepMinutes != null && h.bestSleepMinutes != null) {
        if (h.sleepMinutes >= h.bestSleepMinutes && h.sleepMinutes >= 420) {
          return {
            title: 'Best sleep in a month',
            body: `${formatSleep(h.sleepMinutes)} last night — your longest in 30 days.`,
          }
        }
      }

      if (h.restingHeartRate != null && h.restingHeartRateBaseline != null) {
        if (h.restingHeartRate <= h.restingHeartRateBaseline - 2) {
          return {
            title: 'Recovery trending up',
            body: `Resting heart rate is down to ${h.restingHeartRate} bpm, below your 30-day average of ${Math.round(
              h.restingHeartRateBaseline,
            )}.`,
          }
        }
      }
      return null
    },
  },
]

const RULE_BY_TYPE = new Map(RULES.map((r) => [r.type, r]))

type GateContext = Pick<RuleContext, 'prefs' | 'localDay' | 'localHour' | 'lastSent'>

/**
 * Types that pass the cheap gate — switched on, inside their hour window, off cooldown.
 * The dispatcher uses this to decide whether a Fitbit read is worth paying for.
 */
export function dueTypes(ctx: GateContext): NotificationType[] {
  return RULES.filter((rule) => {
    if (ctx.prefs[rule.type] !== true) return false
    if (ctx.localHour < rule.hours[0] || ctx.localHour > rule.hours[1]) return false
    const last = ctx.lastSent[rule.type]
    return !last || daysBetween(last, ctx.localDay) >= rule.cooldownDays
  }).map((rule) => rule.type)
}

export function needsHealthData(types: NotificationType[]): boolean {
  return types.some((t) => RULE_BY_TYPE.get(t)?.needsHealth === true)
}

/** The notifications to send right now. Empty is the common, correct answer. */
export function evaluate(ctx: RuleContext): Notification[] {
  const out: Notification[] = []
  for (const type of dueTypes(ctx)) {
    const built = RULE_BY_TYPE.get(type)!.build(ctx)
    if (!built) continue
    out.push({
      ...built,
      type,
      // Same kind replaces itself on the lock screen rather than piling up
      tag: `grind-${type}`,
      url: type === 'fitbit_expired' ? '/app?settings=1' : '/app',
    })
  }
  return out
}
