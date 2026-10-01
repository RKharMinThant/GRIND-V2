// POST with header `x-cron-secret` → 202 { accepted } (work continues in the background)
// POST ?wait=1                     → 200 { users, evaluated, sent } once the run finishes
//
// Runs hourly from Supabase Cron (job push-dispatch-hourly). Deployed with
// --no-verify-jwt (the scheduler has no user login), so PUSH_CRON_SECRET is the gate.
//
// Cost shape: four small queries cover everyone, then a Fitbit read happens only for
// users whose local hour has actually opened a Fitbit rule's window — at most one
// per user per day, not one per hourly run.

import { adminClient } from '../_shared/clients.ts'
import { resolveAccessToken } from '../_shared/connection.ts'
import { json } from '../_shared/cors.ts'
import { normalizeActivity } from '../_shared/bodyNormalize.ts'
import { FILTERS, dailyRollUpRange, dailyStepsRollUp, listAll } from '../_shared/googleApi.ts'
import { localParts } from '../_shared/localTime.ts'
import {
  dueTypes,
  evaluate,
  isRestWorkout,
  needsHealthData,
  type HealthSnapshot,
  type NotificationPrefs,
  type NotificationType,
} from '../_shared/notifyRules.ts'
import {
  normalizeExercise,
  normalizeStepsRollup,
  restingHeartRateByDate,
  sleepMinutesByNight,
} from '../_shared/normalize.ts'
import { firstName } from '../_shared/personal.ts'
import { allSubscriptions, deliver, type SubscriptionRow } from '../_shared/subscriptions.ts'
import type { HealthWorkout } from '../_shared/types.ts'
import { isTrainingSession } from '../_shared/workoutNotification.ts'
import { summarizeWeek, type WeeklySummary } from '../_shared/weeklyReport.ts'

/** Users processed at once. Keeps slow Google reads from serialising the whole run. */
const CONCURRENCY = 4
/** Ledger rows older than this are pruned; the longest cooldown is a week. */
const LEDGER_RETENTION_DAYS = 60
const DEFAULT_STEP_GOAL = 10000
const DEFAULT_WEEKLY_GOAL = 4
const LIFT_PAGE = 1000

type Db = ReturnType<typeof adminClient>

