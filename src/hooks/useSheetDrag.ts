import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

/* ── Value holder ────────────────────────────────────────────────────────────── */

/** A number with change subscribers: the sheet's translateY / fade, written to the DOM directly. */
export class SheetValue {
  private current: number
  private subs = new Set<() => void>()
  constructor(initial: number) {
    this.current = initial
  }
  get() {
    return this.current
  }
  set(next: number) {
    if (next === this.current) return
    this.current = next
    this.subs.forEach((fn) => fn())
  }
  on(fn: () => void) {
    this.subs.add(fn)
    return () => {
      this.subs.delete(fn)
    }
  }
}

/* ── Physics helpers (pure, unit-tested) ─────────────────────────────────────── */

/** Scroll-style deceleration used to project where a flick would come to rest. */
const DECELERATION = 0.998

/** Distance (px) a gesture released at `velocity` px/s would coast: v/1000 · d / (1 − d). */
export function projectMomentum(velocity: number, decelerationRate = DECELERATION): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/**
 * Resistance past a boundary: tracks the finger at first, then gives less and less
 * (never moves more than `dimension` px however far it is pulled).
 */
export function rubberBand(overshoot: number, dimension: number, constant = 0.55): number {
  const o = Math.max(0, overshoot)
  return (o * dimension * constant) / (dimension + constant * o)
}

/** Inverse of {@link rubberBand}, so a sheet grabbed mid-bounce resumes without a jump. */
export function inverseRubberBand(offset: number, dimension: number, constant = 0.55): number {
  const y = Math.min(Math.max(0, offset), dimension * 0.999)
  return (y * dimension) / (constant * (dimension - y))
}

/** How far a sheet may be pulled above its resting position. */
export const PULL_UP_LIMIT = 96

/** Dismiss thresholds, from the iOS feel: ~25 % of the height, or a firm downward flick. */
export const DISMISS_FRACTION = 0.25
export const DISMISS_VELOCITY = 500

/**
 * Release decision. `offset` is how far down the sheet is (px, ≥ 0 when pulled down),
 * `velocity` is the finger's vertical velocity in px/s (positive = downward).
 * A firm upward flick always wins (the user is putting it back); otherwise dismiss on a
 * downward flick, on a drag past a quarter of the height, or when the projected rest
 * position is past half the height.
 */
export function shouldDismiss(offset: number, velocity: number, height: number): boolean {
  if (height <= 0) return false
  if (velocity < -DISMISS_VELOCITY * 0.6) return false
  if (velocity > DISMISS_VELOCITY) return true
  if (offset > height * DISMISS_FRACTION) return true
  return offset + projectMomentum(velocity) > height * 0.5
}

/** Vertical velocity (px/s) over the last ~100 ms of pointer samples. */
export function sampleVelocity(samples: { t: number; y: number }[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= 100)
  if (recent.length < 2) return 0
  const first = recent[0]
  const last = recent[recent.length - 1]
  const dt = last.t - first.t
  if (dt <= 0) return 0
  return ((last.y - first.y) / dt) * 1000
}

