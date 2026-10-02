import { useEffect, useRef, useState } from 'react'
import { easeOut, prefersReducedMotion, roundTo } from '../lib/motion'

type Options = { durationMs?: number; decimals?: number; enabled?: boolean }

/** Counts 0 → target once on mount. Later target changes jump straight to the new value. */
export function useCountUp(
  target: number,
  { durationMs = 900, decimals = 0, enabled = true }: Options = {},
): number {
  // Decided once: a hero number animates on arrival, never on later updates
  const [animating, setAnimating] = useState(() => enabled && !prefersReducedMotion())
  const [current, setCurrent] = useState(0)

  // Refs so a mid-flight target change lands on the new value without restarting
  const targetRef = useRef(target)
  const decimalsRef = useRef(decimals)
  useEffect(() => {
    targetRef.current = target
    decimalsRef.current = decimals
  })

  useEffect(() => {
    if (!animating) return
    let raf = 0
    let start = 0
    const tick = (now: number) => {
      if (!start) start = now
      const t = Math.min(1, (now - start) / durationMs)
      setCurrent(roundTo(targetRef.current * easeOut(t), decimalsRef.current))
      if (t < 1) raf = requestAnimationFrame(tick)
      else setAnimating(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animating, durationMs])

  return animating ? current : target
}