const addDays = (date: string, delta: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Everything the rules need that doesn't cost a Google call, for every user at once. */
async function loadContext(db: Db, userIds: string[], since: string) {
  const [profiles, sends, connections, logs] = await Promise.all([
    db.from('profiles').select('id, notification_prefs, daily_step_goal, weekly_goal, display_name').in('id', userIds),
    db.from('notification_sends').select('user_id, type, local_day').in('user_id', userIds).gte('local_day', since),
    db.from('health_connections').select('user_id, status').in('user_id', userIds),
    // Deliberately unbounded: "days since your last session" must not read as
    // "you have never logged anything" for someone who has simply been away a while.
    // One short column per log row, only for users with a subscription.
    db.from('logs').select('user_id, log_date, workout').in('user_id', userIds),
  ])

  const prefsBy = new Map<
    string,
    { prefs: NotificationPrefs; stepGoal: number; weeklyGoal: number; name: string | null }
  >()
  for (const p of profiles.data ?? []) {
    prefsBy.set(p.id, {
      prefs: (p.notification_prefs ?? {}) as NotificationPrefs,
      stepGoal: p.daily_step_goal ?? DEFAULT_STEP_GOAL,
      weeklyGoal: p.weekly_goal ?? DEFAULT_WEEKLY_GOAL,
      name: firstName(p.display_name),
    })
  }

  const sentBy = new Map<string, Partial<Record<NotificationType, string>>>()
  for (const s of sends.data ?? []) {
    const existing = sentBy.get(s.user_id) ?? {}
    const type = s.type as NotificationType
    // Keep the most recent send per type
    if (!existing[type] || existing[type]! < s.local_day) existing[type] = s.local_day
    sentBy.set(s.user_id, existing)
  }

  const statusBy = new Map<string, 'connected' | 'expired'>()
  for (const c of connections.data ?? []) statusBy.set(c.user_id, c.status)

  const logsBy = new Map<string, string[]>()
  // A logged rest day keeps a streak alive but is not training, so the rest-day
  // rule needs the two apart
  const trainingBy = new Map<string, string[]>()
  for (const l of logs.data ?? []) {
    const list = logsBy.get(l.user_id) ?? []
    list.push(l.log_date)
    logsBy.set(l.user_id, list)
    if (!isRestWorkout(l.workout)) {
      const training = trainingBy.get(l.user_id) ?? []
      training.push(l.log_date)
      trainingBy.set(l.user_id, training)
    }
  }

  return { prefsBy, sentBy, statusBy, logsBy, trainingBy }
}

/** The Fitbit reads a due rule needs — and nothing more. */
async function loadHealth(
  db: Db,
  userId: string,
  localDay: string,
  timeZone: string,
  due: NotificationType[],
  stepGoal: number,
  wantExercise: boolean,
): Promise<HealthSnapshot | null> {
  const token = await resolveAccessToken(db, userId)
  if (!token.ok) return null

  const wantSteps = due.includes('step_goal')
  const wantRecovery = due.includes('recovery_milestone')
  const from = addDays(localDay, -30)

  try {
    const [steps, sleep, rhr, exercise] = await Promise.all([
      wantSteps ? dailyStepsRollUp(token.token, localDay, localDay) : Promise.resolve([]),
      wantRecovery ? listAll(token.token, 'sleep', FILTERS.sleep(from)) : Promise.resolve([]),
      wantRecovery
        ? listAll(token.token, 'daily-resting-heart-rate', FILTERS.dailyRestingHeartRate(from))
        : Promise.resolve([]),
      // Today and the three days before it, plus a day's margin because the filter is on
      // civil start time and a late session can finish after midnight
      wantExercise ? listAll(token.token, 'exercise', FILTERS.exercise(addDays(localDay, -4))) : Promise.resolve([]),
    ])

    const exerciseDates = wantExercise
      ? [
          ...new Set(
            exercise
              .map(normalizeExercise)
              .filter((w): w is HealthWorkout => w !== null && isTrainingSession(w))
              // The day it finished, on the user's own clock
              .map((w) => localParts(new Date(w.end), timeZone).day),
          ),
        ]
      : null

    const stepsToday = wantSteps
      ? (normalizeStepsRollup(steps).find((d) => d.date === localDay)?.steps ?? null)
      : null

    const nights = sleepMinutesByNight(sleep)
    const sleepMinutes = nights.get(localDay) ?? null
    // "Best in 30 days" must exclude last night, or it always ties with itself
    const priorNights = [...nights].filter(([date]) => date < localDay).map(([, m]) => m)
    const bestSleepMinutes = priorNights.length ? Math.max(...priorNights) : null

    const rhrByDate = restingHeartRateByDate(rhr)
    const restingHeartRate = rhrByDate.get(localDay) ?? null
    const priorRhr = [...rhrByDate].filter(([date]) => date < localDay).map(([, v]) => v)
    const restingHeartRateBaseline = priorRhr.length
      ? priorRhr.reduce((a, b) => a + b, 0) / priorRhr.length
      : null

    return {
      stepsToday,
      stepGoal,
      sleepMinutes,
      bestSleepMinutes,
      restingHeartRate,
      restingHeartRateBaseline,
      exerciseDates,
    }
  } catch (e) {
    console.error('push-dispatch health read failed', userId, (e as Error).message)
    return null
  }
}

/** Daily Fitbit zone minutes for the week ending `localDay`; null when Fitbit can't be read. */
async function loadWeekZoneMinutes(db: Db, userId: string, localDay: string) {
  const token = await resolveAccessToken(db, userId)
  if (!token.ok) return null
  try {
    const azm = await dailyRollUpRange(token.token, 'active-zone-minutes', addDays(localDay, -6), localDay)
    return normalizeActivity({ azm }).flatMap((d) =>
      d.azm ? [{ date: d.date, fatBurn: d.azm.fatBurn, cardio: d.azm.cardio, peak: d.azm.peak }] : [],
    )
  } catch (e) {
    console.error('push-dispatch zone minutes read failed', userId, (e as Error).message)
    return null
  }
}

/** Everything the week-in-review needs for one user. Fitbit trouble only drops zone minutes. */
async function loadWeekly(
  db: Db,
  userId: string,
  localDay: string,
  timeZone: string,
  goal: number,
  trainingDates: string[],
  wantZones: boolean,
): Promise<WeeklySummary> {
  // Personal-best detection needs every earlier row of a lift, not just recent ones.
  // Paged because a single request is capped; select only what the maths uses.
  const lifts: { liftId: string; recordedAt: string; date: string; sets: { reps: number; weight: number }[]; unit: string }[] = []
  for (let from = 0; ; from += LIFT_PAGE) {
    const { data, error } = await db
      .from('lift_history')
      .select('lift_id, sets_detail, unit, recorded_at')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: true })
      // Tie-breaker, so rows sharing a timestamp never shift between pages
      .order('id', { ascending: true })
      .range(from, from + LIFT_PAGE - 1)
    if (error) throw error
    for (const r of data ?? []) {
      lifts.push({
        liftId: r.lift_id,
        recordedAt: r.recorded_at,
        date: localParts(new Date(r.recorded_at), timeZone).day,
        sets: Array.isArray(r.sets_detail) ? r.sets_detail : [],
        unit: r.unit,
      })
    }
    if ((data?.length ?? 0) < LIFT_PAGE) break
  }

  const [ages, azm] = await Promise.all([
    db.from('grind_age_weekly').select('grind_age, week_start').eq('user_id', userId).order('week_start', { ascending: false }).limit(2),
    wantZones ? loadWeekZoneMinutes(db, userId, localDay) : Promise.resolve(null),
  ])

  return summarizeWeek({
    localDay,
    goal,
    // Rest days are already filtered out of these, so the workout name no longer matters
    logs: trainingDates.map((date) => ({ date, workout: null })),
    lifts,
    azm,
    grindAges: (ages.data ?? [])
      .map((a) => ({ weekStart: String(a.week_start), grindAge: Number(a.grind_age) }))
      .filter((a) => Number.isFinite(a.grindAge)),
  })
}

