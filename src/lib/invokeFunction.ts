import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Shape of the JSON our Edge Functions and the Supabase gateway return on failure. */
export type FunctionErrorPayload = {
  error?: string
  detail?: string
  message?: string
  code?: string
} | null

/** True when the failure is only a stale Supabase login: refreshing and retrying fixes it. */
export function isAuthFailure(status: number, payload: FunctionErrorPayload): boolean {
  if (status !== 401) return false
  const code = payload?.code ?? ''
  const message = payload?.message ?? payload?.error ?? ''
  return /JWT|unauthorized|token/i.test(`${code} ${message}`) || !payload
}

export type InvokeOptions = {
  /** Shown when the request never reached the function — offline, DNS, or a blocked origin. */
  offline: string
  /** Readable message for an HTTP failure the caller doesn't special-case. */
  describe: (status: number, payload: FunctionErrorPayload) => string
  /** Turn a status into a domain-specific error before `describe` is consulted. */
  map?: (status: number, payload: FunctionErrorPayload) => Error | null
}

/**
 * Calls an Edge Function with the current Supabase login.
 *
 * Phones suspend the app, so its access token is often stale on resume and the
 * gateway answers 401 ("Invalid JWT"). Refresh once and retry before surfacing that.
 */
export async function invokeFunction<T>(
  name: string,
  body: unknown,
  options: InvokeOptions,
  isRetry = false,
): Promise<T> {
  // Returns a fresh token when the current one is expiring
  await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} })
  if (!error) return data as T

  if (error instanceof FunctionsHttpError) {
    const status = error.context.status
    const payload = (await error.context.json().catch(() => null)) as FunctionErrorPayload

    const mapped = options.map?.(status, payload)
    if (mapped) throw mapped

    if (!isRetry && isAuthFailure(status, payload)) {
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError) return invokeFunction<T>(name, body, options, true)
      throw new Error('Your session expired — sign in again')
    }
    throw new Error(options.describe(status, payload))
  }
  throw new Error(options.offline)
}
