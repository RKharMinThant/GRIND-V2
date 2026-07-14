import { useEffect, useState } from 'react'

/** 0–1 document scroll progress for marketing nav indicator. */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    function onScroll() {
      const el = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      if (max <= 0) {
        setProgress(0)
        return
      }
      setProgress(Math.min(1, Math.max(0, el.scrollTop / max)))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return progress
}
