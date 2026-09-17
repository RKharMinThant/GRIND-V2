// GET from Google's redirect (no JWT — deploy with --no-verify-jwt).
// Exchanges the code, stores tokens, and sends the user back to the app.
import { adminClient } from '../_shared/clients.ts'
import { exchangeCode, HEALTH_SCOPES } from '../_shared/google.ts'

const STATE_TTL_MS = 10 * 60 * 1000

function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { Location: to } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  if (!state) return new Response('Missing state', { status: 400 })

  const db = adminClient()
  const { data: row } = await db
    .from('health_oauth_states')
    .select('user_id, return_to, created_at')
    .eq('state', state)
    .maybeSingle()
  // One-time use
  await db.from('health_oauth_states').delete().eq('state', state)

  if (!row) return new Response('Unknown or used state', { status: 400 })
  const back = (result: 'connected' | 'error') => redirect(`${row.return_to}/app?health=${result}`)

  if (Date.now() - Date.parse(row.created_at) > STATE_TTL_MS) return back('error')
  if (url.searchParams.get('error') || !code) return back('error')

  try {
    const tokens = await exchangeCode(code)
    const { data: existing } = await db
      .from('health_connections')
      .select('refresh_token')
      .eq('user_id', row.user_id)
      .maybeSingle()
    const refreshToken = tokens.refresh_token ?? existing?.refresh_token
    if (!refreshToken) return back('error')

    const { error } = await db.from('health_connections').upsert({
      user_id: row.user_id,
      refresh_token: refreshToken,
      access_token: tokens.access_token,
      access_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope ? tokens.scope.split(' ') : HEALTH_SCOPES,
      status: 'connected',
    })
    if (error) return back('error')
    return back('connected')
  } catch {
    return back('error')
  }
})
