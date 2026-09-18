// Web Push delivery (RFC 8291 / 8292).
//
// `web-push` is used only to build the request — VAPID JWT, encrypted body, headers —
// and the send itself goes out over native fetch. That keeps us off Deno's node:https
// compatibility layer while still using the well-tested crypto implementation.

import webpush from 'npm:web-push@3.6.7'

export type PushPayload = {
  title: string
  body: string
  /** Collapses a repeat of the same kind instead of stacking banners. */
  tag?: string
  url?: string
}

export type StoredSubscription = {
  endpoint: string
  p256dh: string
  auth: string
}

export type SendResult =
  | { ok: true }
  | { ok: false; status: number; gone: boolean; detail: string }

const TTL_SECONDS = 12 * 60 * 60

let vapidReady = false

function configureVapid(): void {
  if (vapidReady) return
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT')
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidReady = true
}

export async function sendPush(sub: StoredSubscription, payload: PushPayload): Promise<SendResult> {
  configureVapid()

  let request: { endpoint: string; headers: Record<string, string>; body: Uint8Array }
  try {
    const details = webpush.generateRequestDetails(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: TTL_SECONDS, contentEncoding: 'aes128gcm' },
    )
    const headers = { ...(details.headers as Record<string, string>) }
    // fetch sets this itself; passing it through can trip Deno's header checks
    delete headers['Content-Length']
    request = { endpoint: details.endpoint, headers, body: new Uint8Array(details.body) }
  } catch (e) {
    // Malformed keys on the stored row can never succeed — treat as gone so it's pruned
    return { ok: false, status: 0, gone: true, detail: `encrypt failed: ${(e as Error).message}` }
  }

  let res: Response
  try {
    res = await fetch(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    })
  } catch (e) {
    return { ok: false, status: 0, gone: false, detail: (e as Error).message }
  }

  if (res.ok) {
    await res.body?.cancel()
    return { ok: true }
  }

  const detail = (await res.text().catch(() => '')).slice(0, 200)
  // 404/410 mean the browser threw the subscription away: stop pushing to it.
  return { ok: false, status: res.status, gone: res.status === 404 || res.status === 410, detail }
}
