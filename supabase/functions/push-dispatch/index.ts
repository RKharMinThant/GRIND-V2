// POST with header `x-cron-secret` → { users, evaluated, sent }
//
// Runs hourly from .github/workflows/push-notifications.yml. Deployed with
// --no-verify-jwt (the scheduler has no user login), so PUSH_CRON_SECRET is the gate.
//
// Cost shape: four small queries cover everyone, then a Fitbit read happens only for
// users whose local hour has actually opened a Fitbit rule's window — at most one
// per user per day, not one per hourly run.

import { adminClient } from '../_shared/clients.ts'
import { resolveAccessToken } from '../_shared/connection.ts'
import { json } from '../_shared/cors.ts'
import { FILTERS, dailyStepsRollUp, listAll } from '../_shared/googleApi.ts'
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
import { MIN_WORKOUT_MINUTES } from '../_shared/workoutNotification.ts'

/** Users processed at once. Keeps slow Google reads from serialising the whole run. */
const CONCURRENCY = 4
/** Ledger rows older than this are pruned; the longest cooldown is a week. */
const LEDGER_RETENTION_DAYS = 60
const DEFAULT_STEP_GOAL = 10000

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
    db.from('profiles').select('id, notification_prefs, daily_step_goal, display_name').in('id', userIds),
    db.from('notification_sends').select('user_id, type, local_day').in('user_id', userIds).gte('local_day', since),
    db.from('health_connections').select('user_id, status').in('user_id', userIds),
    // Deliberately unbounded: "days since your last session" must not read as
    // "you have never logged anything" for someone who has simply been away a while.
    // One short column per log row, only for users with a subscription.
    db.from('logs').select('user_id, log_date, workout').in('user_id', userIds),
  ])

  const prefsBy = new Map<string, { prefs: NotificationPrefs; stepGoal: number; name: string | null }>()
  for (const p of profiles.data ?? []) {
    prefsBy.set(p.id, {
      prefs: (p.notification_prefs ?? {}) as NotificationPrefs,
      stepGoal: p.daily_step_goal ?? DEFAULT_STEP_GOAL,
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
              .filter((w): w is HealthWorkout => w !== null && w.durationMin >= MIN_WORKOUT_MINUTES)
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

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return unauthorized()
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const db = adminClient()
  const now = new Date()

  const subscriptions = await allSubscriptions(db)
  if (subscriptions.length === 0) return json(req, { users: 0, evaluated: 0, sent: 0 })

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

    const due = dueTypes(gate)
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

    const notifications = evaluate({
      ...gate,
      logDates: logsBy.get(userId) ?? [],
      trainingLogDates: trainingBy.get(userId) ?? [],
      fitbitStatus: statusBy.get(userId) ?? 'none',
      health,
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
  return json(req, { users: userIds.length, evaluated, sent })
})
