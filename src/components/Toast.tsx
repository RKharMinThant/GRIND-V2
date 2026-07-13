import { useEffect } from 'react'

type Props = {
  message: string | null
  variant?: 'ok' | 'error'
  onDone: () => void
}

export function Toast({ message, variant = 'ok', onDone }: Props) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [message, onDone])

  return (
    <div className={`toast ${message ? 'show' : ''} ${variant === 'error' ? 'error' : ''}`} role="status">
      {message}
    </div>
  )
}
