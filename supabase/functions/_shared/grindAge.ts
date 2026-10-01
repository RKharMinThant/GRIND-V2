// GRIND Age — how old your habits and fitness make you, in years.
//
// Method, kept deliberately simple so every number can be traced:
// 1. Each of the nine factors turns your value into an all-cause mortality hazard
//    ratio (HR) against a healthy reference level, using published meta-analyses
//    and cohorts (cited next to each factor's constants).
// 2. The HR becomes years with the Gompertz approximation: all-cause mortality
//    roughly doubles every ~8 years of age, so years = 8 × ln(HR) / ln(2).
//    Reference level → 0; better can earn modest negative years, worse adds years.
// 3. Each factor is capped at ±4 years and rounded to 0.1. GRIND Age is your real
//    age plus the sum of the factors we have data for. Missing ones are listed.
//
// Where two factors measure overlapping things (steps vs zone minutes, estimated
// VO₂ max vs resting heart rate) each one gets half its published effect, on the
// log scale, so the same habit is not counted twice. Pure on purpose: no I/O.
// A personal estimate from cohort averages, not a medical test.

import type {
  GrindAgeFactor,
  GrindAgeFactorId,
  GrindAgeInputs,
  GrindAgeReading,
  GrindAgeResult,
  Sex,
} from './grindAgeTypes.ts'

const DOUBLING_YEARS = 8
const CAP_YEARS = 4
const HALF = 0.5

const round = (x: number, decimals = 1): number => {
  const f = 10 ** decimals
  return Math.round(x * f) / f || 0 // `|| 0` turns −0 into 0
}
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))

function hrToYears(hr: number): number {
  return round(clamp((DOUBLING_YEARS * Math.log(hr)) / Math.LN2, -CAP_YEARS, CAP_YEARS))
}

/** Hazard ratio along a dose–response curve: interpolated on the log scale, flat beyond the ends. */
function curve(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    if (x <= x1) return Math.exp(Math.log(y0) + ((x - x0) / (x1 - x0)) * (Math.log(y1) - Math.log(y0)))
  }
  return points[points.length - 1][1]
}

/** HR of `x` relative to the reference `ref` on the same curve, optionally at partial weight. */
const relative = (points: [number, number][], x: number, ref: number, weight = 1): number =>
  (curve(points, x) / curve(points, ref)) ** weight

// --- Sleep duration — Cappuccio et al. 2010 (Sleep, meta of 16 cohorts): short sleep
// RR 1.12, long sleep RR 1.30, lowest risk at 7–8 h. Long sleep is partly illness
// (reverse causation), so it ramps in over 9–10 h rather than jumping.
const SLEEP_HOURS: [number, number][] = [[4, 1.19], [5, 1.12], [7, 1], [8, 1], [9, 1.1], [10, 1.3]]

// --- Sleep regularity — Windred et al. 2024 (Sleep, UK Biobank, Sleep Regularity Index):
// the least regular fifth had ~20–50% higher mortality than the median; the most regular
// a little lower. Mapped onto SD of bed/wake times with ≤ 30 min as the reference.
const SLEEP_SD_MIN: [number, number][] = [[15, 0.97], [30, 1], [60, 1.1], [90, 1.22], [120, 1.35]]

// --- Steps — Paluch et al. 2022 (Lancet Public Health, 15 cohorts): quartile medians
// ~3.5k / 5.8k / 7.8k / 10.9k steps → HR 1, 0.60, 0.55, 0.47. Risk plateaus at
// ~8–10k under 60 and ~6–8k at 60+, so the reference is 8,000 (7,000 at 60+).
// Half weight: zone minutes measure much of the same movement.
const STEPS: [number, number][] = [[3500, 1], [5800, 0.6], [8000, 0.55], [11000, 0.47]]

