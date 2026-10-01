// What counts as a logged rest day. Its own module because both the rules and the
// weekly report need it, and importing it from notifyRules made the two import each other.

/** A logged rest day, as the app writes it (mirrors isRestLog in src/types/database.ts). */
export function isRestWorkout(workout: string | null | undefined): boolean {
  const w = workout?.trim().toLowerCase()
  return w === 'rest' || w === 'rest day'
}
