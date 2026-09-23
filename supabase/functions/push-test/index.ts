// POST {} (user JWT) → { delivered } — sends a test notification to the caller's devices.
// The only way to prove the whole chain works without waiting for a real trigger.
import { adminClient, requireUser } from '../_shared/clients.ts'
import { json, preflight } from '../_shared/cors.ts'
import { firstName, personal } from '../_shared/personal.ts'
import { deliver, userSubscriptions } from '../_shared/subscriptions.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const user = await requireUser(req)
  if (user instanceof Response) return user

  const db = adminClient()
  const subs = await userSubscriptions(db, user.id)
  if (subs.length === 0) {
    return json(req, { error: 'not_subscribed', detail: 'No device is registered yet' }, 404)
  }

  const { data: profile } = await db.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  const name = firstName(profile?.display_name)

  try {
    const delivered = await deliver(db, subs, {
      title: personal(name, (n) => `Hi ${n}`, 'GRIND'),
      body: 'Notifications are working. This is the only test you’ll get.',
      tag: 'grind-test',
      url: '/app',
    })
    if (delivered === 0) {
      return json(req, { error: 'delivery_failed', detail: 'No device accepted the notification' }, 502)
    }
    return json(req, { delivered })
  } catch (e) {
    console.error('push-test failed', (e as Error).message)
    return json(req, { error: 'send_failed', detail: (e as Error).message }, 500)
  }
})
