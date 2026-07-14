import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  /** Stagger delay in ms when multiple reveals enter together */
  delayMs?: number
  as?: 'div' | 'section' | 'li' | 'header'
}

/**
 * Opacity + small translateY on enter (≤280ms ease-out).
 * Reduced motion: show immediately, no transform.
 */
export function Reveal({ children, className = '', delayMs = 0, as: Tag = 'div' }: Props) {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setVisible(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`mkt-reveal ${visible ? 'is-visible' : ''} ${className}`.trim()}
      style={delayMs ? ({ ['--reveal-delay' as string]: `${delayMs}ms` } as object) : undefined}
    >
      {children}
    </Tag>
  )
}
