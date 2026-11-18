import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type AgentGrant = {
  /** OAuth client UUID, what revokeGrant needs */
  clientId: string
  name: string
  /** ISO timestamp, when the server gave one */
  grantedAt: string | null
}

/** `unavailable` = the OAuth server isn't enabled; the UI hides the list rather than showing an error. */
export type AgentGrantsStatus = 'loading' | 'ready' | 'error' | 'unavailable'

/** Errors that mean "feature off" rather than "something broke". */
function isNotEnabled(err: { status?: number; code?: string; message?: string }): boolean {
  if ([404, 501].includes(err.status ?? 0)) return true
  return /not enabled|disabled/i.test(`${err.code ?? ''} ${err.message ?? ''}`)
}

/**
 * Agents the user has authorised through Supabase's OAuth server.
 * `override` skips the network entirely (design preview, no session).
 */
export function useAgentGrants(override?: AgentGrant[]) {
  const [grants, setGrants] = useState<AgentGrant[]>(override ?? [])
  const [status, setStatus] = useState<AgentGrantsStatus>(override ? 'ready' : 'loading')
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (override) {
      setGrants(override)
      setStatus('ready')
      return
    }
    // Older supabase-js builds have no oauth namespace
    const api = (supabase.auth as { oauth?: typeof supabase.auth.oauth }).oauth
    if (!api?.listGrants) {
      setStatus('unavailable')
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const { data, error: err } = await api.listGrants()
      if (err) {
        if (isNotEnabled(err)) setStatus('unavailable')
        else {
          setError(err.message)
          setStatus('error')
        }
        return
      }
      setGrants(
        (data ?? []).map((g) => ({
          clientId: g.client.id,
          name: g.client.name || 'Unnamed app',
          grantedAt: g.granted_at || null,
        })),
      )
      setStatus('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load connected agents')
      setStatus('error')
    }
  }, [override])

  useEffect(() => {
    void load()
  }, [load])

  const revoke = useCallback(
    async (grant: AgentGrant) => {
      setError(null)
      if (override) {
        setGrants((prev) => prev.filter((g) => g.clientId !== grant.clientId))
        return
      }
      setRevokingId(grant.clientId)
      try {
        const { error: err } = await supabase.auth.oauth.revokeGrant({ clientId: grant.clientId })
        if (err) throw err
        await load()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not disconnect')
        setStatus('ready')
      } finally {
        setRevokingId(null)
      }
    },
    [override, load],
  )

  return { grants, status, error, revokingId, refresh: load, revoke }
}
