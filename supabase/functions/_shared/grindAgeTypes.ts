// GRIND Age — the contract between data gathering, the model and the app.
// A transparent, research-based take on WHOOP Age: each input is turned into years
// older or younger than your real age. Mirrored for the app in src/health/grindAge.ts.

export type Sex = 'male' | 'female'

/** What gathering hands the model. null = not recorded / not enough data. */
export type GrindAgeInputs = {
  /** Years, with decimals, from the profile birth date */
  chronologicalAge: number
  sex: Sex
  /** Mean hours asleep per night, main sleep, last 14 nights (needs ≥5 nights) */
  sleepHours: number | null
  /** Bed/wake time variability: mean of SD(bedtime) and SD(wake time), minutes, last 14 nights (≥5) */
  sleepConsistencyMin: number | null
  /** Mean steps per day over the last 30 days (days with data, needs ≥7) */
  dailySteps: number | null
  /** Fitbit fat-burn zone minutes per week, last 30 days (≈ WHOOP zones 1–3) */
  lowerZoneMinPerWeek: number | null
  /** Fitbit cardio + peak zone minutes per week, last 30 days (≈ WHOOP zones 4–5) */
  higherZoneMinPerWeek: number | null
  /** Fitbit STRENGTH_TRAINING / WEIGHTLIFTING session minutes per week, last 30 days */
  strengthMinPerWeek: number | null
  /** Mean daily resting heart rate, last 30 days */
  restingHr: number | null
  /** Latest body measurement within 60 days */
  weightKg: number | null
  bodyFatPct: number | null
  /** Latest height from Google Health */
  heightM: number | null
}

export type GrindAgeFactorId =
  | 'sleep_hours'
  | 'sleep_consistency'
  | 'steps'
  | 'lower_zones'
  | 'higher_zones'
  | 'strength'
  | 'resting_hr'
  | 'vo2max'
  | 'lean_mass'

export type GrindAgeFactor = {
  id: GrindAgeFactorId
  /** Short label, e.g. "Sleep consistency" */
  label: string
  /** The user's value in `unit`, rounded for display; null when missing */
  value: number | null
  /** e.g. 'h', 'min', 'steps', 'min/wk', 'bpm', 'ml/kg/min', 'kg/m²' */
  unit: string
  /** Human-readable target, e.g. "7–9 h" */
  target: string
  /** Contribution in years: + makes you older, − younger. null when the input is missing */
  years: number | null
  /** True for values the model derived rather than measured (VO₂ max) */
  estimated?: boolean
}

export type GrindAgeResult = {
  chronologicalAge: number
  /** chronologicalAge + sum of available factor years, one decimal */
  grindAge: number
  factors: GrindAgeFactor[]
  missing: GrindAgeFactorId[]
}

/** One stored weekly reading, oldest first when passed to paceOfAging */
export type GrindAgeReading = {
  weekStart: string
  grindAge: number
  chronologicalAge: number
}

/** What the health-age Edge Function returns to the app */
export type GrindAgeResponse =
  | { status: 'needs_profile' }
  | { status: 'not_connected' }
  | {
      status: 'ok'
      /** Monday of the current week in the user's time zone, YYYY-MM-DD */
      weekStart: string
      computedAt: string
      result: GrindAgeResult
      /** Pace of Aging, −1 to 3; null until there are enough weekly readings */
      pace: number | null
      /** Weekly readings, oldest first, up to 12 */
      history: { weekStart: string; grindAge: number }[]
      /** True when one or more data reads failed, so this result was not saved and must not be cached */
      partial?: boolean
    }
