/** localStorage helpers that never throw (private mode, blocked storage, SSR). */

export function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readJson<T>(key: string, fallback: T, storage: Storage | null = safeLocalStorage()): T {
  try {
    const raw = storage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/** Writes JSON; `null` removes the key. */
export function writeJson(key: string, value: unknown, storage: Storage | null = safeLocalStorage()): void {
  try {
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
