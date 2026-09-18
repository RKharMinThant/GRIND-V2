// POST { endpoint, p256dh, auth, timeZone, userAgent } (user JWT) → { ok: true }
// Stores or refreshes this device's push subscription. 400 invalid_subscription
import { adminClient, requireUser } from '../_shared/clients.ts'
import { json, preflight } from '../_shared/cors.ts'
import { isSafePushEndpoint } from '../_shared/pushEndpoint.ts'

/** IANA zone names are conservative: letters, digits and a few separators. */
const TIME_ZONE_RE = /^[A-Za-z0-9+_\-/]{1,64}$/

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const user = await requireUser(req)
  if (user instanceof Response) return user

  const { endpoint, p256dh, auth, timeZone, userAgent } = await req.json().catch(() => ({}))

  if (!isSafePushEndpoint(String(endpoint ?? ''))) {
    return json(req, { error: 'invalid_subscription', detail: 'Unusable push endpoint' }, 400)
  }
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) {
    return json(req, { error: 'invalid_subscription', detail: 'Missing encryption keys' }, 400)
  }

  const zone = typeof timeZone === 'string' && TIME_ZONE_RE.test(timeZone) ? timeZone : 'UTC'

  const db = adminClient()
  // The endpoint is the primary key, so re-subscribing the same device updates
  // in place — including taking it over if the phone changed accounts.
  const { error } = await db.from('push_subscriptions').upsert(
    {
      endpoint,
      user_id: user.id,
      p256dh,
      auth,
      time_zone: zone,
      user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 200) : null,
      failure_count: 0,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    console.error('push-subscribe upsert failed', error.message)
    return json(req, { error: 'save_failed', detail: error.message }, 500)
  }
  return json(req, { ok: true })
})
