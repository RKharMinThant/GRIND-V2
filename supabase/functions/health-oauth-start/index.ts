// POST { returnTo } (user JWT) → { url } Google consent URL.
import { adminClient, requireUser } from '../_shared/clients.ts'
import { isAllowedOrigin, json, preflight } from '../_shared/cors.ts'
import { authorizationUrl } from '../_shared/google.ts'

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const user = await requireUser(req)
  if (user instanceof Response) return user

  const { returnTo } = await req.json().catch(() => ({}))
  if (!isAllowedOrigin(returnTo)) return json(req, { error: 'invalid_return_to' }, 400)

  const state = randomState()
  const { error } = await adminClient()
    .from('health_oauth_states')
    .insert({ state, user_id: user.id, return_to: returnTo.replace(/\/$/, '') })
  if (error) return json(req, { error: 'state_insert_failed', detail: error.message }, 500)

  try {
    return json(req, { url: authorizationUrl(state) })
  } catch (e) {
    return json(req, { error: 'misconfigured', detail: (e as Error).message }, 500)
  }
})
