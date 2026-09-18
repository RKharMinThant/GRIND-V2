import { describe, expect, it } from 'vitest'
import { isSafePushEndpoint } from './pushEndpoint'

describe('isSafePushEndpoint', () => {
  it('accepts the real push services', () => {
    expect(isSafePushEndpoint('https://web.push.apple.com/QPr4x...')).toBe(true)
    expect(isSafePushEndpoint('https://fcm.googleapis.com/fcm/send/abc123')).toBe(true)
    expect(isSafePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/gAAA')).toBe(true)
  })

  it('rejects plaintext http', () => {
    expect(isSafePushEndpoint('http://web.push.apple.com/abc')).toBe(false)
  })

  it('rejects anything that is not a URL', () => {
    expect(isSafePushEndpoint('')).toBe(false)
    expect(isSafePushEndpoint('not a url')).toBe(false)
    expect(isSafePushEndpoint('javascript:alert(1)')).toBe(false)
  })

  it('rejects loopback and link-local hosts', () => {
    // A stolen login must not be able to point the sender at our own network
    expect(isSafePushEndpoint('https://localhost/push')).toBe(false)
    expect(isSafePushEndpoint('https://127.0.0.1/push')).toBe(false)
    expect(isSafePushEndpoint('https://[::1]/push')).toBe(false)
    expect(isSafePushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false)
  })

  it('rejects private network ranges', () => {
    expect(isSafePushEndpoint('https://10.0.0.5/push')).toBe(false)
    expect(isSafePushEndpoint('https://192.168.1.10/push')).toBe(false)
    expect(isSafePushEndpoint('https://172.16.0.1/push')).toBe(false)
    expect(isSafePushEndpoint('https://172.31.255.254/push')).toBe(false)
    // 172.32 is public — the mask is /12, not /8
    expect(isSafePushEndpoint('https://172.32.0.1/push')).toBe(true)
  })

  it('rejects a bare hostname with no public domain', () => {
    expect(isSafePushEndpoint('https://intranet/push')).toBe(false)
  })

  it('rejects an absurdly long endpoint', () => {
    expect(isSafePushEndpoint(`https://web.push.apple.com/${'a'.repeat(2000)}`)).toBe(false)
  })
})
