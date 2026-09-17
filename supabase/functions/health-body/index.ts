// POST { section, date, tzOffsetMin } (user JWT) → one Body tab section
// sections: activity · heart · sleep · vitals
// 400 invalid · 404 not_connected · 409 expired · 502 google
import {
  normalizeActivity,
  normalizeHeart,
  normalizeSleepNights,
  normalizeVitals,
} from '../_shared/bodyNormalize.ts'
import { adminClient, requireUser } from '../_shared/clients.ts'
import { getAccessToken, invalidateAccessToken } from '../_shared/connection.ts'
import { json, preflight } from '../_shared/cors.ts'
import { dailyRollUpRange, FILTERS, GoogleApiError, listAll, rollUpWindow } from '../_shared/googleApi.ts'
import type { BodySectionId } from '../_shared/types.ts'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SECTIONS: BodySectionId[] = ['activity', 'heart', 'sleep', 'vitals']

const addDaysIso = (date: string, delta: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)

async function loadSection(token: string, section: BodySectionId, date: string, tzOffsetMin: number) {
  const from30 = addDaysIso(date, -29)

  if (section === 'activity') {
    const [steps, distance, azm, activeMinutes, calories, floors] = await Promise.all([
      dailyRollUpRange(token, 'steps', from30, date),
      dailyRollUpRange(token, 'distance', from30, date),
      dailyRollUpRange(token, 'active-zone-minutes', from30, date),
      dailyRollUpRange(token, 'active-minutes', from30, date),
      dailyRollUpRange(token, 'total-calories', from30, date),
      dailyRollUpRange(token, 'floors', from30, date),
    ])
    return normalizeActivity({ steps, distance, azm, activeMinutes, calories, floors })
  }

  if (section === 'heart') {
    // Local midnight of `date` in UTC; the client sends its offset east of UTC in minutes
    const dayStartMs = Date.parse(`${date}T00:00:00Z`) - tzOffsetMin * 60_000
    const dayStartIso = new Date(dayStartMs).toISOString()
    const dayEndIso = new Date(Math.min(dayStartMs + 86_400_000, Date.now())).toISOString()
    const [rhr, hrv, daily, zones, curve] = await Promise.all([
      listAll(token, 'daily-resting-heart-rate', FILTERS.dailyRestingHeartRate(from30)),
      listAll(token, 'daily-heart-rate-variability', FILTERS.dailyHeartRateVariability(from30)),
      dailyRollUpRange(token, 'heart-rate', addDaysIso(date, -13), date),
      dailyRollUpRange(token, 'time-in-heart-rate-zone', date, date),
      dayEndIso > dayStartIso ? rollUpWindow(token, 'heart-rate', dayStartIso, dayEndIso, '300s') : Promise.resolve([]),
    ])
    return normalizeHeart({ rhr, hrv, daily, zones, curve, dayStartIso })
  }

  if (section === 'sleep') {
    const points = await listAll(token, 'sleep', FILTERS.sleep(addDaysIso(date, -13)))
    return { nights: normalizeSleepNights(points) }
  }

  const [spo2, breathing, temp, weight] = await Promise.all([
    listAll(token, 'daily-oxygen-saturation', FILTERS.dailyOxygenSaturation(from30)),
    listAll(token, 'daily-respiratory-rate', FILTERS.dailyRespiratoryRate(from30)),
    listAll(token, 'daily-sleep-temperature-derivations', FILTERS.dailySleepTemperature(from30)),
    listAll(token, 'weight', FILTERS.weight(addDaysIso(date, -89))),
  ])
  return normalizeVitals({ spo2, breathing, temp, weight })
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const user = await requireUser(req)
  if (user instanceof Response) return user

  const { section, date, tzOffsetMin } = await req.json().catch(() => ({}))
  if (!SECTIONS.includes(section) || !DATE_RE.test(date ?? '')) {
    return json(req, { error: 'invalid_request' }, 400)
  }
  const offset = Number.isFinite(tzOffsetMin) ? Math.max(-840, Math.min(840, Number(tzOffsetMin))) : 0

  const db = adminClient()
  const token = await getAccessToken(req, db, user.id)
  if (token instanceof Response) return token

  try {
    return json(req, await loadSection(token, section, date, offset))
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 401) await invalidateAccessToken(db, user.id)
    const detail = e instanceof GoogleApiError ? e.detail : (e as Error).message
    const source = e instanceof GoogleApiError ? e.dataType : undefined
    console.error('health-body google error', section, source, detail)
    return json(req, { error: 'google', source, detail }, 502)
  }
})
