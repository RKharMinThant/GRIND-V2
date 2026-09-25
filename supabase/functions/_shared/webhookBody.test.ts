import { describe, expect, it } from 'vitest'
import { parseWebhookBody } from './webhookBody'

const note = (healthUserId: string, dataType = 'exercise') => ({
  data: { version: '1', healthUserId, operation: 'UPSERT', dataType, intervals: [] },
})

describe('parseWebhookBody', () => {
  it('recognises the registration probe', () => {
    expect(parseWebhookBody('{"type":"verification"}')).toEqual({ kind: 'verification' })
  })

  it('accepts a single notification object', () => {
    const parsed = parseWebhookBody(JSON.stringify(note('111')))
    expect(parsed.kind).toBe('notifications')
    expect(parsed.kind === 'notifications' && parsed.items.map((n) => n.healthUserId)).toEqual(['111'])
  })

  it('accepts a batch — Google sends a top-level JSON array', () => {
    // The shape that was silently dropped: no `.data` on an array
    const parsed = parseWebhookBody(JSON.stringify([note('111'), note('222', 'steps')]))
    expect(parsed.kind).toBe('notifications')
    expect(parsed.kind === 'notifications' && parsed.items.map((n) => n.healthUserId)).toEqual(['111', '222'])
  })

  it('skips malformed entries inside a batch but keeps the good ones', () => {
    const parsed = parseWebhookBody(JSON.stringify([note('111'), { nope: true }, null, 5]))
    expect(parsed.kind === 'notifications' && parsed.items.map((n) => n.healthUserId)).toEqual(['111'])
  })

  it('treats junk as invalid rather than throwing', () => {
    expect(parseWebhookBody('not json').kind).toBe('invalid')
    expect(parseWebhookBody('').kind).toBe('invalid')
    expect(parseWebhookBody('{}').kind).toBe('invalid')
    expect(parseWebhookBody('[]').kind).toBe('invalid')
  })
})
