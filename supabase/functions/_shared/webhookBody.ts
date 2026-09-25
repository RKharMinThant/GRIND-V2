// Parses what Google Health POSTs to the webhook.
//
// Three shapes arrive at the same URL:
//   {"type":"verification"}         — the registration handshake
//   {"data": {...}}                  — one notification
//   [{"data": {...}}, {"data": ...}] — a batch, which is how Google usually sends them
// ("the Google Health API batches messages together"). The array form was once read as
// "no data" and dropped without a trace, so every shape is handled explicitly here.

export type WebhookNotification = {
  healthUserId?: string
  dataType?: string
  operation?: string
  intervals?: { physicalTimeInterval?: { startTime?: string; endTime?: string } }[]
}

export type WebhookBody =
  | { kind: 'verification' }
  | { kind: 'notifications'; items: WebhookNotification[] }
  | { kind: 'invalid' }

function notificationOf(entry: unknown): WebhookNotification | null {
  const data = (entry as { data?: unknown } | null)?.data
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as WebhookNotification) : null
}

export function parseWebhookBody(raw: string): WebhookBody {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return { kind: 'invalid' }
  }

  if ((body as { type?: unknown } | null)?.type === 'verification') return { kind: 'verification' }

  const entries = Array.isArray(body) ? body : [body]
  const items = entries.map(notificationOf).filter((n): n is WebhookNotification => n !== null)
  return items.length ? { kind: 'notifications', items } : { kind: 'invalid' }
}
