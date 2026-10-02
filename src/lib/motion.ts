// Shared motion helpers for JS-driven animation (count-ups, gauge sweeps).

/** CSS cubic-bezier(x1, y1, x2, y2) as a function of progress t ∈ [0, 1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx

  return (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    // Newton first (fast), bisection as a fallback when the slope is near zero
    let s = t
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - t
      if (Math.abs(err) < 1e-6) return sampleY(s)
      const d = slopeX(s)
      if (Math.abs(d) < 1e-6) break
      s -= err / d
    }
    let lo = 0
    let hi = 1
    s = t
    while (lo < hi) {
      const x = sampleX(s)
      if (Math.abs(x - t) < 1e-6) break
      if (t > x) lo = s
      else hi = s
      s = (hi - lo) / 2 + lo
      if (hi - lo < 1e-7) break
    }
    return sampleY(s)
  }
}

/** Matches --ease-out in tokens.css, so JS and CSS motion feel the same. */
export const easeOut = cubicBezier(0.23, 1, 0.32, 1)

/**
 * Fixed-decimal number string (the default CountUp format). Always a "." decimal point, so it
 * matches the toFixed text used elsewhere; whole numbers from 1,000 up get thousands commas.
 */
export function formatFixed(n: number, decimals = 0): string {
  if (decimals === 0 && Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return n.toFixed(decimals)
}

/** Round to a number of decimals without producing "1e-7"-style noise. */
export function roundTo(n: number, decimals = 0): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f || 0 // `|| 0` turns -0 into 0
}

/** True when the user asked for less motion (or there is no window to ask). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
