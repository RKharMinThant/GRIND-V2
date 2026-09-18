export type DistanceUnit = 'km' | 'mi'
export type WeightUnit = 'kg' | 'lb'
/** 0 = Sunday, 1 = Monday */
export type WeekStart = 0 | 1

export const DEFAULT_DISTANCE_UNIT: DistanceUnit = 'km'
export const DEFAULT_WEIGHT_UNIT: WeightUnit = 'kg'
export const DEFAULT_WEEK_START: WeekStart = 0

const MILES_PER_KM = 0.621371

export function kmToMiles(km: number): number {
  return km * MILES_PER_KM
}

/** "6.9 km" / "4.3 mi" / "—" when there's nothing to show. */
export function formatDistance(km: number | null | undefined, unit: DistanceUnit): string {
  if (km == null) return '—'
  const value = unit === 'mi' ? kmToMiles(km) : km
  return `${value.toFixed(1)} ${unit}`
}