/** The facts about one element that decide whether it owns a touch (see {@link blocksSheetDrag}). */
export type DragAncestor = {
  tag: string
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/**
 * True when a touch starting in this chain (target first, up to but excluding the sheet's scroll
 * container) belongs to the content: a text field, or an inner scroller that is scrolled down.
 */
export function blocksSheetDrag(chain: DragAncestor[]): boolean {
  return chain.some(
    (n) =>
      /^(textarea|input|select)$/i.test(n.tag) ||
      (n.scrollHeight > n.clientHeight && n.scrollTop > 0),
  )
}

function ancestorChain(target: EventTarget | null, container: HTMLElement): DragAncestor[] {
  const chain: DragAncestor[] = []
  let n = target instanceof Element ? target : null
  for (; n && n !== container; n = n.parentElement) {
    chain.push({
      tag: n.tagName,
      scrollTop: n.scrollTop,
      scrollHeight: n.scrollHeight,
      clientHeight: n.clientHeight,
    })
  }
  return chain
}

/* ── Hook ────────────────────────────────────────────────────────────────────── */

export type SheetRelease = {
  /** Where the sheet is right now (px from its resting position). */
  offset: number
  /** Finger velocity at release, px/s, positive = downward. */
  velocity: number
  height: number
}

type Options = {
  /** The sheet's translateY. The hook writes to it 1:1 while dragging. */
  y: SheetValue
  getHeight: () => number
  enabled: boolean
  /** The scrolling content. Touches that start here drag the sheet while it is scrolled to the top. */
  scrollRef: RefObject<HTMLElement | null>
  /** Called when a drag takes over, so any running animation can be stopped. */
  onGrab: () => void
  onRelease: (release: SheetRelease) => void
}

type Phase = 'idle' | 'pending' | 'drag'
const SLOP = 4

/**
 * Drag-to-dismiss for a bottom sheet.
 *  - Handle/header: pointer events with capture (mouse + touch), `touch-action: none` on the handle.
 *  - Content: touch events, only while the content is scrolled to the top and the finger moves down.
 * Movement is 1:1 from the point the sheet was grabbed at (also mid-animation); pulling above the
 * resting position rubber-bands.
 */
export function useSheetDrag({ y, getHeight, enabled, scrollRef, onGrab, onRelease }: Options) {
  const state = useRef({
    phase: 'idle' as Phase,
    pointerId: -1,
    startPointer: 0,
    startVirtual: 0,
    samples: [] as { t: number; y: number }[],
  })
  const latest = useRef({ enabled, onGrab, onRelease, getHeight })
  latest.current = { enabled, onGrab, onRelease, getHeight }

  const begin = useCallback(
    (pointerY: number, t: number) => {
      const s = state.current
      latest.current.onGrab()
      const current = y.get()
      s.startVirtual = current >= 0 ? current : -inverseRubberBand(-current, PULL_UP_LIMIT)
      s.phase = 'drag'
      s.samples = [{ t, y: pointerY }]
    },
    [y],
  )

  const move = useCallback(
    (pointerY: number, t: number) => {
      const s = state.current
      const raw = s.startVirtual + (pointerY - s.startPointer)
      y.set(raw >= 0 ? raw : -rubberBand(-raw, PULL_UP_LIMIT))
      s.samples.push({ t, y: pointerY })
      if (s.samples.length > 12) s.samples.shift()
    },
    [y],
  )

  const end = useCallback(
    (t: number) => {
      const s = state.current
      if (s.phase !== 'drag') {
        s.phase = 'idle'
        return
      }
      s.phase = 'idle'
      const velocity = sampleVelocity(s.samples, t)
      latest.current.onRelease({ offset: y.get(), velocity, height: latest.current.getHeight() })
    },
    [y],
  )

  /* Handle / header (pointer events) */
  const gripProps = useMemo(
    () => ({
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (!latest.current.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return
        const s = state.current
        if (s.phase !== 'idle') return
        s.phase = 'pending'
        s.pointerId = e.pointerId
        s.startPointer = e.clientY
      },
      onPointerMove(e: ReactPointerEvent<HTMLElement>) {
        const s = state.current
        if (e.pointerId !== s.pointerId) return
        if (e.buttons === 0 && s.phase !== 'idle') {
          // Released outside the element without us seeing it: finish instead of following the hover
          end(e.timeStamp)
          return
        }
        if (s.phase === 'pending') {
          if (Math.abs(e.clientY - s.startPointer) < SLOP) return
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* pointer already gone */
          }
          begin(s.startPointer, e.timeStamp)
        }
        if (s.phase === 'drag') move(e.clientY, e.timeStamp)
      },
      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        if (e.pointerId !== state.current.pointerId) return
        end(e.timeStamp)
      },
      onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
        if (e.pointerId !== state.current.pointerId) return
        end(e.timeStamp)
      },
      onLostPointerCapture(e: ReactPointerEvent<HTMLElement>) {
        if (e.pointerId !== state.current.pointerId) return
        end(e.timeStamp)
      },
    }),
    [begin, move, end],
  )

  /* Content (touch events — non-passive so a sheet drag can stop the scroll) */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let startY = 0
    let tracking = false

    const onStart = (e: TouchEvent) => {
      const s = state.current
      if (!latest.current.enabled || e.touches.length !== 1 || s.phase === 'drag') {
        tracking = false
        return
      }
      tracking = el.scrollTop <= 1 && !blocksSheetDrag(ancestorChain(e.target, el))
      startY = e.touches[0].clientY
      s.pointerId = -2
      s.startPointer = startY
    }
    const onMove = (e: TouchEvent) => {
      const s = state.current
      if (!tracking) return
      const touchY = e.touches[0].clientY
      if (s.phase !== 'drag') {
        const dy = touchY - startY
        if (dy < -SLOP) {
          tracking = false // scrolling content down: leave it to the browser
          return
        }
        if (el.scrollTop > 1) return
        // Claim a downward pull right away (even inside the slop) so iOS doesn't start rubber-banding first
        if (dy > 0 && e.cancelable) e.preventDefault()
        if (dy < SLOP) return
        s.phase = 'pending'
        begin(startY, e.timeStamp)
      }
      if (e.cancelable) e.preventDefault()
      move(touchY, e.timeStamp)
    }
    const onEnd = (e: TouchEvent) => {
      tracking = false
      if (state.current.phase === 'drag' && state.current.pointerId === -2) end(e.timeStamp)
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [scrollRef, begin, move, end])

  return { gripProps }
}
