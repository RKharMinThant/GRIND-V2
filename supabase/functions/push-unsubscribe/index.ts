// POST { endpoint } (user JWT) → { ok: true }
// Forgets this device. Scoped to the caller so one account can't delete another's row.
import { adminClient, requireUser } from '../_shared/clients.ts'
import { json, preflight } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const user = await requireUser(req)
  if (user instanceof Response) return user

  const { endpoint } = await req.json().catch(() => ({}))
  if (typeof endpoint !== 'string' || !endpoint) {
    return json(req, { error: 'invalid_request', detail: 'Missing endpoint' }, 400)
  }

  const db = adminClient()
  const { error } = await db
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  if (error) {
    console.error('push-unsubscribe delete failed', error.message)
    return json(req, { error: 'delete_failed', detail: error.message }, 500)
  }
  return json(req, { ok: true })
})
