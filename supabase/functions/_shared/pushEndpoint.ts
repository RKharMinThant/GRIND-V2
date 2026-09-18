// Validation for the push endpoint a client asks us to store.
//
// The sender POSTs to whatever endpoint is on the row, so an attacker holding a
// valid login could otherwise register an internal address and use the function
// as a blind request proxy. Only public HTTPS hosts get stored.

const MAX_ENDPOINT_LENGTH = 1000

/** 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 0.0.0.0/8 */
function isPrivateIPv4(host: string): boolean {
  const parts = host.split('.')
  if (parts.length !== 4) return false
  const [a, b] = parts.map(Number)
  if (parts.some((p) => !/^\d{1,3}$/.test(p)) || [a, b].some(Number.isNaN)) return false
  if (a === 127 || a === 10 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

export function isSafePushEndpoint(endpoint: string): boolean {
  if (!endpoint || endpoint.length > MAX_ENDPOINT_LENGTH) return false

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false

  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  // URL keeps IPv6 literals in brackets; ::1 and unique-local fc00::/7 are out
  if (host.startsWith('[')) {
    const inner = host.slice(1, -1)
    return !(inner === '::1' || inner.startsWith('fc') || inner.startsWith('fd') || inner.startsWith('fe80'))
  }
  if (isPrivateIPv4(host)) return false
  // A name with no dot is an intranet host, never a public push service
  return host.includes('.')
}