// --- Zone minutes — Lee et al. 2022 (Circulation, NHS/HPFS): vs none, 150–300 min/wk
// moderate → HR ~0.80, 300–600 → ~0.74; 75–150 min/wk vigorous → ~0.81, 150–300 → ~0.77.
// References are the WHO minimums (150 moderate / 75 vigorous). Each zone gets half
// weight so someone doing neither carries roughly Lee's full "inactive" penalty once.
const MODERATE_MIN: [number, number][] = [[0, 1], [150, 0.8], [300, 0.75], [600, 0.72]]
const VIGOROUS_MIN: [number, number][] = [[0, 1], [75, 0.81], [150, 0.77], [300, 0.75]]

// --- Strength — Momma et al. 2022 (BJSM meta): ~10–20% lower mortality at 30–60 min/wk.
// The meta also hints at a J-shape past ~130–140 min/wk, but on sparse data — so the
// benefit plateaus here instead of turning into a penalty for training more.
const STRENGTH_MIN: [number, number][] = [[0, 1], [30, 0.88], [60, 0.85]]

// --- Resting heart rate — Zhang et al. 2016 (CMAJ meta): RR 1.09 per +10 bpm, roughly
// linear from ~45 bpm. Reference 60 bpm.
const RHR_REF = 60
const RHR_FLOOR = 45
const RHR_PER_10 = 1.09

// --- VO₂ max — Kodama et al. 2009 (JAMA meta): RR 0.87 per +1 MET (3.5 ml/kg/min).
// Reference is the FRIEND registry 50th percentile (Kaminsky et al. 2015), fitted as a
// straight line by age per sex. Half weight: it is estimated from resting HR, which
// already scores on its own.
const MET = 3.5
const RR_PER_MET = 0.87
const expectedVo2 = (age: number, sex: Sex): number =>
  sex === 'male' ? 35.6 - 0.474 * (age - 50) : 26.6 - 0.374 * (age - 50)
// Uth's formula was derived in men and is sex-blind. FRIEND women sit ~25% below men at
// the same age while resting HR is only ~3 bpm higher, so women's estimate is scaled ×0.78.
const FEMALE_VO2_SCALE = 0.78

// --- Lean mass (FFMI, kg/m²) — Srikanthan & Karlamangla 2014 (Am J Med): highest vs
// lowest muscle mass quartile HR ~0.80; Sedlmeier et al. 2021 (AJCN, 7 cohorts): lower
// fat-free mass index, higher mortality. Kept modest: +5% risk per unit below the
// typical range, −3% per unit above it (up to 3 units).
const FFMI_RANGE: Record<Sex, [number, number]> = { male: [18, 20], female: [15, 17] }

/** Uth et al. 2004: VO₂max ≈ 15.3 × HRmax / HRrest, HRmax = 208 − 0.7 × age (Tanaka 2001). ml/kg/min. */
export function estimateVo2max(age: number, restingHr: number): number {
  return round((15.3 * (208 - 0.7 * age)) / restingHr)
}

