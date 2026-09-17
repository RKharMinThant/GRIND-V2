import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json } from './cors.ts'

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Verifies the caller's Supabase JWT. Returns the user id, or a 401 response. */
export async function requireUser(req: Request): Promise<{ id: string } | Response> {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return json(req, { error: 'unauthorized' }, 401)
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return json(req, { error: 'unauthorized' }, 401)
  return { id: data.user.id }
}
