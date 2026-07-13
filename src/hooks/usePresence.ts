import { useEffect, useState } from 'react'

/**
 * Keep a component mounted through its exit animation.
 * open=true → mount then reveal; open=false → hide then unmount after durationMs.
 */
export function usePresence(open: boolean, durationMs = 360) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Next frame so CSS can transition from hidden → shown
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
      return () => cancelAnimationFrame(id)
    }

    setVisible(false)
    const t = window.setTimeout(() => setMounted(false), durationMs)
    return () => window.clearTimeout(t)
  }, [open, durationMs])

  return { mounted, visible }
}
