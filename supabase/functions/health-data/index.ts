// POST { from, to } (user JWT) → { workouts, recovery, steps, today, lastSyncedAt }
// 404 not_connected · 409 expired · 502 google
import { normalizeToday } from '../_shared/bodyNormalize.ts'
import { adminClient, requireUser } from '../_shared/clients.ts'
import { ensureHealthUserId, getAccessToken, invalidateAccessToken } from '../_shared/connection.ts'
import { json, preflight } from '../_shared/cors.ts'
import { dailyRollUpRange, dailyStepsRollUp, FILTERS, GoogleApiError, listAll } from '../_shared/googleApi.ts'
import { buildRecovery, normalizeExercise, normalizeStepsRollup } from '../_shared/normalize.ts'
import type { HealthWorkout } from '../_shared/types.ts'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 180

const addDaysIso = (date: string, delta: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const user = await requireUser(req)
  if (user instanceof Response) return user

  const { from, to } = await req.json().catch(() => ({}))
  if (!DATE_RE.test(from ?? '') || !DATE_RE.test(to ?? '') || from > to) {
    return json(req, { error: 'invalid_range' }, 400)
  }
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) {
    return json(req, { error: 'range_too_large' }, 400)
  }

  const db = adminClient()
  const accessToken = await getAccessToken(req, db, user.id)
  if (accessToken instanceof Response) return accessToken

  // Backfills health_user_id once, so webhooks can map back to this account
  await ensureHealthUserId(db, user.id, accessToken)

  const recoveryFrom = addDaysIso(to, -7)
  try {
    const [exercise, sleep, rhr, hrv, stepsRollup, todayDistance, todayAzm, todayCalories] = await Promise.all([
      listAll(accessToken, 'exercise', FILTERS.exercise(from)),
      listAll(accessToken, 'sleep', FILTERS.sleep(recoveryFrom)),
      listAll(accessToken, 'daily-resting-heart-rate', FILTERS.dailyRestingHeartRate(recoveryFrom)),
      listAll(accessToken, 'daily-heart-rate-variability', FILTERS.dailyHeartRateVariability(recoveryFrom)),
      dailyStepsRollUp(accessToken, from, to),
      dailyRollUpRange(accessToken, 'distance', to, to),
      dailyRollUpRange(accessToken, 'active-zone-minutes', to, to),
      dailyRollUpRange(accessToken, 'total-calories', to, to),
    ])

    const workouts = exercise
      .map(normalizeExercise)
      .filter((w): w is HealthWorkout => w !== null)
      .sort((a, b) => a.start.localeCompare(b.start))
    const lastSyncedAt = new Date().toISOString()
    await db.from('health_connections').update({ last_synced_at: lastSyncedAt }).eq('user_id', user.id)

    return json(req, {
      workouts,
      recovery: buildRecovery(to, sleep, rhr, hrv),
      steps: normalizeStepsRollup(stepsRollup),
      today: normalizeToday(to, {
        steps: stepsRollup,
        distance: todayDistance,
        azm: todayAzm,
        calories: todayCalories,
      }),
      lastSyncedAt,
    })
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 401) await invalidateAccessToken(db, user.id)
    const detail = e instanceof GoogleApiError ? e.detail : (e as Error).message
    const source = e instanceof GoogleApiError ? e.dataType : undefined
    console.error('health-data google error', source, detail)
    return json(req, { error: 'google', source, detail }, 502)
  }
})
