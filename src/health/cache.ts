// Last-known Fitbit data, kept on the device so the app opens instantly.
//
// iOS unloads home-screen apps in the background, so almost every open is a cold start.
// Without this, every open showed spinners and skeletons until Google answered. Now the
// app draws what it had last time and refreshes quietly when the data is stale.
//
// Keyed by account and source: a shared phone never shows one person another's data,
// and demo data never masquerades as real. Wiped on sign-out and on Fitbit disconnect.

import { readJson, safeLocalStorage, writeJson } from './storage'
import type {
  BodySectionData,
  BodySectionId,
  DailySteps,
  HealthConnection,
  HealthRecovery,
  HealthSource,
  HealthWorkout,
  TodaySummary,
} from './types'

/** How long after a sync the data counts as current. Fitbit only changes when the watch syncs. */
export const FRESH_MS = 10 * 60 * 1000

const PREFIX = 'grind_health:v1:'

export type HealthBundle = {
  connection: HealthConnection
  workouts: HealthWorkout[]
  recovery: HealthRecovery | null
  steps: DailySteps[]
  today: TodaySummary | null
}

export type HealthSnapshot = HealthBundle & {
  /** When this was fetched (ms since epoch, device clock). */
  savedAt: number
}

type StoredBundle = HealthBundle & { date: string; savedAt: number }
type StoredSection = { date: string; savedAt: number; data: unknown }

const bundleKey = (userId: string, source: HealthSource) => `${PREFIX}${userId}:${source}:bundle`
const sectionKey = (userId: string, source: HealthSource, section: BodySectionId) =>
  `${PREFIX}${userId}:${source}:section:${section}`

function isStoredBundle(value: unknown): value is StoredBundle {
  const v = value as StoredBundle | null
  return (
    !!v &&
    typeof v.date === 'string' &&
    typeof v.savedAt === 'number' &&
    typeof v.connection?.status === 'string' &&
    Array.isArray(v.workouts) &&
    Array.isArray(v.steps)
  )
}

export function writeSnapshot(
  userId: string | undefined,
  source: HealthSource,
  date: string,
  bundle: HealthBundle,
  savedAt: number,
  storage: Storage | null = safeLocalStorage(),
): void {
  if (!userId) return
  writeJson(bundleKey(userId, source), { ...bundle, date, savedAt } satisfies StoredBundle, storage)
}

/**
 * The last sync, or null. History (workouts, step counts) is always reusable; today's
 * summary and last night's recovery only on the same day — yesterday's steps must never
 * appear as today's.
 */
export function readSnapshot(
  userId: string | undefined,
  source: HealthSource,
  date: string,
  storage: Storage | null = safeLocalStorage(),
): HealthSnapshot | null {
  if (!userId) return null
  const stored = readJson<unknown>(bundleKey(userId, source), null, storage)
  if (!isStoredBundle(stored)) return null
  const sameDay = stored.date === date
  return {
    connection: stored.connection,
    workouts: stored.workouts,
    steps: stored.steps,
    recovery: sameDay ? stored.recovery : null,
    today: sameDay ? stored.today : null,
    savedAt: stored.savedAt,
  }
}

export function writeSection<S extends BodySectionId>(
  userId: string | undefined,
  source: HealthSource,
  section: S,
  date: string,
  data: BodySectionData[S],
  savedAt: number,
  storage: Storage | null = safeLocalStorage(),
): void {
  if (!userId) return
  writeJson(sectionKey(userId, source, section), { date, savedAt, data } satisfies StoredSection, storage)
}

/** A Body section describes one day, so it is only reused on that day. */
export function readSection<S extends BodySectionId>(
  userId: string | undefined,
  source: HealthSource,
  section: S,
  date: string,
  storage: Storage | null = safeLocalStorage(),
): { data: BodySectionData[S]; savedAt: number } | null {
  if (!userId) return null
  const stored = readJson<StoredSection | null>(sectionKey(userId, source, section), null, storage)
  if (!stored || stored.date !== date || typeof stored.savedAt !== 'number' || stored.data == null) return null
  return { data: stored.data as BodySectionData[S], savedAt: stored.savedAt }
}

/** Synced recently enough to skip Google. A future timestamp means the clock moved — refresh. */
export function isFresh(savedAt: number, now: number = Date.now()): boolean {
  return savedAt > 0 && savedAt <= now && now - savedAt < FRESH_MS
}

/** One account's saved health data, or every account's (sign-out). Nothing else is touched. */
export function clearHealthCache(userId?: string, storage: Storage | null = safeLocalStorage()): void {
  if (!storage) return
  const prefix = userId ? `${PREFIX}${userId}:` : PREFIX
  try {
    // Collect first: removing while iterating shifts the indices
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
