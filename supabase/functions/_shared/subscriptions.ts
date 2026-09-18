// Loading, delivering to and pruning a user's push subscriptions.
// Shared by push-test (one user, on demand) and push-dispatch (everyone, on a schedule).

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { sendPush, type PushPayload, type StoredSubscription } from './webpush.ts'

/** Consecutive failures tolerated before a subscription is dropped. */
const MAX_FAILURES = 3

export type SubscriptionRow = StoredSubscription & {
  user_id: string
  time_zone: string
  failure_count: number
}

export async function userSubscriptions(
  db: SupabaseClient,
  userId: string,
): Promise<SubscriptionRow[]> {
  const { data } = await db
    .from('push_subscriptions')
    .select('endpoint, user_id, p256dh, auth, time_zone, failure_count')
    .eq('user_id', userId)
  return (data ?? []) as SubscriptionRow[]
}

export async function allSubscriptions(db: SupabaseClient): Promise<SubscriptionRow[]> {
  const { data } = await db
    .from('push_subscriptions')
    .select('endpoint, user_id, p256dh, auth, time_zone, failure_count')
    .order('created_at', { ascending: false })
  return (data ?? []) as SubscriptionRow[]
}

async function onSuccess(db: SupabaseClient, endpoint: string): Promise<void> {
  await db
    .from('push_subscriptions')
    .update({ failure_count: 0, last_used_at: new Date().toISOString() })
    .eq('endpoint', endpoint)
}

async function onFailure(
  db: SupabaseClient,
  row: SubscriptionRow,
  gone: boolean,
): Promise<void> {
  if (gone || row.failure_count + 1 >= MAX_FAILURES) {
    await db.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
    return
  }
  await db
    .from('push_subscriptions')
    .update({ failure_count: row.failure_count + 1 })
    .eq('endpoint', row.endpoint)
}

/**
 * Sends one payload to every device on the list, pruning any that are gone.
 * Returns how many actually accepted it — 0 means the user saw nothing.
 */
export async function deliver(
  db: SupabaseClient,
  rows: SubscriptionRow[],
  payload: PushPayload,
): Promise<number> {
  const results = await Promise.all(
    rows.map(async (row) => {
      const result = await sendPush(row, payload)
      if (result.ok) {
        await onSuccess(db, row.endpoint)
        return true
      }
      console.error('push failed', row.endpoint.slice(0, 40), result.status, result.detail)
      await onFailure(db, row, result.gone)
      return false
    }),
  )
  return results.filter(Boolean).length
}
