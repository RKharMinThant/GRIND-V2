import { useEffect, useRef, useState, type ReactNode } from 'react'

type Dir = 'forward' | 'back'

type Layer = {
  key: string
  node: ReactNode
  dir: Dir
  mode: 'enter' | 'exit'
}

type Props = {
  pageKey: string
  /** Numeric order for direction (home=0, history=1, calendar=2) */
  tabIndex: number
  children: ReactNode
}

/**
 * Crossfade + directional slide when switching main sections.
 * Keeps the outgoing page mounted briefly so exit can play.
 */
export function AnimatedPage({ pageKey, tabIndex, children }: Props) {
  const nav = useRef({ key: pageKey, index: tabIndex })
  const childrenRef = useRef(children)
  childrenRef.current = children

  const [layers, setLayers] = useState<Layer[]>([
    { key: pageKey, node: children, dir: 'forward', mode: 'enter' },
  ])

  // Refresh active enter layer content when data updates (no re-animation)
  useEffect(() => {
    setLayers((list) => {
      if (list.length !== 1) return list
      const only = list[0]
      if (only.key !== pageKey || only.mode !== 'enter') return list
      return [{ ...only, node: children }]
    })
  }, [children, pageKey])

  // Navigate between sections
  useEffect(() => {
    if (pageKey === nav.current.key) return

    const dir: Dir = tabIndex >= nav.current.index ? 'forward' : 'back'
    const outgoingKey = nav.current.key

    setLayers((list) => {
      const current = list.find((l) => l.key === outgoingKey && l.mode === 'enter')
      const outgoingNode = current?.node ?? childrenRef.current
      return [
        { key: outgoingKey, node: outgoingNode, dir, mode: 'exit' },
        { key: pageKey, node: childrenRef.current, dir, mode: 'enter' },
      ]
    })

    nav.current = { key: pageKey, index: tabIndex }

    // Match --dur-tab-in (420ms) + small buffer so exit can finish
    const t = window.setTimeout(() => {
      setLayers([
        {
          key: pageKey,
          node: childrenRef.current,
          dir,
          mode: 'enter',
        },
      ])
    }, 440)

    return () => window.clearTimeout(t)
  }, [pageKey, tabIndex])

  return (
    <div className="page-stage" aria-live="polite">
      {layers.map((layer) => (
        <div
          key={`${layer.key}-${layer.mode}`}
          className={`page-layer page-layer--${layer.mode} page-layer--${layer.dir}`}
        >
          {layer.node}
        </div>
      ))}
    </div>
  )
}
