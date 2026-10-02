import { useLayoutEffect, useRef, useState } from 'react'

/** Content-box width of the referenced element, kept current by a ResizeObserver. 0 until measured. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Measure before paint so a chart never flashes at the wrong size
    setWidth(Math.floor(el.getBoundingClientRect().width))
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return [ref, width] as const
}
