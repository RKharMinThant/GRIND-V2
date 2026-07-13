import { useCallback, useEffect, useState } from 'react'
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  storeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme'

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system'
    return getStoredTheme()
  })
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    if (typeof window === 'undefined') return 'dark'
    return resolveTheme(getStoredTheme())
  })

  useEffect(() => {
    const next = resolveTheme(preference)
    setResolved(next)
    applyTheme(next)
  }, [preference])

  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next = resolveTheme('system')
      setResolved(next)
      applyTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((pref: ThemePreference) => {
    storeTheme(pref)
    setPreferenceState(pref)
  }, [])

  /** Header icon: one click flips light ↔ dark (never Auto). */
  const toggleLightDark = useCallback(() => {
    const next: ThemePreference = resolved === 'dark' ? 'light' : 'dark'
    storeTheme(next)
    setPreferenceState(next)
  }, [resolved])

  return { preference, resolved, setPreference, toggleLightDark }
}
