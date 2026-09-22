import { describe, expect, it } from 'vitest'
import {
  derSignatureToRaw,
  parseSignatureHeader,
  tinkKeysetPublicKeys,
  verifyWebhookSignature,
} from './googleSignature'

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

/** WebCrypto emits raw r||s; Google sends DER, so the fixtures have to convert back. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const trim = (v: Uint8Array) => {
    let i = 0
    while (i < v.length - 1 && v[i] === 0) i++
    const out = v.slice(i)
    // DER integers are signed: a leading high bit needs a 0x00 byte
    return out[0] & 0x80 ? Uint8Array.from([0, ...out]) : out
  }
  const r = trim(raw.slice(0, 32))
  const s = trim(raw.slice(32))
  const body = Uint8Array.from([0x02, r.length, ...r, 0x02, s.length, ...s])
  return Uint8Array.from([0x30, body.length, ...body])
}

/** A Tink EcdsaPublicKey proto: field 1 varint version, field 3 bytes x, field 4 bytes y. */
function tinkKeyValue(x: Uint8Array, y: Uint8Array): Uint8Array {
  return Uint8Array.from([0x08, 0x00, 0x1a, x.length, ...x, 0x22, y.length, ...y])
}

async function fixture() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const point = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
  const x = point.slice(1, 33)
  const y = point.slice(33, 65)
  const keyId = 1234567890

  const sign = async (body: string) => {
    const raw = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(body)),
    )
    const der = rawToDer(raw)
    // 5-byte Tink prefix: version byte + big-endian key id
    const prefix = Uint8Array.from([0x01, (keyId >>> 24) & 255, (keyId >>> 16) & 255, (keyId >>> 8) & 255, keyId & 255])
    return b64(Uint8Array.from([...prefix, ...der]))
  }

  const keyset = {
    primaryKeyId: keyId,
    key: [{ keyData: { typeUrl: 'type.googleapis.com/google.crypto.tink.EcdsaPublicKey', value: b64(tinkKeyValue(x, y)) }, keyId }],
  }
  return { sign, keyset, keyId }
}

describe('parseSignatureHeader', () => {
  it('splits the 5-byte Tink prefix from the DER signature', () => {
    const der = Uint8Array.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02])
    const header = b64(Uint8Array.from([0x01, 0x00, 0x00, 0x30, 0x39, ...der]))
    const parsed = parseSignatureHeader(header)
    expect(parsed?.keyId).toBe(0x3039)
    expect(Array.from(parsed!.der)).toEqual(Array.from(der))
  })

  it('returns null for junk rather than throwing', () => {
    expect(parseSignatureHeader('')).toBeNull()
    expect(parseSignatureHeader('not base64 !!!')).toBeNull()
    // Too short to contain a prefix plus a signature
    expect(parseSignatureHeader(b64(Uint8Array.from([1, 2, 3])))).toBeNull()
  })
})

describe('derSignatureToRaw', () => {
  it('produces 64 bytes with both halves left-padded', () => {
    // r = 0x01, s = 0x02 — both must land in the last byte of their 32-byte half
    const der = Uint8Array.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02])
    const raw = derSignatureToRaw(der)
    expect(raw).toHaveLength(64)
    expect(raw[31]).toBe(1)
    expect(raw[63]).toBe(2)
    expect(raw[0]).toBe(0)
  })

  it('strips the sign byte DER adds to a high-bit value', () => {
    const r = Uint8Array.from([0x00, 0xff, ...new Array(31).fill(0x11)])
    const der = Uint8Array.from([0x30, r.length + 5, 0x02, r.length, ...r, 0x02, 0x01, 0x07])
    const raw = derSignatureToRaw(der)
    expect(raw).toHaveLength(64)
    expect(raw[0]).toBe(0xff)
    expect(raw[63]).toBe(7)
  })

  it('rejects a malformed structure', () => {
    expect(() => derSignatureToRaw(Uint8Array.from([0x31, 0x00]))).toThrow()
  })
})

describe('tinkKeysetPublicKeys', () => {
  it('extracts x and y from the protobuf key material', async () => {
    const { keyset, keyId } = await fixture()
    const keys = tinkKeysetPublicKeys(keyset)
    const point = keys.get(keyId)
    expect(point).toBeDefined()
    // Uncompressed P-256 point
    expect(point).toHaveLength(65)
    expect(point![0]).toBe(4)
  })

  it('ignores a keyset it cannot parse instead of throwing', () => {
    expect(tinkKeysetPublicKeys({ key: [{ keyId: 1, keyData: { value: 'zzz' } }] }).size).toBe(0)
    expect(tinkKeysetPublicKeys({}).size).toBe(0)
    expect(tinkKeysetPublicKeys(null).size).toBe(0)
  })
})

describe('verifyWebhookSignature', () => {
  it('accepts a genuine signature over the exact body', async () => {
    const { sign, keyset } = await fixture()
    const body = JSON.stringify({ data: { healthUserId: '111', dataType: 'exercise' } })
    expect(await verifyWebhookSignature(body, await sign(body), tinkKeysetPublicKeys(keyset))).toBe(true)
  })

  it('rejects a body that was altered after signing', async () => {
    const { sign, keyset } = await fixture()
    const header = await sign(JSON.stringify({ data: { healthUserId: '111' } }))
    const tampered = JSON.stringify({ data: { healthUserId: '222' } })
    expect(await verifyWebhookSignature(tampered, header, tinkKeysetPublicKeys(keyset))).toBe(false)
  })

  it('rejects a signature from a different key', async () => {
    const a = await fixture()
    const b = await fixture()
    const body = '{"data":{}}'
    // b's signature carries a's key id only if we force it; here the id simply misses
    expect(await verifyWebhookSignature(body, await b.sign(body), tinkKeysetPublicKeys(a.keyset))).toBe(false)
  })

  it('rejects a missing or malformed header', async () => {
    const { keyset } = await fixture()
    const keys = tinkKeysetPublicKeys(keyset)
    expect(await verifyWebhookSignature('{}', '', keys)).toBe(false)
    expect(await verifyWebhookSignature('{}', 'garbage', keys)).toBe(false)
  })

  it('rejects everything when the keyset is empty', async () => {
    const { sign } = await fixture()
    const body = '{"data":{}}'
    expect(await verifyWebhookSignature(body, await sign(body), new Map())).toBe(false)
  })
})
