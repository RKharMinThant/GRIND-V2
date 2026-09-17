// POST (user JWT) → revoke Google access (best effort) and delete stored tokens.
import { adminClient, requireUser } from '../_shared/clients.ts'
import { json, preflight } from '../_shared/cors.ts'
import { revokeToken } from '../_shared/google.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const user = await requireUser(req)
  if (user instanceof Response) return user

  const db = adminClient()
  const { data: conn } = await db
    .from('health_connections')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle()
  if (conn?.refresh_token) await revokeToken(conn.refresh_token)

  const { error } = await db.from('health_connections').delete().eq('user_id', user.id)
  if (error) return json(req, { error: 'delete_failed', detail: error.message }, 500)
  return json(req, { ok: true })
})
