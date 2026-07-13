export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'grind_theme'
const THEME_ANIM_MS = 560

export function getStoredTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

export function storeTheme(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    /* ignore */
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return pref
}

function setThemeAttributes(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved)
  document.documentElement.style.colorScheme = resolved

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#07080A' : '#F3F4F6')
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Apply theme with a smooth transition:
 * - View Transitions API when available
 * - Fallback class that lengthens color transitions on surfaces
 */
export function applyTheme(resolved: ResolvedTheme, animate = true): void {
  const current = document.documentElement.getAttribute('data-theme')
  if (current === resolved) {
    setThemeAttributes(resolved)
    return
  }

  const run = () => setThemeAttributes(resolved)

  if (!animate || prefersReducedMotion()) {
    run()
    return
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }

  if (typeof doc.startViewTransition === 'function') {
    document.documentElement.classList.add('theme-animating')
    const transition = doc.startViewTransition(run)
    void transition.finished.finally(() => {
      document.documentElement.classList.remove('theme-animating')
    })
    return
  }

  // CSS fallback: flash a class so surfaces interpolate colors
  document.documentElement.classList.add('theme-animating')
  // Force style flush so the class applies before token swap
  void document.documentElement.offsetWidth
  run()
  window.setTimeout(() => {
    document.documentElement.classList.remove('theme-animating')
  }, THEME_ANIM_MS)
}
