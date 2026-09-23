import { describe, expect, it } from 'vitest'
import { firstName, personal } from './personal'

describe('firstName', () => {
  it('takes the first word of the display name', () => {
    expect(firstName('Andy Marcello')).toBe('Andy')
    expect(firstName('Andy')).toBe('Andy')
  })

  it('keeps the name exactly as typed', () => {
    // Capitalising would mangle names people write deliberately
    expect(firstName('andy')).toBe('andy')
    expect(firstName('DJ Khaled')).toBe('DJ')
  })

  it('trims surrounding and repeated whitespace', () => {
    expect(firstName('   Andy   Marcello  ')).toBe('Andy')
  })

  it('returns null when there is nothing usable', () => {
    expect(firstName(null)).toBeNull()
    expect(firstName(undefined)).toBeNull()
    expect(firstName('')).toBeNull()
    expect(firstName('    ')).toBeNull()
  })

  it('skips something too long to be a first name, like a pasted email prefix', () => {
    expect(firstName('averyveryverylongusernamefromanemail')).toBeNull()
  })
})

describe('personal', () => {
  it('uses the named form when there is a name', () => {
    expect(personal('Andy', (n) => `${n}, rest day today?`, 'Rest day today?')).toBe('Andy, rest day today?')
  })

  it('falls back cleanly instead of printing a blank', () => {
    expect(personal(null, (n) => `${n}, rest day today?`, 'Rest day today?')).toBe('Rest day today?')
  })
})
