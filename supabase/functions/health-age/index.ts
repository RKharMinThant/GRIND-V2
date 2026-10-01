// POST { timeZone?, refresh? } (user JWT) → GrindAgeResponse
//   { status: 'needs_profile' }  birth date or sex not set yet
//   { status: 'not_connected' }  no usable Google Health connection
//   { status: 'ok', weekStart, computedAt, result, pace, history, partial? }
// 502 google · 500 failed
//
// One reading per user per week (Monday in the user's time zone) is stored in
// grind_age_weekly and served until the week turns over; `refresh: true` recomputes it.
import { adminClient, requireUser } from '../_shared/clients.ts'
import { resolveAccessToken } from '../_shared/connection.ts'
import { json, preflight } from '../_shared/cors.ts'
import { GoogleApiError } from '../_shared/googleApi.ts'
import { computeGrindAge, paceOfAging } from '../_shared/grindAge.ts'
import { addDays, ageInYears, gatherGrindAgeInputs, weekStartOf } from '../_shared/grindAgeInputs.ts'
import type { GrindAgeReading, GrindAgeResponse, GrindAgeResult, Sex } from '../_shared/grindAgeTypes.ts'
import { localParts } from '../_shared/localTime.ts'

/** IANA zone names are conservative: letters, digits and a few separators. */
const TIME_ZONE_RE = /^[A-Za-z0-9+_\-/]{1,64}$/
const HISTORY_WEEKS = 12
/** Previous readings fetched for Pace of Aging, which looks back 26 weeks. */
const PACE_LOOKBACK_READINGS = 25
/** Every data read gathering can report as failed (labels from grindAgeInputs.ts). */
const GOOGLE_READS = ['sleep', 'activity', 'strength', 'resting heart rate', 'height']
const MIN_AGE = 13
const MAX_AGE = 110

type Db = ReturnType<typeof adminClient>

/** The newest `limit` readings dated before `before`, oldest first. */
async function readingsBefore(db: Db, userId: string, before: string, limit: number) {
  const { data, error } = await db
    .from('grind_age_weekly')
    .select('week_start, grind_age, chronological_age')
    .eq('user_id', userId)
    .lt('week_start', before)
    .order('week_start', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []).reverse()
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const user = await requireUser(req)
  if (user instanceof Response) return user

  const { timeZone, refresh } = await req.json().catch(() => ({}))
  const zone = typeof timeZone === 'string' && TIME_ZONE_RE.test(timeZone) ? timeZone : 'UTC'

  const today = localParts(new Date(), zone).day
  const weekStart = weekStartOf(today)
  const db = adminClient()

  try {
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('birth_date, sex')
      .eq('id', user.id)
      .maybeSingle()
    if (profileError) throw new Error(profileError.message)
    if (!profile?.birth_date || !profile?.sex) {
      return json(req, { status: 'needs_profile' } satisfies GrindAgeResponse)
    }
    // A birth date in the future or a century ago is a typo, not a person
    const age = ageInYears(profile.birth_date as string, today)
    if (!(age >= MIN_AGE && age <= MAX_AGE)) {
      return json(req, { status: 'needs_profile' } satisfies GrindAgeResponse)
    }

    const token = await resolveAccessToken(db, user.id)
    if (!token.ok) {
      // Only a missing or expired connection means "reconnect". A failed refresh may be a
      // blip, so let the app keep its last reading.
      if (token.reason === 'refresh_failed') {
        return json(req, { error: 'google', detail: token.detail ?? 'Token refresh failed' }, 502)
      }
      return json(req, { status: 'not_connected' } satisfies GrindAgeResponse)
    }

    if (refresh !== true) {
      const { data: row, error } = await db
        .from('grind_age_weekly')
        .select('result, pace, computed_at')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .maybeSingle()
      if (error) throw new Error(error.message)
      if (row) {
        // Up to the day after this week's Monday, so the current week is included
        const history = await readingsBefore(db, user.id, addDays(weekStart, 1), HISTORY_WEEKS)
        return json(req, {
          status: 'ok',
          weekStart,
          computedAt: row.computed_at as string,
          result: row.result as GrindAgeResult,
          pace: row.pace == null ? null : Number(row.pace),
          history: history.map((h) => ({ weekStart: h.week_start as string, grindAge: Number(h.grind_age) })),
        } satisfies GrindAgeResponse)
      }
    }

    const { inputs, failed } = await gatherGrindAgeInputs({
      db,
      token: token.token,
      userId: user.id,
      today,
      timeZone: zone,
      birthDate: profile.birth_date as string,
      sex: profile.sex as Sex,
    })
    // Every Google read failed: there is nothing to score, so don't show a reading built on nothing
    if (GOOGLE_READS.every((label) => failed.includes(label))) {
      return json(req, { error: 'google', detail: 'Could not read Fitbit data' }, 502)
    }
    const result = computeGrindAge(inputs)

    const previous = await readingsBefore(db, user.id, weekStart, PACE_LOOKBACK_READINGS)
    const readings: GrindAgeReading[] = [
      ...previous.map((p) => ({
        weekStart: p.week_start as string,
        grindAge: Number(p.grind_age),
        chronologicalAge: Number(p.chronological_age),
      })),
      { weekStart, grindAge: result.grindAge, chronologicalAge: result.chronologicalAge },
    ]
    const pace = paceOfAging(readings)

    const computedAt = new Date().toISOString()
    // Only store a complete reading. If a Google read failed, show this result but leave
    // the week unsaved, so the next open retries instead of keeping the gap all week.
    if (failed.length === 0) {
      const { error: saveError } = await db.from('grind_age_weekly').upsert(
        {
          user_id: user.id,
          week_start: weekStart,
          chronological_age: result.chronologicalAge,
          grind_age: result.grindAge,
          pace,
          result,
          computed_at: computedAt,
        },
        { onConflict: 'user_id,week_start' },
      )
      if (saveError) throw new Error(saveError.message)
    } else {
      console.error('health-age not saving partial reading; failed:', failed.join(', '))
    }

    return json(req, {
      status: 'ok',
      weekStart,
      computedAt,
      result,
      pace,
      history: readings.slice(-HISTORY_WEEKS).map((r) => ({ weekStart: r.weekStart, grindAge: r.grindAge })),
      partial: failed.length > 0,
    } satisfies GrindAgeResponse)
  } catch (e) {
    if (e instanceof GoogleApiError) {
      console.error('health-age google error', e.dataType, e.detail)
      return json(req, { error: 'google', detail: e.detail }, 502)
    }
    console.error('health-age failed', (e as Error).message)
    return json(req, { error: 'failed', detail: (e as Error).message }, 500)
  }
})
