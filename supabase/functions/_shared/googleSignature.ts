// Verifies the ECDSA signature Google puts on every webhook notification.
//
// Without this the endpoint is unauthenticated in practice: it has to be publicly
// reachable, so the shared Authorization secret alone only proves the caller has
// seen that secret. The signature proves the payload came from Google unmodified.
//
// Google signs with Tink, so the wire format needs unpacking:
//   header      = base64( 0x01 ‖ keyId[4] ‖ DER signature )
//   keyset JSON = { key: [ { keyId, keyData: { value: base64 EcdsaPublicKey proto } } ] }
// WebCrypto wants a raw r‖s signature and an uncompressed point, hence the parsing below.

const KEYSET_URL = 'https://www.gstatic.com/googlehealthapi/webhooks/webhooks_public_keyset.json'
/** Tink prefix: one version byte plus a 4-byte big-endian key id. */
const TINK_PREFIX_LENGTH = 5
const COORD_LENGTH = 32

/** Values are ArrayBuffer-backed so WebCrypto accepts them as BufferSource. */
export type PublicKeys = Map<number, Uint8Array<ArrayBuffer>>

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

export function parseSignatureHeader(header: string): { keyId: number; der: Uint8Array } | null {
  const bytes = header ? decodeBase64(header.trim()) : null
  if (!bytes || bytes.length <= TINK_PREFIX_LENGTH) return null
  const keyId = (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]
  return { keyId: keyId >>> 0, der: bytes.slice(TINK_PREFIX_LENGTH) }
}

/** Big-endian integer → fixed 32 bytes, dropping DER's sign byte or padding a short value. */
function toCoordinate(value: Uint8Array): Uint8Array<ArrayBuffer> {
  let start = 0
  while (start < value.length - 1 && value[start] === 0) start++
  const trimmed = value.slice(start)
  if (trimmed.length > COORD_LENGTH) throw new Error('value too long for P-256')
  const out = new Uint8Array(new ArrayBuffer(COORD_LENGTH))
  out.set(trimmed, COORD_LENGTH - trimmed.length)
  return out
}

/** DER SEQUENCE(INTEGER r, INTEGER s) → the raw r‖s pair WebCrypto verifies against. */
export function derSignatureToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error('signature is not a DER sequence')
  // Skip the sequence length (short form, or long form for lengths above 127)
  let i = 1
  if (der[i] & 0x80) i += 1 + (der[i] & 0x7f)
  else i += 1

  const readInt = (): Uint8Array => {
    if (der[i] !== 0x02) throw new Error('expected a DER integer')
    const length = der[i + 1]
    const value = der.slice(i + 2, i + 2 + length)
    if (value.length !== length) throw new Error('truncated DER integer')
    i += 2 + length
    return value
  }

  const r = toCoordinate(readInt())
  const s = toCoordinate(readInt())
  const raw = new Uint8Array(new ArrayBuffer(COORD_LENGTH * 2))
  raw.set(r, 0)
  raw.set(s, COORD_LENGTH)
  return raw
}

/** Minimal protobuf reader: returns the length-delimited fields we care about. */
function lengthDelimitedFields(buf: Uint8Array): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>()
  let i = 0
  const varint = (): number => {
    let value = 0
    let shift = 0
    while (i < buf.length) {
      const byte = buf[i++]
      value |= (byte & 0x7f) << shift
      if ((byte & 0x80) === 0) break
      shift += 7
    }
    return value
  }

  while (i < buf.length) {
    const tag = varint()
    const field = tag >>> 3
    switch (tag & 7) {
      case 0:
        varint()
        break
      case 1:
        i += 8
        break
      case 2: {
        const length = varint()
        out.set(field, buf.slice(i, i + length))
        i += length
        break
      }
      case 5:
        i += 4
        break
      default:
        return out // unknown wire type: stop rather than misread the rest
    }
  }
  return out
}

/**
 * keyId → uncompressed P-256 point. Anything unparseable is skipped rather than
 * thrown, so one odd key in a rotated keyset can't break verification for the rest.
 */
export function tinkKeysetPublicKeys(keyset: unknown): PublicKeys {
  const keys: PublicKeys = new Map()
  const list = (keyset as { key?: unknown[] } | null)?.key
  if (!Array.isArray(list)) return keys

  for (const entry of list) {
    try {
      const record = entry as { keyId?: number; keyData?: { value?: string } }
      const value = record?.keyData?.value
      if (typeof record?.keyId !== 'number' || !value) continue
      const proto = decodeBase64(value)
      if (!proto) continue
      // EcdsaPublicKey: field 3 = x, field 4 = y
      const fields = lengthDelimitedFields(proto)
      const x = fields.get(3)
      const y = fields.get(4)
      if (!x || !y) continue
      // Uncompressed point: 0x04 ‖ X ‖ Y
      const point = new Uint8Array(new ArrayBuffer(1 + COORD_LENGTH * 2))
      point[0] = 4
      point.set(toCoordinate(x), 1)
      point.set(toCoordinate(y), 1 + COORD_LENGTH)
      keys.set(record.keyId, point)
    } catch {
      continue
    }
  }
  return keys
}

export async function verifyWebhookSignature(
  rawBody: string,
  header: string,
  keys: PublicKeys,
): Promise<boolean> {
  const parsed = parseSignatureHeader(header)
  if (!parsed) return false
  const point = keys.get(parsed.keyId)
  if (!point) return false

  try {
    const raw = derSignatureToRaw(parsed.der)
    const key = await crypto.subtle.importKey('raw', point, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'verify',
    ])
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      raw,
      new TextEncoder().encode(rawBody),
    )
  } catch {
    return false
  }
}

let cached: { keys: PublicKeys; at: number } | null = null
const KEYSET_TTL_MS = 6 * 60 * 60 * 1000

/** Google rotates these, so refetch periodically but keep a stale copy on failure. */
export async function webhookPublicKeys(): Promise<PublicKeys> {
  if (cached && Date.now() - cached.at < KEYSET_TTL_MS) return cached.keys
  try {
    const res = await fetch(KEYSET_URL)
    if (!res.ok) throw new Error(`keyset ${res.status}`)
    const keys = tinkKeysetPublicKeys(await res.json())
    if (keys.size === 0) throw new Error('keyset had no usable keys')
    cached = { keys, at: Date.now() }
    return keys
  } catch (e) {
    console.error('webhook keyset fetch failed', (e as Error).message)
    return cached?.keys ?? new Map()
  }
}