type RunSummary = { users: number; evaluated: number; sent: number }

async function dispatch(): Promise<RunSummary> {
  const db = adminClient()
  const now = new Date()

  const subscriptions = await allSubscriptions(db)
  if (subscriptions.length === 0) return { users: 0, evaluated: 0, sent: 0 }

  // Group by user. Rows come newest-first, so the first zone we see is the freshest.
  const byUser = new Map<string, { timeZone: string; subs: SubscriptionRow[] }>()
  for (const sub of subscriptions) {
    const entry = byUser.get(sub.user_id)
    if (entry) entry.subs.push(sub)
    else byUser.set(sub.user_id, { timeZone: sub.time_zone, subs: [sub] })
  }

  const userIds = [...byUser.keys()]
  // Bounds the send ledger only; cooldowns never look back further than a week
  const since = addDays(now.toISOString().slice(0, 10), -60)
  const { prefsBy, sentBy, statusBy, logsBy, trainingBy } = await loadContext(db, userIds, since)

  let evaluated = 0
  let sent = 0

  async function processUser(userId: string): Promise<void> {
    const entry = byUser.get(userId)!
    const profile = prefsBy.get(userId)
    if (!profile) return

    const { day, hour } = localParts(now, entry.timeZone)
    const lastSent = sentBy.get(userId) ?? {}
    const gate = { prefs: profile.prefs, localDay: day, localHour: hour, lastSent }

    // The weekly report is Sunday-only; skip it (and its Fitbit read) on other days
    const isSunday = new Date(`${day}T00:00:00Z`).getUTCDay() === 0
    const due = dueTypes(gate).filter((t) => t !== 'weekly_report' || isSunday)
    if (due.length === 0) return
    evaluated++

    // The streak warning also asks "is today a planned rest day?" when the rest-day
    // check-in is on, and a forgotten log shouldn't make it guess wrong
    const wantExercise =
      due.includes('rest_day') || (due.includes('streak_risk') && profile.prefs.rest_day === true)
    const health =
      needsHealthData(due) || wantExercise
        ? await loadHealth(db, userId, day, entry.timeZone, due, profile.stepGoal, wantExercise)
        : null

    // Zone minutes come from the same Fitbit connection; the report sends without them
    let weekly: WeeklySummary | null = null
    if (due.includes('weekly_report')) {
      try {
        weekly = await loadWeekly(
          db, userId, day, entry.timeZone, profile.weeklyGoal,
          trainingBy.get(userId) ?? [], (statusBy.get(userId) ?? 'none') === 'connected',
        )
      } catch (e) {
        console.error('push-dispatch weekly summary failed', userId, (e as Error).message)
      }
    }

    const notifications = evaluate({
      ...gate,
      logDates: logsBy.get(userId) ?? [],
      trainingLogDates: trainingBy.get(userId) ?? [],
      fitbitStatus: statusBy.get(userId) ?? 'none',
      health,
      weekly,
      name: profile.name,
    })

    for (const notification of notifications) {
      // Claim the slot first: the primary key makes a second run a no-op rather
      // than a second buzz, even if two runs overlap.
      const claim = await db
        .from('notification_sends')
        .insert({ user_id: userId, type: notification.type, local_day: day })
      if (claim.error) continue

      const delivered = await deliver(db, entry.subs, {
        title: notification.title,
        body: notification.body,
        tag: notification.tag,
        url: notification.url,
      })

      if (delivered > 0) {
        sent++
      } else {
        // Nothing reached the user — release the claim so a later run can retry
        await db
          .from('notification_sends')
          .delete()
          .eq('user_id', userId)
          .eq('type', notification.type)
          .eq('local_day', day)
      }
    }
  }

  for (let i = 0; i < userIds.length; i += CONCURRENCY) {
    await Promise.all(userIds.slice(i, i + CONCURRENCY).map((id) => processUser(id)))
  }

  await db
    .from('notification_sends')
    .delete()
    .lt('local_day', addDays(now.toISOString().slice(0, 10), -LEDGER_RETENTION_DAYS))

  console.log(`push-dispatch users=${userIds.length} evaluated=${evaluated} sent=${sent}`)
  return { users: userIds.length, evaluated, sent }
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return unauthorized()
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  // Supabase Cron stops waiting after 5 seconds at most, and a run that reads Fitbit can
  // take longer. So by default: acknowledge now, finish in the background. Manual and
  // GitHub runs pass ?wait=1 to get the counts back for their logs.
  const wait = new URL(req.url).searchParams.get('wait') === '1'
  if (wait || typeof EdgeRuntime === 'undefined') return json(req, await dispatch())

  EdgeRuntime.waitUntil(
    dispatch().catch((e) => console.error('push-dispatch failed', (e as Error).message)),
  )
  return json(req, { accepted: true }, 202)
})
