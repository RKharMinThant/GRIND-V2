// Loads the caller's Google connection and returns a fresh access token (refreshing when needed).
// Shared by health-data and health-body.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json } from './cors.ts'
import { ExpiredGrantError, refreshAccessToken } from './google.ts'

export async function getAccessToken(req: Request, db: SupabaseClient, userId: string): Promise<string | Response> {
  const { data: conn } = await db
    .from('health_connections')
    .select('refresh_token, access_token, access_expires_at, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (!conn) return json(req, { error: 'not_connected' }, 404)
  if (conn.status === 'expired') return json(req, { error: 'expired' }, 409)

  if (conn.access_token && conn.access_expires_at && Date.parse(conn.access_expires_at) > Date.now() + 60_000) {
    return conn.access_token as string
  }

  try {
    const t = await refreshAccessToken(conn.refresh_token)
    await db
      .from('health_connections')
      .update({
        access_token: t.access_token,
        access_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
      })
      .eq('user_id', userId)
    return t.access_token
  } catch (e) {
    if (e instanceof ExpiredGrantError) {
      await db.from('health_connections').update({ status: 'expired' }).eq('user_id', userId)
      return json(req, { error: 'expired' }, 409)
    }
    return json(req, { error: 'token_refresh_failed', detail: (e as Error).message }, 502)
  }
}

/** Force a token refresh on the next call (Google rejected the current one). */
export async function invalidateAccessToken(db: SupabaseClient, userId: string): Promise<void> {
  await db.from('health_connections').update({ access_expires_at: null }).eq('user_id', userId)
}