export function computeGrindAge(inputs: GrindAgeInputs): GrindAgeResult {
  const age = inputs.chronologicalAge
  const { sex } = inputs
  const stepRef = age >= 60 ? 7000 : 8000
  const vo2Ref = round(expectedVo2(age, sex))
  const [ffmiLo, ffmiHi] = FFMI_RANGE[sex]

  const vo2 =
    inputs.restingHr === null
      ? null
      : estimateVo2max(age, inputs.restingHr) * (sex === 'female' ? FEMALE_VO2_SCALE : 1)
  const { weightKg: w, bodyFatPct: bf, heightM: h } = inputs
  const ffmi = w === null || bf === null || h === null ? null : (w * (1 - bf / 100)) / (h * h)

  // [id, label, unit, target, value, display decimals, value → HR]
  const specs: [GrindAgeFactorId, string, string, string, number | null, number, (v: number) => number][] = [
    ['sleep_hours', 'Sleep', 'h', '7–8 h', inputs.sleepHours, 1, (v) => curve(SLEEP_HOURS, v)],
    ['sleep_consistency', 'Sleep consistency', 'min', '≤ 30 min drift', inputs.sleepConsistencyMin, 0,
      (v) => curve(SLEEP_SD_MIN, v)],
    ['steps', 'Daily steps', 'steps', `${stepRef.toLocaleString('en-US')}+ steps`, inputs.dailySteps, 0,
      // Scale steps so the curve's plateau lands on this age group's reference
      (v) => relative(STEPS, (v * 8000) / stepRef, 8000, HALF)],
    ['lower_zones', 'Easy cardio (zones 1–3)', 'min/wk', '150+ min/wk', inputs.lowerZoneMinPerWeek, 0,
      (v) => relative(MODERATE_MIN, v, 150, HALF)],
    ['higher_zones', 'Hard cardio (zones 4–5)', 'min/wk', '75+ min/wk', inputs.higherZoneMinPerWeek, 0,
      (v) => relative(VIGOROUS_MIN, v, 75, HALF)],
    ['strength', 'Strength training', 'min/wk', '60+ min/wk', inputs.strengthMinPerWeek, 0,
      (v) => relative(STRENGTH_MIN, v, 60)],
    ['resting_hr', 'Resting heart rate', 'bpm', `≤ ${RHR_REF} bpm`, inputs.restingHr, 0,
      (v) => RHR_PER_10 ** ((Math.max(v, RHR_FLOOR) - RHR_REF) / 10)],
    ['vo2max', 'VO₂ max', 'ml/kg/min', `≥ ${vo2Ref} ml/kg/min`, vo2, 1,
      (v) => RR_PER_MET ** ((HALF * (v - vo2Ref)) / MET)],
    ['lean_mass', 'Lean mass (FFMI)', 'kg/m²', `${ffmiLo}–${ffmiHi} kg/m²`, ffmi, 1,
      (v) => (v < ffmiLo ? 1.05 ** (ffmiLo - v) : v > ffmiHi ? 0.97 ** Math.min(v - ffmiHi, 3) : 1)],
  ]

  const factors: GrindAgeFactor[] = specs.map(([id, label, unit, target, value, decimals, toHr]) => ({
    id,
    label,
    value: value === null ? null : round(value, decimals),
    unit,
    target,
    years: value === null ? null : hrToYears(toHr(value)),
    ...(id === 'vo2max' ? { estimated: true } : {}),
  }))

  const sum = factors.reduce((acc, f) => acc + (f.years ?? 0), 0)
  return {
    chronologicalAge: round(age),
    grindAge: round(age + sum),
    factors,
    missing: factors.filter((f) => f.years === null).map((f) => f.id),
  }
}

const MS_PER_YEAR = 365.25 * 86_400_000
const PACE_WINDOW_DAYS = 26 * 7
const PACE_MIN_SPAN_DAYS = 12 * 7

/**
 * Pace of Aging: how many GRIND-years you gain per calendar year, from recent weekly
 * readings (oldest first). 1 = ageing at calendar speed, < 1 slower, > 1 faster.
 * Least-squares slope of (grindAge − chronologicalAge) over the readings from the last
 * 26 weeks, plus 1, clamped to [−1, 3]. Null until those readings number at least 4 and
 * span at least 12 weeks, so a few early weeks of noise can't pass for a trend.
 */
export function paceOfAging(history: GrindAgeReading[]): number | null {
  if (history.length === 0) return null
  const newest = Date.parse(history[history.length - 1].weekStart)
  const recent = history.filter((r) => newest - Date.parse(r.weekStart) <= PACE_WINDOW_DAYS * 86_400_000)
  if (recent.length < 4) return null
  if (newest - Date.parse(recent[0].weekStart) < PACE_MIN_SPAN_DAYS * 86_400_000) return null
  const t0 = Date.parse(recent[0].weekStart)
  const xs = recent.map((r) => (Date.parse(r.weekStart) - t0) / MS_PER_YEAR)
  const ys = recent.map((r) => r.grindAge - r.chronologicalAge)
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0
  let den = 0
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my)
    den += (x - mx) ** 2
  })
  if (den === 0) return null // all readings on the same date: no trend to measure
  return round(clamp(1 + num / den, -1, 3))
}
