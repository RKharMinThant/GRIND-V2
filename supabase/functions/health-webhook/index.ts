// Google Health webhook receiver — deploy with --no-verify-jwt (Google has no Supabase login).
//
// Two jobs:
//   1. The registration handshake. Google POSTs {"type":"verification"} twice — once with
//      the Authorization secret (must answer 200 or 201; 204 fails) and once without
//      (must answer 401/403).
//   2. Notifications. Google says "healthUserId X changed exercise data in interval Y";
//      we fetch that workout and push it to the user's phone.
//
// Google requires an immediate 204 and retries anything else for up to 7 days, so the
// work happens after the response via waitUntil rather than inside the request.

import { adminClient } from '../_shared/clients.ts'
import { resolveAccessToken } from '../_shared/connection.ts'
import { FILTERS, listAll } from '../_shared/googleApi.ts'
import { verifyWebhookSignature, webhookPublicKeys } from '../_shared/googleSignature.ts'
import { localParts } from '../_shared/localTime.ts'
import { normalizeExercise } from '../_shared/normalize.ts'
import { firstName } from '../_shared/personal.ts'
import { deliver, userSubscriptions } from '../_shared/subscriptions.ts'
import type { HealthWorkout } from '../_shared/types.ts'
import { workoutNotification } from '../_shared/workoutNotification.ts'

const NOTIFICATION_TYPE = 'workout_done'
/** Ignore anything that finished longer ago than this — backfills must not buzz. */
const MAX_WORKOUT_AGE_MS = 6 * 60 * 60 * 1000

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

const noContent = () => new Response(null, { status: 204 })
const unauthorized = () => new Response(null, { status: 401 })

function authorized(req: Request): boolean {
  const expected = Deno.env.get('HEALTH_WEBHOOK_SECRET')
  if (!expected) return false
  const header = req.headers.get('Authorization') ?? ''
  // Google echoes the secret exactly as configured, which already includes "Bearer "
  return header === expected || header === `Bearer ${expected}`
}

type Notification = {
  healthUserId?: string
  dataType?: string
  operation?: string
  intervals?: { physicalTimeInterval?: { startTime?: string; endTime?: string } }[]
}

/** Earliest civil date the changed intervals touch, as the exercise filter wants. */
function filterFrom(notification: Notification): string {
  const starts = (notification.intervals ?? [])
    .map((i) => i.physicalTimeInterval?.startTime)
    .filter((s): s is string => Boolean(s))
    .sort()
  const earliest = starts[0] ? Date.parse(starts[0]) : Date.now()
  // Step back a day: the filter is on civil start time and the payload is UTC
  return new Date(earliest - 86_400_000).toISOString().slice(0, 10)
}

async function handleNotification(notification: Notification): Promise<void> {
  const healthUserId = notification.healthUserId
  if (!healthUserId || notification.dataType !== 'exercise') return
  if (notification.operation && notification.operation !== 'UPSERT') return

  const db = adminClient()
  const { data: connection } = await db
    .from('health_connections')
    .select('user_id')
    .eq('health_user_id', healthUserId)
    .maybeSingle()
  if (!connection) {
    console.log('webhook for an unknown healthUserId — ignoring')
    return
  }
  const userId = connection.user_id as string

  const { data: profile } = await db
    .from('profiles')
    .select('notification_prefs, display_name')
    .eq('id', userId)
    .maybeSingle()
  if ((profile?.notification_prefs ?? {})[NOTIFICATION_TYPE] !== true) return
  const name = firstName(profile?.display_name)

  const subscriptions = await userSubscriptions(db, userId)
  if (subscriptions.length === 0) return

  const token = await resolveAccessToken(db, userId)
  if (!token.ok) {
    console.error('webhook could not get a Google token', token.reason)
    return
  }

  const points = await listAll(token.token, 'exercise', FILTERS.exercise(filterFrom(notification)))
  const workouts = points
    .map(normalizeExercise)
    .filter((w): w is HealthWorkout => w !== null)
    .filter((w) => Date.now() - Date.parse(w.end) < MAX_WORKOUT_AGE_MS)
    .sort((a, b) => a.end.localeCompare(b.end))

  const timeZone = subscriptions[0].time_zone
  for (const workout of workouts) {
    const end = localParts(new Date(workout.end), timeZone)
    const payload = workoutNotification(workout, end.hour, { name })
    if (!payload) continue

    // Claim before sending: Google retries, and a retry must not buzz twice.
    const claim = await db.from('notification_sends').insert({
      user_id: userId,
      type: NOTIFICATION_TYPE,
      local_day: end.day,
      ref: workout.id,
    })
    if (claim.error) continue

    const delivered = await deliver(db, subscriptions, payload)
    if (delivered === 0) {
      await db
        .from('notification_sends')
        .delete()
        .eq('user_id', userId)
        .eq('type', NOTIFICATION_TYPE)
        .eq('local_day', end.day)
        .eq('ref', workout.id)
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 })

  // The unauthenticated half of the handshake, and every forged request, stops here
  if (!authorized(req)) return unauthorized()

  const raw = await req.text()

  let body: { data?: Notification; type?: string }
  try {
    body = JSON.parse(raw)
  } catch {
    return noContent()
  }

  // Registration probe. Google requires exactly 200 or 201 here — a 204, which is right
  // for notifications, fails verification with FAILED_PRECONDITION.
  if (body?.type === 'verification') return new Response(null, { status: 201 })
  if (!body?.data) return noContent()

  const signature = req.headers.get('GOOGLE-HEALTH-API-SIGNATURE') ?? ''
  const valid = await verifyWebhookSignature(raw, signature, await webhookPublicKeys())
  if (!valid) {
    console.error('webhook signature rejected')
    // 204 anyway: retrying a request we will never accept helps nobody
    return noContent()
  }

  const work = handleNotification(body.data).catch((e) =>
    console.error('webhook processing failed', (e as Error).message),
  )
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work)
  else await work

  return noContent()
})
