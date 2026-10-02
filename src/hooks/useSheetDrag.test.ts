import { describe, expect, it } from 'vitest'
import {
  blocksSheetDrag,
  inverseRubberBand,
  projectMomentum,
  rubberBand,
  sampleVelocity,
  shouldDismiss,
} from './useSheetDrag'

describe('projectMomentum', () => {
  it('projects with exponential deceleration (v/1000 · 0.998 / 0.002)', () => {
    expect(projectMomentum(1000)).toBeCloseTo(499, 5)
    expect(projectMomentum(0)).toBe(0)
    expect(projectMomentum(-500)).toBeCloseTo(-249.5, 5)
  })
})

describe('rubberBand', () => {
  it('resists more the further it is pulled and never passes the dimension', () => {
    const near = rubberBand(10, 100)
    const far = rubberBand(500, 100)
    expect(near).toBeGreaterThan(0)
    expect(near).toBeLessThan(10)
    expect(far).toBeLessThan(100)
    expect(rubberBand(1e9, 100)).toBeLessThan(100.0001)
    expect(rubberBand(-5, 100)).toBe(0)
  })

  it('inverse recovers the original overshoot', () => {
    for (const o of [1, 20, 120, 400]) {
      expect(inverseRubberBand(rubberBand(o, 96), 96)).toBeCloseTo(o, 4)
    }
  })
})

describe('shouldDismiss', () => {
  const h = 600
  it('snaps back on a short, slow drag', () => {
    expect(shouldDismiss(60, 0, h)).toBe(false)
    expect(shouldDismiss(100, 80, h)).toBe(false)
  })
  it('dismisses past ~25 % of the height', () => {
    expect(shouldDismiss(h * 0.26, 0, h)).toBe(true)
  })
  it('dismisses on a firm downward flick even when barely moved', () => {
    expect(shouldDismiss(20, 700, h)).toBe(true)
  })
  it('lets a firm upward flick win over distance', () => {
    expect(shouldDismiss(h * 0.4, -600, h)).toBe(false)
  })
  it('uses the projected rest position for medium velocities', () => {
    expect(shouldDismiss(h * 0.2, 450, h)).toBe(true)
  })
  it('never dismisses when pulled above the top', () => {
    expect(shouldDismiss(-40, 0, h)).toBe(false)
  })
})

describe('sampleVelocity', () => {
  it('measures px/s over the last 100 ms', () => {
    const samples = [
      { t: 0, y: 0 },
      { t: 950, y: 10 },
      { t: 1000, y: 40 },
    ]
    expect(sampleVelocity(samples, 1000)).toBeCloseTo(((40 - 10) / 50) * 1000, 5)
  })
  it('is zero when the finger rested before release', () => {
    expect(sampleVelocity([{ t: 0, y: 0 }, { t: 40, y: 50 }], 400)).toBe(0)
  })
})

describe('blocksSheetDrag', () => {
  const plain = { tag: 'DIV', scrollTop: 0, scrollHeight: 100, clientHeight: 100 }
  it('lets plain content drag the sheet', () => {
    expect(blocksSheetDrag([{ ...plain, tag: 'P' }, plain])).toBe(false)
  })
  it('keeps text fields for the field', () => {
    expect(blocksSheetDrag([{ ...plain, tag: 'TEXTAREA' }, plain])).toBe(true)
    expect(blocksSheetDrag([{ ...plain, tag: 'input' }])).toBe(true)
  })
  it('keeps an inner scroller that is scrolled down, but not one at its top', () => {
    expect(blocksSheetDrag([plain, { ...plain, scrollHeight: 300, scrollTop: 40 }])).toBe(true)
    expect(blocksSheetDrag([plain, { ...plain, scrollHeight: 300, scrollTop: 0 }])).toBe(false)
  })
})
