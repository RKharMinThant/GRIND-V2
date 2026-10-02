import { useEffect, useState } from 'react'

type Props = {
  message: string | null
  variant?: 'ok' | 'error'
  onDone: () => void
}

/** Floating capsule that drops in from the top. */
export function Toast({ message, variant = 'ok', onDone }: Props) {
  // Keep the last message mounted while the capsule slides back out, so the
  // text doesn't vanish mid-animation.
  const [shown, setShown] = useState(message)
  if (message && message !== shown) setShown(message)

  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [message, onDone])

  return (
    <div
      className={`toast ${message ? 'show' : ''} ${variant === 'error' ? 'error' : ''}`}
      role="status"
      aria-live="polite"
    >
      {message ?? shown}
    </div>
  )
}
